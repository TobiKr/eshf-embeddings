/**
 * OpenAI embeddings generation with retry logic
 */

import { getOpenAIClient, getEmbeddingModel } from './client';
import { RateLimitError, EmbeddingError } from '../utils/errors';
import * as logger from '../utils/logger';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1 second

/**
 * Sleeps for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generates embeddings for the given content with exponential backoff retry logic
 *
 * @param content - The text content to generate embeddings for
 * @param retryCount - Current retry attempt (used internally for recursion)
 * @returns Array of embedding values (3072 dimensions for text-embedding-3-large)
 * @throws RateLimitError if max retries exceeded
 * @throws EmbeddingError for other failures
 */
export async function generateEmbedding(
  content: string,
  retryCount = 0
): Promise<number[]> {
  const client = getOpenAIClient();
  const model = getEmbeddingModel();
  const startTime = Date.now();

  try {
    logger.debug('Generating embedding', {
      contentLength: content.length,
      model,
      retryCount
    });

    const response = await client.embeddings.create({
      model,
      input: content,
      encoding_format: 'float',
    });

    const embedding = response.data[0].embedding;
    const duration = Date.now() - startTime;

    logger.debug('Embedding generated successfully', {
      dimensions: embedding.length,
      model,
    });

    return embedding;
  } catch (err) {
    const error = err as any;
    const duration = Date.now() - startTime;

    // Check if it's a rate limit error (429 status code)
    if (error.status === 429 || error.code === 'rate_limit_exceeded') {
      const retryAfter = error.headers?.['retry-after']
        ? parseInt(error.headers['retry-after'], 10) * 1000
        : BASE_DELAY_MS * Math.pow(2, retryCount); // Exponential backoff: 1s, 2s, 4s

      logger.warn('OpenAI rate limit hit', {
        retryCount,
        retryAfter,
        maxRetries: MAX_RETRIES,
      });

      if (retryCount < MAX_RETRIES) {
        logger.info(`Retrying after ${retryAfter}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        await sleep(retryAfter);
        return generateEmbedding(content, retryCount + 1);
      } else {
        const rateLimitError = new RateLimitError(
          `OpenAI rate limit exceeded after ${MAX_RETRIES} retries`,
          retryAfter
        );
        logger.logError('Max retries exceeded for rate limit', rateLimitError);

        throw rateLimitError;
      }
    }

    // For other errors, wrap and throw
    const embeddingError = new EmbeddingError(
      'Failed to generate embedding',
      error instanceof Error ? error : new Error(String(error))
    );
    logger.logError('Embedding generation failed', embeddingError, {
      errorStatus: error.status,
      errorCode: error.code,
    });

    throw embeddingError;
  }
}

/**
 * Validates that an embedding has the expected dimensions
 *
 * @param embedding - The embedding array to validate
 * @param expectedDimensions - Expected number of dimensions (default: 3072 for text-embedding-3-large)
 * @returns true if valid, false otherwise
 */
export function validateEmbedding(
  embedding: number[],
  expectedDimensions = 3072
): boolean {
  if (!Array.isArray(embedding)) {
    logger.error('Embedding is not an array');
    return false;
  }

  if (embedding.length !== expectedDimensions) {
    logger.error('Embedding has incorrect dimensions', {
      actual: embedding.length,
      expected: expectedDimensions,
    });
    return false;
  }

  if (!embedding.every((val) => typeof val === 'number' && !isNaN(val))) {
    logger.error('Embedding contains invalid values');
    return false;
  }

  return true;
}
