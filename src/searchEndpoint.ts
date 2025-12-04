/**
 * HTTP endpoint for semantic search queries
 *
 * Provides a REST API for searching the vector database with metadata filtering
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { generateEmbedding } from './lib/openai/embeddings';
import { queryVectors } from './lib/pinecone/upsert';
import * as logger from './lib/utils/logger';
import { trackEvent, trackMetric } from './lib/utils/telemetry';
import { startTransaction, setTag, addBreadcrumb } from './lib/utils/sentry';

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

  // Start Sentry transaction for performance monitoring
  const transaction = startTransaction('searchEndpoint', 'http.request');
  setTag('function', 'searchEndpoint');
  setTag('invocationId', context.invocationId);

  try {
    // Parse request body
    const body = await request.json() as SearchRequest;
    const { query, topK = 10, filter, includeMetadata = true } = body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      const duration = Date.now() - startTime;

      trackEvent('SearchEndpoint.BadRequest', { reason: 'empty_query' }, { durationMs: duration });
      trackMetric('SearchEndpoint.RequestTime', duration, { outcome: 'bad_request' });

      transaction?.setStatus('invalid_argument');
      transaction?.finish();

      return {
        status: 400,
        jsonBody: {
          error: 'Query is required and must be a non-empty string',
        },
      };
    }

    setTag('topK', topK.toString());
    setTag('hasFilter', filter ? 'true' : 'false');

    logger.info('Semantic search request', {
      query: query.substring(0, 100),
      topK,
      hasFilter: !!filter,
    });

    addBreadcrumb(
      'Generating embedding for search query',
      'search',
      'info',
      { queryLength: query.length, topK }
    );

    // Step 1: Generate embedding for query
    const embedding = await generateEmbedding(query);

    logger.debug('Query embedding generated', {
      dimensions: embedding.length,
    });

    addBreadcrumb(
      'Querying vector database',
      'search',
      'info',
      { dimensions: embedding.length, topK }
    );

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

    // Track successful search
    trackEvent(
      'SearchEndpoint.Success',
      {
        topK: topK.toString(),
        hasFilter: filter ? 'true' : 'false',
      },
      {
        resultsCount: results.length,
        executionTime,
        topScore: results[0]?.score || 0,
      }
    );

    trackMetric('SearchEndpoint.ResultsCount', results.length, { topK: topK.toString() });
    trackMetric('SearchEndpoint.RequestTime', executionTime);

    const response: SearchResponse = {
      results,
      executionTime,
    };

    transaction?.setStatus('ok');
    transaction?.finish();

    return {
      status: 200,
      jsonBody: response,
    };

  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('Search endpoint error', { error });

    // Mark transaction as failed
    transaction?.setStatus('internal_error');

    trackEvent('SearchEndpoint.Error', {
      errorType: error instanceof Error ? error.name : 'unknown',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    trackMetric('SearchEndpoint.RequestTime', duration, { outcome: 'error' });

    transaction?.finish();

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
