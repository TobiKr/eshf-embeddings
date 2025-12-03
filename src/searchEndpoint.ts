/**
 * HTTP endpoint for semantic search queries
 *
 * Provides a REST API for searching the vector database with metadata filtering
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { generateEmbedding } from './lib/openai/embeddings';
import { queryVectors } from './lib/pinecone/upsert';
import * as logger from './lib/utils/logger';

interface SearchRequest {
  query: string;
  topK?: number;
  filter?: Record<string, any>;
  includeMetadata?: boolean;
}

interface SearchResponse {
  results: Array<{
    score: number;
    metadata: Record<string, any>;
    text?: string;
  }>;
  queryTokens?: number;
  executionTime?: number;
}

/**
 * Search the vector database using semantic similarity
 *
 * @param request - HTTP request with search query and optional filters
 * @param context - Azure Functions invocation context
 * @returns Search results with scores and metadata
 */
export async function searchEndpoint(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const startTime = Date.now();

  try {
    // Parse request body
    const body = await request.json() as SearchRequest;
    const { query, topK = 10, filter, includeMetadata = true } = body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return {
        status: 400,
        jsonBody: {
          error: 'Query is required and must be a non-empty string',
        },
      };
    }

    logger.info('Semantic search request', {
      query: query.substring(0, 100),
      topK,
      hasFilter: !!filter,
    });

    // Step 1: Generate embedding for query
    const embedding = await generateEmbedding(query);

    logger.debug('Query embedding generated', {
      dimensions: embedding.length,
    });

    // Step 2: Query Pinecone
    const searchResults = await queryVectors(
      embedding,
      topK,
      filter
    );

    // Step 3: Format results
    const results = searchResults.matches?.map((match: any) => ({
      score: match.score,
      metadata: includeMetadata ? match.metadata : undefined,
      text: match.metadata?.postText || match.metadata?.contentPreview,
    })) || [];

    const executionTime = Date.now() - startTime;

    logger.info('Semantic search completed', {
      resultsCount: results.length,
      executionTime,
      topScore: results[0]?.score,
    });

    const response: SearchResponse = {
      results,
      executionTime,
    };

    return {
      status: 200,
      jsonBody: response,
    };

  } catch (error) {
    logger.error('Search endpoint error', { error });

    return {
      status: 500,
      jsonBody: {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

// Register HTTP endpoint
app.http('search', {
  methods: ['POST'],
  authLevel: 'function',
  handler: searchEndpoint,
});
