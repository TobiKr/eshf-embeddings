/**
 * EmbeddingProcessor Function (Queue Trigger)
 *
 * Processes posts from the 'posts-to-process' queue,
 * chunks the content, generates embeddings via OpenAI API,
 * and enqueues results to the 'embeddings-ready' queue.
 *
 * Each post may generate multiple embeddings (one per chunk).
 */

import { app, InvocationContext } from '@azure/functions';
import { generateEmbedding } from './lib/openai/embeddings';
import { enqueueMessage, ensureQueueExists } from './lib/queue/queueClient';
import { PostQueueMessage, EmbeddingResult, ChunkMetadata } from './types/queue';
import { isRateLimitError } from './lib/utils/errors';
import { chunkText } from './lib/chunking';
import * as logger from './lib/utils/logger';
import { trackEvent, trackMetric } from './lib/utils/telemetry';
import { startTransaction, setTag, addBreadcrumb } from './lib/utils/sentry';

const INPUT_QUEUE = 'posts-to-process';
const OUTPUT_QUEUE = 'embeddings-ready';

/**
 * Queue-triggered function that generates embeddings for posts
 */
async function embeddingProcessorHandler(
  queueItem: unknown,
  context: InvocationContext
): Promise<void> {
  const startTime = Date.now();

  // Start Sentry transaction for performance monitoring
  const transaction = startTransaction('embeddingProcessor', 'queue.process');
  setTag('function', 'embeddingProcessor');
  setTag('invocationId', context.invocationId);

  logger.info('EmbeddingProcessor function triggered', {
    functionName: context.functionName,
    invocationId: context.invocationId,
  });

  try {
    // Parse the queue message
    const message = queueItem as PostQueueMessage;

    if (!message || !message.postId || !message.content) {
      logger.error('Invalid queue message format', { message });
      throw new Error('Invalid queue message format');
    }

    logger.info('Processing post for embedding', {
      postId: message.postId,
      contentLength: message.content.length,
      category: message.metadata.category,
    });

    // Add Sentry context
    setTag('postId', message.postId);
    setTag('category', message.metadata.category || 'unknown');
    addBreadcrumb(
      `Processing post ${message.postId}`,
      'processing',
      'info',
      {
        postId: message.postId,
        contentLength: message.content.length,
        category: message.metadata.category,
      }
    );

    // Ensure output queue exists
    await ensureQueueExists(OUTPUT_QUEUE);

    // Step 1: Chunk the content
    const chunkingResult = chunkText(message.content);

    logger.info('Content chunked', {
      postId: message.postId,
      totalChunks: chunkingResult.chunks.length,
      totalTokens: chunkingResult.totalTokens,
      wasChunked: chunkingResult.wasChunked,
    });

    // Validate chunking result
    if (chunkingResult.chunks.length === 0) {
      logger.warn('No valid chunks created from content', {
        postId: message.postId,
        contentLength: message.content.length,
      });
      return; // Skip this post
    }

    // Step 2: Generate embeddings for each chunk
    const embeddingPromises = chunkingResult.chunks.map(async (chunk) => {
      logger.debug('Generating embedding for chunk', {
        postId: message.postId,
        chunkIndex: chunk.chunkIndex,
        tokenCount: chunk.tokenCount,
      });

      const embedding = await generateEmbedding(chunk.text);

      // Create chunk metadata (only if post was actually chunked)
      const chunkMetadata: ChunkMetadata | undefined = chunkingResult.wasChunked
        ? {
            chunkIndex: chunk.chunkIndex,
            totalChunks: chunk.totalChunks,
            tokenCount: chunk.tokenCount,
            startIndex: chunk.startIndex,
            endIndex: chunk.endIndex,
          }
        : undefined;

      // Create embedding result message
      const embeddingResult: EmbeddingResult = {
        postId: message.postId,
        embedding,
        metadata: message.metadata,
        timestamp: new Date().toISOString(),
        chunkMetadata,
        postText: chunk.text,
      };

      // Enqueue to embeddings-ready queue
      await enqueueMessage(OUTPUT_QUEUE, embeddingResult);

      logger.debug('Embedding enqueued for chunk', {
        postId: message.postId,
        chunkIndex: chunk.chunkIndex,
        dimensions: embedding.length,
      });
    });

    // Wait for all embeddings to be generated and enqueued
    await Promise.all(embeddingPromises);

    const duration = Date.now() - startTime;

    logger.info('EmbeddingProcessor completed', {
      postId: message.postId,
      chunksProcessed: chunkingResult.chunks.length,
      durationMs: duration,
    });

    // Track success event and metrics
    trackEvent(
      'EmbeddingProcessor.Success',
      {
        postId: message.postId,
        category: message.metadata.category || 'unknown',
        wasChunked: chunkingResult.wasChunked.toString(),
      },
      {
        chunksProcessed: chunkingResult.chunks.length,
        totalTokens: chunkingResult.totalTokens,
        durationMs: duration,
      }
    );

    trackMetric('EmbeddingProcessor.ChunksPerPost', chunkingResult.chunks.length, {
      category: message.metadata.category || 'unknown',
    });
    trackMetric('EmbeddingProcessor.ProcessingTime', duration, {
      chunksProcessed: chunkingResult.chunks.length.toString(),
    });

    // Mark transaction as successful
    transaction?.setStatus('ok');
  } catch (err) {
    const error = err as Error;

    // Mark transaction as failed
    transaction?.setStatus('internal_error');

    // Check if it's a rate limit error
    if (isRateLimitError(error)) {
      logger.warn('Rate limit error, message will retry', {
        error: error.message,
        functionName: context.functionName,
      });

      // Track rate limit event
      trackEvent('EmbeddingProcessor.RateLimitError', {
        errorMessage: error.message,
      });

      // Re-throw to trigger Azure Functions retry mechanism
      throw error;
    }

    // For other errors, log and re-throw to move to poison queue after max retries
    logger.logError('EmbeddingProcessor failed', error, {
      functionName: context.functionName,
    });

    // Track failure event
    trackEvent('EmbeddingProcessor.Failure', {
      errorType: error.name,
      errorMessage: error.message,
    });

    throw error;
  } finally {
    // Finish Sentry transaction
    transaction?.finish();
  }
}

// Register the queue-triggered function
// cardinality: 'one' means process one message at a time (Consumption Plan optimization)
app.storageQueue('embeddingProcessor', {
  queueName: INPUT_QUEUE,
  connection: 'AzureWebJobsStorage',
  handler: embeddingProcessorHandler,
});
