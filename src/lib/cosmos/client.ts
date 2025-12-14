/**
 * Cosmos DB client initialization
 */

import { CosmosClient, Database, Container } from '@azure/cosmos';
import { getConfig } from '../../types/config';
import { DatabaseError } from '../utils/errors';
import * as logger from '../utils/logger';

let cosmosClient: CosmosClient | null = null;
let database: Database | null = null;
let container: Container | null = null;

/**
 * Gets or creates a singleton CosmosClient instance
 */
export function getCosmosClient(): CosmosClient {
  if (!cosmosClient) {
    const endpoint = getConfig('COSMOS_ENDPOINT');
    const key = getConfig('COSMOS_KEY');

    logger.info('Initializing Cosmos DB client', { endpoint });

    cosmosClient = new CosmosClient({
      endpoint,
      key,
    });
  }

  return cosmosClient;
}

/**
 * Gets the configured database instance
 */
export function getDatabase(): Database {
  if (!database) {
    const client = getCosmosClient();
    const databaseId = getConfig('COSMOS_DATABASE');

    logger.debug('Getting database reference', { databaseId });
    database = client.database(databaseId);
  }

  return database;
}

/**
 * Gets the configured container instance
 */
export function getContainer(): Container {
  if (!container) {
    const db = getDatabase();
    const containerId = getConfig('COSMOS_CONTAINER');

    logger.debug('Getting container reference', { containerId });
    container = db.container(containerId);
  }

  return container;
}

/**
 * Gets a container by name (for multi-container support)
 */
export function getContainerByName(containerId: string): Container {
  const db = getDatabase();
  logger.debug('Getting container reference by name', { containerId });
  return db.container(containerId);
}

/**
 * Lists all containers in the database
 * @returns Array of container IDs
 */
export async function listAllContainers(): Promise<string[]> {
  try {
    const db = getDatabase();
    const { resources } = await db.containers.readAll().fetchAll();

    const containerIds = resources.map(containerDef => containerDef.id);

    logger.info('Listed all containers', {
      count: containerIds.length,
      containers: containerIds
    });

    return containerIds;
  } catch (err) {
    const error = err as Error;
    logger.logError('Failed to list containers', error);
    throw new DatabaseError('Failed to list containers', error);
  }
}

/**
 * Tests the Cosmos DB connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const db = getDatabase();
    await db.read();
    logger.info('Cosmos DB connection test successful');
    return true;
  } catch (err) {
    const error = err as Error;
    logger.logError('Cosmos DB connection test failed', error);
    throw new DatabaseError('Failed to connect to Cosmos DB', error);
  }
}
