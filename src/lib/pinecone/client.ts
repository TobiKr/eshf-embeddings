/**
 * Pinecone client initialization
 */

import { Pinecone, Index } from '@pinecone-database/pinecone';
import { getConfig } from '../../types/config';
import { VectorDatabaseError } from '../utils/errors';
import * as logger from '../utils/logger';

let pineconeClient: Pinecone | null = null;
let pineconeIndex: Index | null = null;

/**
 * Gets or creates a singleton Pinecone client instance
 */
export function getPineconeClient(): Pinecone {
  if (!pineconeClient) {
    const apiKey = getConfig('PINECONE_API_KEY');

    logger.info('Initializing Pinecone client');

    pineconeClient = new Pinecone({
      apiKey,
    });
  }

  return pineconeClient;
}

/**
 * Gets the configured Pinecone index instance
 */
export function getPineconeIndex(): Index {
  if (!pineconeIndex) {
    const client = getPineconeClient();
    const indexName = getConfig('PINECONE_INDEX');
    const host = getConfig('PINECONE_HOST');

    logger.info('Getting Pinecone index', { indexName, host });

    pineconeIndex = client.index(indexName, host);
  }

  return pineconeIndex;
}

/**
 * Tests the Pinecone connection by describing the index
 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = getPineconeClient();
    const indexName = getConfig('PINECONE_INDEX');

    logger.debug('Testing Pinecone connection', { indexName });

    const indexDescription = await client.describeIndex(indexName);

    logger.info('Pinecone connection test successful', {
      indexName,
      dimension: indexDescription.dimension,
      metric: indexDescription.metric,
    });

    return true;
  } catch (err) {
    const error = err as Error;
    logger.logError('Pinecone connection test failed', error);
    throw new VectorDatabaseError('Failed to connect to Pinecone', error);
  }
}
