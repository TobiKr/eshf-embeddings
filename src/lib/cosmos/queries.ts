/**
 * Cosmos DB query functions for forum posts
 */

import { SqlQuerySpec } from '@azure/cosmos';
import { getContainer } from './client';
import { ForumPost } from '../../types/post';
import { DatabaseError } from '../utils/errors';
import * as logger from '../utils/logger';
import { trackDependency, trackMetric } from '../utils/telemetry';

/**
 * Queries for unprocessed posts (where embeddingProcessed is false or undefined)
 *
 * @param limit - Maximum number of posts to return
 * @returns Array of forum posts that need embedding processing
 */
export async function queryUnprocessedPosts(
  limit: number
): Promise<ForumPost[]> {
  const startTime = Date.now();

  try {
    const container = getContainer();

    const querySpec: SqlQuerySpec = {
      query: `
        SELECT TOP @limit *
        FROM c
        WHERE (NOT IS_DEFINED(c.embeddingProcessed) OR c.embeddingProcessed = false)
        ORDER BY c._ts ASC
      `,
      parameters: [
        {
          name: '@limit',
          value: limit,
        },
      ],
    };

    logger.debug('Querying unprocessed posts', { limit });

    const { resources } = await container.items.query<ForumPost>(querySpec).fetchAll();
    const duration = Date.now() - startTime;

    logger.info('Retrieved unprocessed posts', { count: resources.length });

    // Track successful query
    trackDependency(
      'CosmosDB.QueryUnprocessedPosts',
      'Azure Cosmos DB',
      `SELECT TOP ${limit} unprocessed posts`,
      duration,
      true,
      200,
      {
        resultCount: resources.length.toString(),
        limit: limit.toString(),
      }
    );

    trackMetric('CosmosDB.QueryLatency', duration, {
      operation: 'queryUnprocessedPosts',
    });

    return resources;
  } catch (err) {
    const error = err as Error;
    const duration = Date.now() - startTime;

    logger.logError('Failed to query unprocessed posts', error);

    // Track failed query
    trackDependency(
      'CosmosDB.QueryUnprocessedPosts',
      'Azure Cosmos DB',
      `SELECT TOP ${limit} unprocessed posts`,
      duration,
      false,
      0,
      {
        errorMessage: error.message,
      }
    );

    throw new DatabaseError('Failed to query unprocessed posts', error);
  }
}

/**
 * Updates a post's embedding processing status
 *
 * @param postId - The post ID to update
 * @param threadId - The thread ID (partition key)
 * @param embeddingId - The Pinecone vector ID
 */
export async function updateProcessedStatus(
  postId: string,
  threadId: string,
  embeddingId: string
): Promise<void> {
  const startTime = Date.now();

  try {
    const container = getContainer();

    logger.debug('Updating post processed status', { postId, embeddingId });

    // Read the existing document
    const { resource: post } = await container.item(postId, threadId).read<ForumPost>();

    if (!post) {
      throw new DatabaseError(`Post not found: ${postId}`);
    }

    // Update with embedding metadata
    const updatedPost: ForumPost = {
      ...post,
      embeddingProcessed: true,
      embeddingId,
      lastEmbeddingUpdate: new Date().toISOString(),
    };

    // Replace the document
    await container.item(postId, threadId).replace(updatedPost);
    const duration = Date.now() - startTime;

    logger.info('Post marked as processed', { postId, embeddingId });

    // Track successful update
    trackDependency(
      'CosmosDB.UpdateProcessedStatus',
      'Azure Cosmos DB',
      `UPDATE post ${postId}`,
      duration,
      true,
      200,
      {
        postId,
        embeddingId,
      }
    );
  } catch (err) {
    const error = err as Error;
    const duration = Date.now() - startTime;

    logger.logError('Failed to update processed status', error, { postId });

    // Track failed update
    trackDependency(
      'CosmosDB.UpdateProcessedStatus',
      'Azure Cosmos DB',
      `UPDATE post ${postId}`,
      duration,
      false,
      0,
      {
        postId,
        errorMessage: error.message,
      }
    );

    throw new DatabaseError(`Failed to update processed status for post ${postId}`, error);
  }
}

/**
 * Retrieves a specific post by ID
 *
 * @param postId - The post ID
 * @param threadId - The thread ID (partition key)
 * @returns The forum post or null if not found
 */
export async function getPostById(
  postId: string,
  threadId: string
): Promise<ForumPost | null> {
  try {
    const container = getContainer();

    logger.debug('Fetching post by ID', { postId, threadId });

    const { resource } = await container.item(postId, threadId).read<ForumPost>();

    if (!resource) {
      logger.warn('Post not found', { postId, threadId });
      return null;
    }

    logger.debug('Post retrieved', { postId });
    return resource;
  } catch (err) {
    const error = err as Error;
    logger.logError('Failed to get post by ID', error, { postId });
    throw new DatabaseError(`Failed to get post ${postId}`, error);
  }
}

/**
 * Gets count of processed and unprocessed posts
 *
 * @returns Object with processed and unprocessed counts
 */
export async function getProcessingStats(): Promise<{
  totalPosts: number;
  processedPosts: number;
  unprocessedPosts: number;
}> {
  try {
    const container = getContainer();

    // Count total posts
    const totalQuery: SqlQuerySpec = {
      query: 'SELECT VALUE COUNT(1) FROM c',
    };
    const { resources: totalResult } = await container.items
      .query<number>(totalQuery)
      .fetchAll();
    const totalPosts = totalResult[0] || 0;

    // Count processed posts
    const processedQuery: SqlQuerySpec = {
      query: 'SELECT VALUE COUNT(1) FROM c WHERE c.embeddingProcessed = true',
    };
    const { resources: processedResult } = await container.items
      .query<number>(processedQuery)
      .fetchAll();
    const processedPosts = processedResult[0] || 0;

    const unprocessedPosts = totalPosts - processedPosts;

    logger.info('Retrieved processing stats', {
      totalPosts,
      processedPosts,
      unprocessedPosts,
    });

    return {
      totalPosts,
      processedPosts,
      unprocessedPosts,
    };
  } catch (err) {
    const error = err as Error;
    logger.logError('Failed to get processing stats', error);
    throw new DatabaseError('Failed to get processing stats', error);
  }
}
