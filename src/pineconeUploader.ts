/**
 * PineconeUploader Function (Queue Trigger)
 *
 * Processes embeddings from the 'embeddings-ready' queue,
 * upserts vectors to Pinecone, and updates Cosmos DB status.
 */

import { app, InvocationContext } from '@azure/functions';
import { upsertVector, PineconeVector } from './lib/pinecone/upsert';
import { formatMetadataFromPostMetadata } from './lib/pinecone/metadata';
import { updateProcessedStatus } from './lib/cosmos/queries';
import { EmbeddingResult } from './types/queue';
import * as logger from './lib/utils/logger';
import { trackEvent, trackMetric } from './lib/utils/telemetry';
import { startTransaction, setTag, addBreadcrumb } from './lib/utils/sentry';

const INPUT_QUEUE = 'embeddings-ready';

/**
 * Queue-triggered function that uploads embeddings to Pinecone
 */
async function pineconeUploaderHandler(
  queueItem: unknown,
  context: InvocationContext
): Promise<void> {
  const startTime = Date.now();

  // Start Sentry transaction for performance monitoring
  const transaction = startTransaction('pineconeUploader', 'queue.process');
  setTag('function', 'pineconeUploader');
  setTag('invocationId', context.invocationId);

  logger.info('PineconeUploader function triggered', {
    functionName: context.functionName,
    invocationId: context.invocationId,
  });

  try {
    // Parse the queue message
    const message = queueItem as EmbeddingResult;

    if (!message || !message.postId || !message.embedding || !message.metadata) {
      logger.error('Invalid queue message format', { message });
      throw new Error('Invalid queue message format');
    }

    logger.info('Uploading embedding to Pinecone', {
      postId: message.postId,
      dimensions: message.embedding.length,
      category: message.metadata.category,
    });

    // Add Sentry context
    setTag('postId', message.postId);
    setTag('category', message.metadata.category || 'unknown');
    addBreadcrumb(
      `Uploading vector for post ${message.postId}`,
      'upload',
      'info',
      {
        postId: message.postId,
        dimensions: message.embedding.length,
        category: message.metadata.category,
      }
    );

    // Create Pinecone vector ID (use postId as vector ID)
    const vectorId = message.postId;

    // Format metadata for Pinecone (include postText)
    const metadata = formatMetadataFromPostMetadata(
      message.metadata,
      message.postText
    );

    // Create Pinecone vector
    const vector: PineconeVector = {
      id: vectorId,
      values: message.embedding,
      metadata,
    };

    // Upsert to Pinecone
    await upsertVector(vector);

    logger.info('Vector upserted to Pinecone', {
      vectorId,
      postId: message.postId,
    });

    // Update Cosmos DB to mark post as processed
    await updateProcessedStatus(
      message.postId,
      message.metadata.threadId,
      vectorId
    );

    const duration = Date.now() - startTime;

    logger.info('PineconeUploader completed', {
      postId: message.postId,
      vectorId,
      durationMs: duration,
    });

    // Track success event and metrics
    trackEvent(
      'PineconeUploader.Success',
      {
        postId: message.postId,
        vectorId,
        category: message.metadata.category || 'unknown',
      },
      {
        embeddingDimensions: message.embedding.length,
        durationMs: duration,
      }
    );

    trackMetric('PineconeUploader.ProcessingTime', duration, {
      category: message.metadata.category || 'unknown',
    });

    // Mark transaction as successful
    transaction?.setStatus('ok');
  } catch (err) {
    const error = err as Error;

    // Mark transaction as failed
    transaction?.setStatus('internal_error');

    logger.logError('PineconeUploader failed', error, {
      functionName: context.functionName,
    });

    // Track failure event
    trackEvent('PineconeUploader.Failure', {
      errorType: error.name,
      errorMessage: error.message,
    });

    // Re-throw to trigger retry mechanism
    // After maxDequeueCount (5), message will move to poison queue
    throw error;
  } finally {
    // Finish Sentry transaction
    transaction?.finish();
  }
}

// Register the queue-triggered function
// Processes one message at a time (default cardinality: 'one')
app.storageQueue('pineconeUploader', {
  queueName: INPUT_QUEUE,
  connection: 'AzureWebJobsStorage',
  handler: pineconeUploaderHandler,
});
