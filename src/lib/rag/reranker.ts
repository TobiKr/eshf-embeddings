/**
 * RAG Reranking Module - Jina AI Integration
 *
 * Provides semantic reranking of retrieved chunks using Jina AI's cross-encoder models.
 * Includes adaptive top-k selection, relevance filtering, and graceful fallback.
 */

import * as logger from '../utils/logger';

// ============================================================================
// Configuration Types
// ============================================================================

export interface RerankerConfig {
  enabled: boolean;
  apiKey: string;
  model: string;
  minScore: number;
  timeout: number;
  maxRetries: number;
  adaptiveTopK: {
    enabled: boolean;
    min: number;
    max: number;
    scoreGapThreshold: number;
  };
}

// ============================================================================
// Result Types
// ============================================================================

export interface ScoredChunk {
  chunk: any; // Original Pinecone match object
  originalScore: number; // Cosine similarity from vector search
  rerankerScore: number; // Jina reranker relevance score (0-1)
}

export interface RerankResult {
  chunks: ScoredChunk[];
  metrics: {
    originalCount: number;
    filteredCount: number;
    finalCount: number;
    rerankingLatency: number;
    scoreMean: number;
    scoreStdDev: number;
  };
}

// ============================================================================
// Jina API Types
// ============================================================================

interface JinaRerankRequest {
  model: string;
  query: string;
  documents: string[];
  top_n?: number;
}

interface JinaRerankResponse {
  model: string;
  usage: {
    total_tokens: number;
    prompt_tokens: number;
  };
  results: Array<{
    index: number;
    relevance_score: number;
    document: {
      text: string;
    };
  }>;
}

// ============================================================================
// Main Reranking Function
// ============================================================================

/**
 * Reranks retrieved chunks using Jina AI's semantic reranker
 *
 * Performs a two-stage retrieval process:
 * 1. Vector search provides candidate chunks (fast but approximate)
 * 2. Cross-encoder reranks candidates by semantic relevance (slower but accurate)
 *
 * Features:
 * - Jina AI API integration with retry logic and timeout
 * - Relevance score filtering (removes low-quality matches)
 * - Adaptive top-k selection (finds natural cutoff points in score distribution)
 * - Graceful fallback to original scores if API fails
 *
 * @param query - User's question/query
 * @param chunks - Candidate chunks from vector search
 * @param config - Reranker configuration
 * @returns Reranked chunks with metrics
 */
export async function rerankChunks(
  query: string,
  chunks: any[],
  config: RerankerConfig
): Promise<RerankResult> {
  const startTime = Date.now();

  // Early return if disabled or no chunks
  if (!config.enabled || chunks.length === 0) {
    return {
      chunks: chunks.map(c => ({
        chunk: c,
        originalScore: c.score || 0,
        rerankerScore: c.score || 0,
      })),
      metrics: {
        originalCount: chunks.length,
        filteredCount: 0,
        finalCount: chunks.length,
        rerankingLatency: 0,
        scoreMean: 0,
        scoreStdDev: 0,
      },
    };
  }

  logger.info('Starting Jina AI reranking', {
    queryLength: query.length,
    chunkCount: chunks.length,
    model: config.model,
  });

  try {
    // Call Jina API with retry logic
    const jinaResults = await callJinaRerankerWithRetry(query, chunks, config);

    // Map Jina results back to chunks with scores
    const scoredChunks: ScoredChunk[] = jinaResults.results.map(result => ({
      chunk: chunks[result.index],
      originalScore: chunks[result.index].score || 0,
      rerankerScore: result.relevance_score,
    }));

    // Filter by minimum score threshold
    const filteredChunks = scoredChunks.filter(
      sc => sc.rerankerScore >= config.minScore
    );

    logger.info('Reranking filtering complete', {
      originalCount: chunks.length,
      filteredCount: chunks.length - filteredChunks.length,
    });

    // Adaptive top-k selection
    let finalChunks = filteredChunks;
    if (config.adaptiveTopK.enabled && filteredChunks.length > 0) {
      finalChunks = selectAdaptiveTopK(filteredChunks, config.adaptiveTopK);
    }

    // Calculate metrics
    const rerankingLatency = Date.now() - startTime;
    const scores = finalChunks.map(sc => sc.rerankerScore);
    const scoreMean = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;
    const scoreStdDev = scores.length > 0
      ? Math.sqrt(
          scores.map(s => Math.pow(s - scoreMean, 2)).reduce((a, b) => a + b, 0) / scores.length
        )
      : 0;

    logger.info('Reranking complete', {
      finalCount: finalChunks.length,
      rerankingLatency,
      scoreMean: scoreMean.toFixed(3),
      scoreStdDev: scoreStdDev.toFixed(3),
      jinaTokensUsed: jinaResults.usage.total_tokens,
    });

    return {
      chunks: finalChunks,
      metrics: {
        originalCount: chunks.length,
        filteredCount: chunks.length - filteredChunks.length,
        finalCount: finalChunks.length,
        rerankingLatency,
        scoreMean,
        scoreStdDev,
      },
    };
  } catch (error) {
    logger.error('Jina reranking failed, falling back to original scores', { error });

    // Fallback: return original chunks with vector search scores
    return {
      chunks: chunks.map(c => ({
        chunk: c,
        originalScore: c.score || 0,
        rerankerScore: c.score || 0,
      })),
      metrics: {
        originalCount: chunks.length,
        filteredCount: 0,
        finalCount: chunks.length,
        rerankingLatency: Date.now() - startTime,
        scoreMean: 0,
        scoreStdDev: 0,
      },
    };
  }
}

// ============================================================================
// Jina API Integration
// ============================================================================

/**
 * Calls Jina reranker API with retry logic and exponential backoff
 */
async function callJinaRerankerWithRetry(
  query: string,
  chunks: any[],
  config: RerankerConfig,
  retryCount = 0
): Promise<JinaRerankResponse> {
  try {
    return await callJinaReranker(query, chunks, config);
  } catch (error: any) {
    if (retryCount < config.maxRetries && isRetryableError(error)) {
      const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
      logger.warn(`Jina API call failed, retrying in ${delay}ms`, {
        retryCount: retryCount + 1,
        maxRetries: config.maxRetries,
        error: error.message,
      });
      await sleep(delay);
      return callJinaRerankerWithRetry(query, chunks, config, retryCount + 1);
    }
    throw error;
  }
}

/**
 * Makes a single call to Jina reranker API
 */
async function callJinaReranker(
  query: string,
  chunks: any[],
  config: RerankerConfig
): Promise<JinaRerankResponse> {
  // Extract text content from chunks
  const documents = chunks.map(chunk => {
    // Try various metadata fields to get text content
    const metadata = chunk.metadata || {};
    return metadata.postText || metadata.contentPreview || metadata.text || '';
  });

  const requestBody: JinaRerankRequest = {
    model: config.model,
    query: query,
    documents: documents,
    top_n: chunks.length, // Return all, we'll filter later
  };

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    const response = await fetch('https://api.jina.ai/v1/rerank', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jina API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as JinaRerankResponse;
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Jina API timeout after ${config.timeout}ms`);
    }
    throw error;
  }
}

/**
 * Determines if an error is retryable (network issues, timeouts, 5xx errors)
 */
function isRetryableError(error: any): boolean {
  const message = (error.message || '').toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504')
  );
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Adaptive Top-K Selection
// ============================================================================

/**
 * Selects optimal number of chunks based on score distribution
 *
 * Strategy:
 * 1. Ensure minimum number of chunks (config.min)
 * 2. Look for significant score gaps that indicate quality dropoff
 * 3. Cut at the gap, but respect maximum limit (config.max)
 *
 * Example:
 * - Scores: [0.95, 0.92, 0.88, 0.45, 0.42] with gap threshold 0.1
 * - Gap detected at position 3 (0.88 - 0.45 = 0.43 > 0.1)
 * - Return first 3 chunks
 *
 * @param chunks - Scored chunks sorted by reranker score (descending)
 * @param config - Adaptive top-k configuration
 * @returns Selected chunks up to the determined cutoff point
 */
function selectAdaptiveTopK(
  chunks: ScoredChunk[],
  config: { min: number; max: number; scoreGapThreshold: number }
): ScoredChunk[] {
  if (chunks.length <= config.min) {
    return chunks;
  }

  // Find the first significant score gap after minimum threshold
  for (let i = config.min - 1; i < chunks.length - 1 && i < config.max - 1; i++) {
    const gap = chunks[i].rerankerScore - chunks[i + 1].rerankerScore;
    if (gap > config.scoreGapThreshold) {
      logger.debug('Adaptive top-k: score gap detected', {
        position: i + 1,
        gap: gap.toFixed(3),
        scoreAbove: chunks[i].rerankerScore.toFixed(3),
        scoreBelow: chunks[i + 1].rerankerScore.toFixed(3),
      });
      return chunks.slice(0, i + 1);
    }
  }

  // No significant gap found, use max limit
  logger.debug('Adaptive top-k: no significant gap found, using max limit', {
    max: config.max,
  });
  return chunks.slice(0, config.max);
}

// ============================================================================
// Configuration Helper
// ============================================================================

/**
 * Creates reranker configuration from environment variables
 */
export function getRerankerConfigFromEnv(): RerankerConfig {
  return {
    enabled: process.env.RERANKER_ENABLED !== 'false',
    apiKey: process.env.JINA_API_KEY || '',
    model: process.env.JINA_RERANKER_MODEL || 'jina-reranker-v2-base-multilingual',
    minScore: parseFloat(process.env.RERANKER_MIN_SCORE || '0.3'),
    timeout: parseInt(process.env.RERANKER_TIMEOUT_MS || '5000', 10),
    maxRetries: parseInt(process.env.RERANKER_MAX_RETRIES || '2', 10),
    adaptiveTopK: {
      enabled: true,
      min: parseInt(process.env.RERANKER_ADAPTIVE_TOPK_MIN || '3', 10),
      max: parseInt(process.env.RERANKER_ADAPTIVE_TOPK_MAX || '15', 10),
      scoreGapThreshold: parseFloat(process.env.RERANKER_SCORE_GAP_THRESHOLD || '0.1'),
    },
  };
}
