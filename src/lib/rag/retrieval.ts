/**
 * RAG retrieval logic for semantic search
 *
 * Handles embedding generation, vector database queries, and semantic reranking
 */

import { generateEmbedding } from '../openai/embeddings';
import { queryVectors } from '../pinecone/upsert';
import { rerankChunks, getRerankerConfigFromEnv } from './reranker';
import * as logger from '../utils/logger';

// Configuration
const DEFAULT_TOP_K = 500; // Cast a wider net for reranking - reranker will filter to 3-15 best chunks

interface RetrievalResult {
  success: boolean;
  chunks?: Array<any & { rerankerScore?: number }>;
  error?: string;
  rerankingMetrics?: {
    originalCount: number;
    filteredCount: number;
    finalCount: number;
    rerankingLatency: number;
  };
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

    logger.info('Vector search completed', {
      chunksRetrieved: searchResults.matches.length,
      topScore: searchResults.matches[0]?.score,
    });

    // Step 3: Rerank results using Jina AI cross-encoder
    const rerankerConfig = getRerankerConfigFromEnv();
    const rerankResult = await rerankChunks(query, searchResults.matches, rerankerConfig);

    logger.info('Retrieval completed with reranking', {
      originalChunks: searchResults.matches.length,
      finalChunks: rerankResult.chunks.length,
      rerankingLatency: rerankResult.metrics.rerankingLatency,
      topRerankerScore: rerankResult.chunks[0]?.rerankerScore,
      filteredCount: rerankResult.metrics.filteredCount,
    });

    // Return reranked chunks (extract the chunk objects and add reranker scores)
    return {
      success: true,
      chunks: rerankResult.chunks.map(sc => ({
        ...sc.chunk,
        rerankerScore: sc.rerankerScore, // Add reranker score to metadata
      })),
      rerankingMetrics: {
        originalCount: rerankResult.metrics.originalCount,
        filteredCount: rerankResult.metrics.filteredCount,
        finalCount: rerankResult.metrics.finalCount,
        rerankingLatency: rerankResult.metrics.rerankingLatency,
      },
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
