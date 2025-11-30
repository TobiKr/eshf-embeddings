/**
 * Azure Storage Queue client wrappers
 */

import { QueueClient, QueueServiceClient } from '@azure/storage-queue';
import { getConfig } from '../../types/config';
import { QueueError } from '../utils/errors';
import * as logger from '../utils/logger';

const queueClients: Map<string, QueueClient> = new Map();

/**
 * Gets or creates a QueueClient for the specified queue
 *
 * @param queueName - The name of the queue
 * @returns QueueClient instance
 */
export function getQueueClient(queueName: string): QueueClient {
  if (queueClients.has(queueName)) {
    return queueClients.get(queueName)!;
  }

  const connectionString = getConfig('AzureWebJobsStorage');

  logger.debug('Initializing queue client', { queueName });

  const serviceClient = QueueServiceClient.fromConnectionString(connectionString);
  const queueClient = serviceClient.getQueueClient(queueName);

  queueClients.set(queueName, queueClient);

  return queueClient;
}

/**
 * Ensures a queue exists, creating it if necessary
 *
 * @param queueName - The name of the queue
 */
export async function ensureQueueExists(queueName: string): Promise<void> {
  try {
    const queueClient = getQueueClient(queueName);

    logger.debug('Ensuring queue exists', { queueName });

    await queueClient.createIfNotExists();

    logger.info('Queue ready', { queueName });
  } catch (err) {
    const error = err as Error;
    logger.logError('Failed to ensure queue exists', error, { queueName });
    throw new QueueError(`Failed to ensure queue ${queueName} exists`, error);
  }
}

/**
 * Enqueues a message to the specified queue
 *
 * @param queueName - The name of the queue
 * @param message - The message payload (will be JSON serialized)
 */
export async function enqueueMessage(
  queueName: string,
  message: any
): Promise<void> {
  try {
    const queueClient = getQueueClient(queueName);

    // Serialize message to JSON
    const messageText = JSON.stringify(message);

    // Base64 encode for Azure Queue Storage
    const encodedMessage = Buffer.from(messageText).toString('base64');

    logger.debug('Enqueuing message', {
      queueName,
      messageSize: messageText.length,
    });

    await queueClient.sendMessage(encodedMessage);

    logger.info('Message enqueued successfully', { queueName });
  } catch (err) {
    const error = err as Error;
    logger.logError('Failed to enqueue message', error, { queueName });
    throw new QueueError(`Failed to enqueue message to ${queueName}`, error);
  }
}

/**
 * Dequeues messages from the specified queue
 *
 * @param queueName - The name of the queue
 * @param maxMessages - Maximum number of messages to dequeue (default: 1)
 * @returns Array of dequeued messages
 */
export async function dequeueMessages(
  queueName: string,
  maxMessages = 1
): Promise<any[]> {
  try {
    const queueClient = getQueueClient(queueName);

    logger.debug('Dequeuing messages', { queueName, maxMessages });

    const response = await queueClient.receiveMessages({
      numberOfMessages: maxMessages,
    });

    const messages = response.receivedMessageItems.map((item) => {
      // Decode from base64 and parse JSON
      const messageText = Buffer.from(item.messageText, 'base64').toString('utf-8');
      return JSON.parse(messageText);
    });

    logger.info('Messages dequeued', {
      queueName,
      count: messages.length,
    });

    return messages;
  } catch (err) {
    const error = err as Error;
    logger.logError('Failed to dequeue messages', error, { queueName });
    throw new QueueError(`Failed to dequeue messages from ${queueName}`, error);
  }
}

/**
 * Gets the approximate number of messages in a queue
 *
 * @param queueName - The name of the queue
 * @returns Approximate message count
 */
export async function getQueueLength(queueName: string): Promise<number> {
  try {
    const queueClient = getQueueClient(queueName);

    logger.debug('Getting queue length', { queueName });

    const properties = await queueClient.getProperties();
    const count = properties.approximateMessagesCount || 0;

    logger.debug('Queue length retrieved', { queueName, count });

    return count;
  } catch (err) {
    const error = err as Error;
    logger.logError('Failed to get queue length', error, { queueName });
    throw new QueueError(`Failed to get queue length for ${queueName}`, error);
  }
}
