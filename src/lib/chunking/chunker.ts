/**
 * Text chunking with overlap for embedding generation
 *
 * Uses tiktoken for accurate token counting (same tokenizer as OpenAI models)
 * Supports German language and preserves semantic boundaries where possible
 */

import { encoding_for_model, Tiktoken } from 'tiktoken';
import { Chunk, ChunkingConfig, ChunkingResult } from '../../types/chunk';
import { preprocessContent, isValidContent } from './preprocessor';
import * as logger from '../utils/logger';

// Default configuration
const DEFAULT_MAX_TOKENS = 400;
const DEFAULT_OVERLAP = 50;
const ENCODING_MODEL = 'text-embedding-3-small'; // cl100k_base encoding

// Singleton encoder instance (encoding is expensive to initialize)
let encoder: Tiktoken | null = null;

/**
 * Gets or initializes the tiktoken encoder
 */
function getEncoder(): Tiktoken {
  if (!encoder) {
    try {
      encoder = encoding_for_model(ENCODING_MODEL);
      logger.debug('Tiktoken encoder initialized', { model: ENCODING_MODEL });
    } catch (err) {
      logger.error('Failed to initialize tiktoken encoder', { error: err });
      throw new Error('Failed to initialize tiktoken encoder');
    }
  }
  return encoder;
}

/**
 * Counts tokens in text using tiktoken
 *
 * @param text - Text to count tokens for
 * @returns Number of tokens
 */
export function countTokens(text: string): number {
  const enc = getEncoder();
  const tokens = enc.encode(text);
  return tokens.length;
}

/**
 * Splits text into chunks at token boundaries
 *
 * @param text - Text to split
 * @param maxTokens - Maximum tokens per chunk
 * @param overlap - Token overlap between chunks
 * @returns Array of text chunks
 */
function splitIntoTokenChunks(
  text: string,
  maxTokens: number,
  overlap: number
): string[] {
  const enc = getEncoder();
  const tokens = enc.encode(text);
  const chunks: string[] = [];

  let startIdx = 0;

  while (startIdx < tokens.length) {
    // Calculate end index for this chunk
    const endIdx = Math.min(startIdx + maxTokens, tokens.length);

    // Extract chunk tokens
    const chunkTokens = tokens.slice(startIdx, endIdx);

    // Decode tokens back to text (returns Uint8Array, need to convert to string)
    const bytes = enc.decode(chunkTokens);
    const chunkText = new TextDecoder().decode(bytes);
    chunks.push(chunkText);

    // Move start index forward (with overlap)
    // If this is the last chunk, we're done
    if (endIdx === tokens.length) {
      break;
    }

    // Otherwise, move forward by (maxTokens - overlap)
    startIdx += maxTokens - overlap;
  }

  return chunks;
}

/**
 * Attempts to split text at semantic boundaries (paragraphs, sentences)
 *
 * This is a best-effort approach - if semantic splitting would create
 * chunks that are too large, falls back to token-based splitting
 *
 * @param text - Text to split
 * @param maxTokens - Maximum tokens per chunk
 * @returns Array of text segments
 */
function splitAtSemanticBoundaries(text: string, maxTokens: number): string[] {
  // Try splitting by double newlines (paragraphs) first
  const paragraphs = text.split(/\n\n+/);

  const segments: string[] = [];
  let currentSegment = '';

  for (const paragraph of paragraphs) {
    const testSegment = currentSegment
      ? `${currentSegment}\n\n${paragraph}`
      : paragraph;

    const tokenCount = countTokens(testSegment);

    if (tokenCount <= maxTokens) {
      // Fits in current segment
      currentSegment = testSegment;
    } else {
      // Would exceed max tokens
      if (currentSegment) {
        // Save current segment
        segments.push(currentSegment);
      }

      // Check if single paragraph is too large
      const paragraphTokens = countTokens(paragraph);
      if (paragraphTokens > maxTokens) {
        // Paragraph itself is too large, split by sentences
        const sentences = paragraph.split(/(?<=[.!?])\s+/);
        let sentenceSegment = '';

        for (const sentence of sentences) {
          const testSentence = sentenceSegment
            ? `${sentenceSegment} ${sentence}`
            : sentence;

          if (countTokens(testSentence) <= maxTokens) {
            sentenceSegment = testSentence;
          } else {
            if (sentenceSegment) {
              segments.push(sentenceSegment);
            }
            sentenceSegment = sentence;
          }
        }

        if (sentenceSegment) {
          currentSegment = sentenceSegment;
        } else {
          currentSegment = '';
        }
      } else {
        currentSegment = paragraph;
      }
    }
  }

  // Add remaining segment
  if (currentSegment) {
    segments.push(currentSegment);
  }

  return segments.length > 0 ? segments : [text];
}

/**
 * Chunks text content with overlap for embedding generation
 *
 * Process:
 * 1. Preprocess content (clean, normalize)
 * 2. Validate content is suitable for embedding
 * 3. Attempt semantic splitting (paragraphs, sentences)
 * 4. Apply token-based chunking with overlap
 * 5. Create chunk metadata
 *
 * @param content - Raw text content to chunk
 * @param config - Chunking configuration
 * @returns Chunking result with chunks and metadata
 */
export function chunkText(
  content: string,
  config: ChunkingConfig = {}
): ChunkingResult {
  const maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
  const overlap = config.overlap ?? DEFAULT_OVERLAP;

  logger.debug('Starting text chunking', {
    contentLength: content.length,
    maxTokens,
    overlap,
  });

  // Step 1: Preprocess content
  const processed = preprocessContent(content);

  // Step 2: Validate content
  if (!isValidContent(processed)) {
    logger.warn('Content is not valid for chunking', {
      originalLength: content.length,
      processedLength: processed.length,
    });

    return {
      chunks: [],
      originalLength: content.length,
      totalTokens: 0,
      wasChunked: false,
    };
  }

  // Step 3: Count total tokens
  const totalTokens = countTokens(processed);

  logger.debug('Content preprocessed and validated', {
    originalLength: content.length,
    processedLength: processed.length,
    totalTokens,
  });

  // Step 4: Check if chunking is needed
  if (totalTokens <= maxTokens) {
    // Content fits in a single chunk
    logger.debug('Content fits in single chunk', { totalTokens, maxTokens });

    const chunk: Chunk = {
      text: processed,
      startIndex: 0,
      endIndex: processed.length,
      chunkIndex: 0,
      totalChunks: 1,
      tokenCount: totalTokens,
    };

    return {
      chunks: [chunk],
      originalLength: content.length,
      totalTokens,
      wasChunked: false,
    };
  }

  // Step 5: Content needs chunking
  logger.debug('Content requires chunking', { totalTokens, maxTokens });

  // Try semantic splitting first
  const semanticSegments = splitAtSemanticBoundaries(processed, maxTokens);

  // Apply token-based chunking with overlap to each segment
  const allChunkTexts: string[] = [];

  for (const segment of semanticSegments) {
    const segmentTokens = countTokens(segment);

    if (segmentTokens <= maxTokens) {
      // Segment fits as-is
      allChunkTexts.push(segment);
    } else {
      // Need to split segment further
      const tokenChunks = splitIntoTokenChunks(segment, maxTokens, overlap);
      allChunkTexts.push(...tokenChunks);
    }
  }

  // Step 6: Create chunk objects with metadata
  const chunks: Chunk[] = allChunkTexts.map((text, index) => {
    // Find approximate character positions (best effort)
    let startIndex = 0;
    for (let i = 0; i < index; i++) {
      startIndex += allChunkTexts[i].length;
    }

    return {
      text,
      startIndex,
      endIndex: startIndex + text.length,
      chunkIndex: index,
      totalChunks: allChunkTexts.length,
      tokenCount: countTokens(text),
    };
  });

  logger.info('Text chunking completed', {
    originalLength: content.length,
    totalTokens,
    chunksCreated: chunks.length,
    avgTokensPerChunk: Math.round(totalTokens / chunks.length),
  });

  return {
    chunks,
    originalLength: content.length,
    totalTokens,
    wasChunked: true,
  };
}

/**
 * Frees the tiktoken encoder resources
 * Should be called when shutting down the application
 */
export function cleanup(): void {
  if (encoder) {
    encoder.free();
    encoder = null;
    logger.debug('Tiktoken encoder cleaned up');
  }
}
