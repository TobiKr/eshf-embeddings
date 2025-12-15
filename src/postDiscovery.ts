/**
 * PostDiscovery Function (Timer Trigger)
 *
 * Runs every 5 minutes to discover unprocessed forum posts from Cosmos DB
 * and enqueue them for embedding generation.
 */

import { app, InvocationContext, Timer } from '@azure/functions';
import { queryUnprocessedPosts } from './lib/cosmos/queries';
import { enqueueMessage, ensureQueueExists } from './lib/queue/queueClient';
import { PostQueueMessage } from './types/queue';
import { PostMetadata } from './types/post';
import { getConfig } from './types/config';
import * as logger from './lib/utils/logger';
import { startTransaction, setTag } from './lib/utils/sentry';

const QUEUE_NAME = 'posts-to-process';

/**
 * Timer-triggered function that discovers unprocessed posts
 */
async function postDiscoveryHandler(
  timer: Timer,
  context: InvocationContext
): Promise<void> {
  const startTime = Date.now();

  // Start Sentry transaction for performance monitoring
  const transaction = startTransaction('postDiscovery', 'timer.process');
  setTag('function', 'postDiscovery');
  setTag('invocationId', context.invocationId);

  logger.info('PostDiscovery function triggered', {
    functionName: context.functionName,
    invocationId: context.invocationId,
  });

  try {
    // Ensure the queue exists
    await ensureQueueExists(QUEUE_NAME);

    // Get batch size from config (default: 10)
    const batchSize = parseInt(getConfig('BATCH_SIZE', '10'), 10);

    logger.info('Querying for unprocessed posts', { batchSize });

    // Query Cosmos DB for unprocessed posts
    const posts = await queryUnprocessedPosts(batchSize);

    if (posts.length === 0) {
      logger.info('No unprocessed posts found');
      return;
    }

    logger.info(`Found ${posts.length} unprocessed posts, enqueueing...`);

    // Enqueue each post for processing
    let enqueuedCount = 0;
    let errorCount = 0;

    for (const post of posts) {
      try {
        // Extract metadata for queue message
        const metadata: PostMetadata = {
          postId: post.id,
          type: post.type,
          url: post.url,
          permalink: post.permalink,
          images: post.images,
          threadId: post.threadId,
          threadSlug: post.threadSlug,
          category: post.category,
          threadTitle: post.threadTitle,
          author: post.author,
          timestamp: post.timestamp,
          postNumber: post.postNumber,
          isOriginalPost: post.isOriginalPost,
          containerId: post.containerId, // Include container ID for multi-container support
        };

        const queueMessage: PostQueueMessage = {
          postId: post.id,
          content: post.content,
          metadata,
        };

        await enqueueMessage(QUEUE_NAME, queueMessage);
        enqueuedCount++;

        logger.debug('Post enqueued', {
          postId: post.id,
          threadId: post.threadId,
          containerId: post.containerId,
        });
      } catch (err) {
        errorCount++;
        logger.logError(`Failed to enqueue post ${post.id}`, err as Error);
        // Continue processing other posts even if one fails
      }
    }

    const duration = Date.now() - startTime;

    logger.info('PostDiscovery completed', {
      totalFound: posts.length,
      enqueued: enqueuedCount,
      errors: errorCount,
      durationMs: duration,
    });

    // Mark transaction as successful
    transaction?.setStatus('ok');
  } catch (err) {
    const error = err as Error;

    // Mark transaction as failed
    transaction?.setStatus('internal_error');

    logger.logError('PostDiscovery function failed', error, {
      functionName: context.functionName,
    });

    throw error;
  } finally {
    // Finish Sentry transaction
    transaction?.finish();
  }
}

// Register the timer-triggered function
// Schedule: '0 */5 * * * *' = every 5 minutes
app.timer('postDiscovery', {
  schedule: '0 */5 * * * *',
  handler: postDiscoveryHandler,
});
