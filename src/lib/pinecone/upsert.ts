/**
 * Pinecone vector upsert operations
 */

import { RecordMetadata } from '@pinecone-database/pinecone';
import { getPineconeIndex } from './client';
import { VectorDatabaseError } from '../utils/errors';
import * as logger from '../utils/logger';

/**
 * Pinecone vector structure
 */
export interface PineconeVector {
  id: string;
  values: number[];
  metadata?: RecordMetadata;
}

/**
 * Upserts a single vector to Pinecone
 *
 * @param vector - The vector to upsert
 */
export async function upsertVector(vector: PineconeVector): Promise<void> {
  try {
    const index = getPineconeIndex();

    logger.debug('Upserting vector to Pinecone', {
      vectorId: vector.id,
      dimensions: vector.values.length,
    });

    await index.upsert([vector]);

    logger.info('Vector upserted successfully', { vectorId: vector.id });
  } catch (err) {
    const error = err as Error;
    logger.logError('Failed to upsert vector', error, { vectorId: vector.id });
    throw new VectorDatabaseError(
      `Failed to upsert vector ${vector.id}`,
      error
    );
  }
}

/**
 * Upserts multiple vectors to Pinecone in a batch
 *
 * @param vectors - Array of vectors to upsert
 */
export async function upsertVectors(vectors: PineconeVector[]): Promise<void> {
  if (vectors.length === 0) {
    logger.warn('No vectors to upsert');
    return;
  }

  try {
    const index = getPineconeIndex();

    logger.debug('Upserting vectors batch to Pinecone', {
      count: vectors.length,
    });

    await index.upsert(vectors);

    logger.info('Vectors batch upserted successfully', {
      count: vectors.length,
    });
  } catch (err) {
    const error = err as Error;
    logger.logError('Failed to upsert vectors batch', error, {
      count: vectors.length,
    });
    throw new VectorDatabaseError(
      `Failed to upsert ${vectors.length} vectors`,
      error
    );
  }
}

/**
 * Queries Pinecone for similar vectors
 *
 * @param embedding - The query embedding vector
 * @param topK - Number of results to return (default: 10)
 * @param filter - Optional metadata filter (Pinecone filter syntax)
 * @returns Query results with scores and metadata
 */
export async function queryVectors(
  embedding: number[],
  topK = 10,
  filter?: Record<string, any>
): Promise<any> {
  try {
    const index = getPineconeIndex();

    logger.debug('Querying Pinecone', { topK, hasFilter: !!filter });

    const queryResponse = await index.query({
      vector: embedding,
      topK,
      includeMetadata: true,
      ...(filter && { filter }),
    });

    logger.info('Query completed', {
      resultsCount: queryResponse.matches?.length || 0,
    });

    return queryResponse;
  } catch (err) {
    const error = err as Error;
    logger.logError('Failed to query vectors', error);
    throw new VectorDatabaseError('Failed to query vectors', error);
  }
}
