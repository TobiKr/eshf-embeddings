/**
 * ManualProcessor Function (HTTP Trigger)
 *
 * Provides HTTP endpoints for manual processing operations:
 * - POST /api/process - Trigger manual post discovery
 * - POST /api/process/{postId}/{threadId} - Process a specific post
 * - GET /api/status - Get processing statistics
 */

import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { queryUnprocessedPosts, getPostById, getProcessingStats } from './lib/cosmos/queries';
import { enqueueMessage, ensureQueueExists, getQueueLength } from './lib/queue/queueClient';
import { PostQueueMessage } from './types/queue';
import { PostMetadata } from './types/post';
import { getConfig } from './types/config';
import * as logger from './lib/utils/logger';

import { startTransaction, setTag } from './lib/utils/sentry';

const QUEUE_NAME = 'posts-to-process';

/**
 * HTTP-triggered function for manual processing operations
 */
async function manualProcessorHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const startTime = Date.now();

  // Start Sentry transaction for performance monitoring
  const transaction = startTransaction('manualProcessor', 'http.request');
  setTag('function', 'manualProcessor');
  setTag('invocationId', context.invocationId);
  setTag('method', request.method);

  logger.info('ManualProcessor function triggered', {
    method: request.method,
    url: request.url,
    functionName: context.functionName,
  });

  try {
    const method = request.method.toUpperCase();
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(Boolean);

    // GET /api/status - Get processing statistics
    if (method === 'GET' && pathParts[pathParts.length - 1] === 'status') {
      const result = await handleGetStatus();

      const duration = Date.now() - startTime;

      transaction?.setStatus('ok');
      return result;
    }

    // POST /api/process/{postId}/{threadId} - Process specific post
    if (method === 'POST' && pathParts.length >= 4) {
      const postId = pathParts[2];
      const threadId = pathParts[3];

      setTag('postId', postId);
      setTag('threadId', threadId);

      const result = await handleProcessSpecificPost(postId, threadId);

      const duration = Date.now() - startTime;

      transaction?.setStatus('ok');
      return result;
    }

    // POST /api/process - Trigger manual discovery
    if (method === 'POST' && pathParts[pathParts.length - 1] === 'process') {
      const result = await handleManualDiscovery();

      const duration = Date.now() - startTime;

      transaction?.setStatus('ok');
      return result;
    }

    // Unknown endpoint
    transaction?.setStatus('not_found');

    const duration = Date.now() - startTime;

    return {
      status: 404,
      jsonBody: {
        error: 'Not Found',
        message: 'Valid endpoints: GET /api/status, POST /api/process, POST /api/process/{postId}/{threadId}',
      },
    };
  } catch (err) {
    const error = err as Error;

    // Mark transaction as failed
    transaction?.setStatus('internal_error');

    logger.logError('ManualProcessor failed', error);

    return {
      status: 500,
      jsonBody: {
        error: 'Internal Server Error',
        message: error.message,
      },
    };
  } finally {
    // Finish Sentry transaction
    transaction?.finish();
  }
}

/**
 * Handles GET /api/status - Returns processing statistics
 */
async function handleGetStatus(): Promise<HttpResponseInit> {
  logger.info('Handling status request');

  const stats = await getProcessingStats();
  const queueLength = await getQueueLength(QUEUE_NAME);

  const response = {
    totalPosts: stats.totalPosts,
    processedPosts: stats.processedPosts,
    unprocessedPosts: stats.unprocessedPosts,
    queueDepth: queueLength,
    percentComplete: stats.totalPosts > 0
      ? ((stats.processedPosts / stats.totalPosts) * 100).toFixed(2)
      : '0.00',
    timestamp: new Date().toISOString(),
  };

  logger.info('Status retrieved', response);

  return {
    status: 200,
    jsonBody: response,
  };
}

/**
 * Handles POST /api/process - Triggers manual discovery
 */
async function handleManualDiscovery(): Promise<HttpResponseInit> {
  logger.info('Handling manual discovery request');

  await ensureQueueExists(QUEUE_NAME);

  const batchSize = parseInt(getConfig('BATCH_SIZE', '10'), 10);
  const posts = await queryUnprocessedPosts(batchSize);

  if (posts.length === 0) {
    return {
      status: 200,
      jsonBody: {
        message: 'No unprocessed posts found',
        enqueued: 0,
      },
    };
  }

  let enqueuedCount = 0;

  for (const post of posts) {
    try {
      const metadata: PostMetadata = {
        postId: post.id,
        type: post.type,
        url: post.url,
        threadId: post.threadId,
        threadSlug: post.threadSlug,
        category: post.category,
        threadTitle: post.threadTitle,
        author: post.author,
        timestamp: post.timestamp,
        postNumber: post.postNumber,
        isOriginalPost: post.isOriginalPost,
      };

      const queueMessage: PostQueueMessage = {
        postId: post.id,
        content: post.content,
        metadata,
      };

      await enqueueMessage(QUEUE_NAME, queueMessage);
      enqueuedCount++;
    } catch (err) {
      logger.logError(`Failed to enqueue post ${post.id}`, err as Error);
    }
  }

  const response = {
    message: 'Posts enqueued for processing',
    found: posts.length,
    enqueued: enqueuedCount,
  };

  logger.info('Manual discovery completed', response);

  return {
    status: 200,
    jsonBody: response,
  };
}

/**
 * Handles POST /api/process/{postId}/{threadId} - Process specific post
 */
async function handleProcessSpecificPost(
  postId: string,
  threadId: string
): Promise<HttpResponseInit> {
  logger.info('Handling process specific post request', { postId, threadId });

  await ensureQueueExists(QUEUE_NAME);

  const post = await getPostById(postId, threadId);

  if (!post) {
    return {
      status: 404,
      jsonBody: {
        error: 'Not Found',
        message: `Post ${postId} not found in thread ${threadId}`,
      },
    };
  }

  const metadata: PostMetadata = {
    postId: post.id,
    type: post.type,
    url: post.url,
    threadId: post.threadId,
    threadSlug: post.threadSlug,
    category: post.category,
    threadTitle: post.threadTitle,
    author: post.author,
    timestamp: post.timestamp,
    postNumber: post.postNumber,
    isOriginalPost: post.isOriginalPost,
  };

  const queueMessage: PostQueueMessage = {
    postId: post.id,
    content: post.content,
    metadata,
  };

  await enqueueMessage(QUEUE_NAME, queueMessage);

  const response = {
    message: 'Post enqueued for processing',
    postId: post.id,
    threadId: post.threadId,
    alreadyProcessed: post.embeddingProcessed || false,
  };

  logger.info('Specific post enqueued', response);

  return {
    status: 200,
    jsonBody: response,
  };
}

// Register the HTTP-triggered function
app.http('manualProcessor', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'process/{*segments}',
  handler: manualProcessorHandler,
});

// Also register a /api/status endpoint
app.http('status', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'status',
  handler: async (request: HttpRequest, context: InvocationContext) => {
    return handleGetStatus();
  },
});
