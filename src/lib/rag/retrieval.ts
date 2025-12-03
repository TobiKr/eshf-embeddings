/**
 * RAG retrieval logic for semantic search
 *
 * Handles embedding generation and vector database queries
 */

import { generateEmbedding } from '../openai/embeddings';
import { queryVectors } from '../pinecone/upsert';
import * as logger from '../utils/logger';

// Configuration
const DEFAULT_TOP_K = 30; // Retrieve top 30 chunks for detailed context

interface RetrievalResult {
  success: boolean;
  chunks?: any[];
  error?: string;
}

/**
 * Retrieves relevant forum posts for a user query
 *
 * @param query - User's question/query
 * @param topK - Number of chunks to retrieve (default: 30)
 * @param filter - Optional metadata filter for Pinecone query
 * @returns Retrieval result with chunks or error
 */
export async function retrieveContext(
  query: string,
  topK: number = DEFAULT_TOP_K,
  filter?: Record<string, any>
): Promise<RetrievalResult> {
  try {
    logger.info('Starting RAG retrieval', {
      queryLength: query.length,
      topK,
      hasFilter: !!filter,
    });

    // Step 1: Generate embedding for query
    // Note: Model is configured via OPENAI_MODEL environment variable
    const embedding = await generateEmbedding(query);

    logger.debug('Query embedding generated', {
      dimensions: embedding.length,
    });

    // Step 2: Query Pinecone for similar vectors
    const searchResults = await queryVectors(
      embedding,
      topK,
      filter
    );

    if (!searchResults.matches || searchResults.matches.length === 0) {
      logger.warn('No matches found in vector database', { query });

      return {
        success: true,
        chunks: [],
      };
    }

    logger.info('Retrieval completed successfully', {
      chunksRetrieved: searchResults.matches.length,
      topScore: searchResults.matches[0]?.score,
    });

    return {
      success: true,
      chunks: searchResults.matches,
    };
  } catch (error) {
    logger.error('Error during retrieval', { error });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown retrieval error',
    };
  }
}

/**
 * Retrieves context with automatic fallback strategies
 *
 * If initial query returns no results, tries with relaxed filters
 *
 * @param query - User's question/query
 * @param topK - Number of chunks to retrieve
 * @param filter - Optional metadata filter
 * @returns Retrieval result with chunks or error
 */
export async function retrieveContextWithFallback(
  query: string,
  topK: number = DEFAULT_TOP_K,
  filter?: Record<string, any>
): Promise<RetrievalResult> {
  // Try with filter first (if provided)
  if (filter) {
    const result = await retrieveContext(query, topK, filter);

    if (result.success && result.chunks && result.chunks.length > 0) {
      return result;
    }

    // No results with filter, try without
    logger.info('No results with filter, retrying without filter');
  }

  // Try without filter
  return retrieveContext(query, topK);
}
