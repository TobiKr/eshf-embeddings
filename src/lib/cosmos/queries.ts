/**
 * Cosmos DB query functions for forum posts
 */

import { SqlQuerySpec } from '@azure/cosmos';
import { getContainer, listAllContainers, getContainerByName } from './client';
import { ForumPost } from '../../types/post';
import { DatabaseError } from '../utils/errors';
import * as logger from '../utils/logger';

/**
 * Queries for unprocessed posts from all containers
 *
 * @param limit - Maximum number of posts to return (distributed across all containers)
 * @returns Array of forum posts that need embedding processing
 */
export async function queryUnprocessedPosts(
  limit: number
): Promise<ForumPost[]> {
  try {
    // Get all containers in the database
    const containerIds = await listAllContainers();

    if (containerIds.length === 0) {
      logger.warn('No containers found in database');
      return [];
    }

    logger.debug('Querying unprocessed posts from all containers', {
      limit,
      containerCount: containerIds.length,
      containers: containerIds
    });

    // Calculate limit per container (distribute evenly, with remainder going to first containers)
    const limitPerContainer = Math.ceil(limit / containerIds.length);

    // Query each container in parallel
    const containerPromises = containerIds.map(async (containerId) => {
      const container = getContainerByName(containerId);

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
            value: limitPerContainer,
          },
        ],
      };

      const { resources } = await container.items.query<ForumPost>(querySpec).fetchAll();

      // Add containerId to each post for tracking
      return resources.map(post => ({
        ...post,
        containerId
      }));
    });

    // Wait for all queries to complete
    const resultsPerContainer = await Promise.all(containerPromises);

    // Flatten and combine results from all containers
    const allPosts = resultsPerContainer.flat();

    // Sort by timestamp and limit to requested amount
    const sortedPosts = allPosts
      .sort((a, b) => (a._ts || 0) - (b._ts || 0))
      .slice(0, limit);

    logger.info('Retrieved unprocessed posts from all containers', {
      totalFound: allPosts.length,
      returned: sortedPosts.length,
      containerResults: resultsPerContainer.map((posts, i) => ({
        container: containerIds[i],
        count: posts.length
      }))
    });

    return sortedPosts;
  } catch (err) {
    const error = err as Error;

    logger.logError('Failed to query unprocessed posts', error);

    throw new DatabaseError('Failed to query unprocessed posts', error);
  }
}

/**
 * Updates a post's embedding processing status
 *
 * @param postId - The post ID to update
 * @param threadId - The thread ID (partition key)
 * @param embeddingId - The Pinecone vector ID
 * @param containerId - The container ID (optional, falls back to default container)
 */
export async function updateProcessedStatus(
  postId: string,
  threadId: string,
  embeddingId: string,
  containerId?: string
): Promise<void> {
  try {
    // Use specified container or fall back to default
    const container = containerId ? getContainerByName(containerId) : getContainer();

    logger.debug('Updating post processed status', {
      postId,
      embeddingId,
      containerId: containerId || 'default'
    });

    // Read the existing document
    const { resource: post } = await container.item(postId, threadId).read<ForumPost>();

    if (!post) {
      throw new DatabaseError(`Post not found: ${postId} in container: ${containerId || 'default'}`);
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

    logger.info('Post marked as processed', {
      postId,
      embeddingId,
      containerId: containerId || 'default'
    });
  } catch (err) {
    const error = err as Error;

    logger.logError('Failed to update processed status', error, { postId, containerId });

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
 * Gets count of processed and unprocessed posts across all containers
 *
 * @returns Object with processed and unprocessed counts
 */
export async function getProcessingStats(): Promise<{
  totalPosts: number;
  processedPosts: number;
  unprocessedPosts: number;
}> {
  try {
    // Get all containers in the database
    const containerIds = await listAllContainers();

    if (containerIds.length === 0) {
      logger.warn('No containers found in database');
      return {
        totalPosts: 0,
        processedPosts: 0,
        unprocessedPosts: 0
      };
    }

    // Query each container for stats in parallel
    const statsPromises = containerIds.map(async (containerId) => {
      const container = getContainerByName(containerId);

      // Count total posts
      const totalQuery: SqlQuerySpec = {
        query: 'SELECT VALUE COUNT(1) FROM c',
      };
      const { resources: totalResult } = await container.items
        .query<number>(totalQuery)
        .fetchAll();
      const total = totalResult[0] || 0;

      // Count processed posts
      const processedQuery: SqlQuerySpec = {
        query: 'SELECT VALUE COUNT(1) FROM c WHERE c.embeddingProcessed = true',
      };
      const { resources: processedResult } = await container.items
        .query<number>(processedQuery)
        .fetchAll();
      const processed = processedResult[0] || 0;

      return {
        containerId,
        total,
        processed
      };
    });

    // Wait for all stats queries to complete
    const containerStats = await Promise.all(statsPromises);

    // Aggregate stats across all containers
    const totalPosts = containerStats.reduce((sum, stat) => sum + stat.total, 0);
    const processedPosts = containerStats.reduce((sum, stat) => sum + stat.processed, 0);
    const unprocessedPosts = totalPosts - processedPosts;

    logger.info('Retrieved processing stats from all containers', {
      totalPosts,
      processedPosts,
      unprocessedPosts,
      containerStats
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
