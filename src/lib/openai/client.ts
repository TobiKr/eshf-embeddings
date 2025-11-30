/**
 * OpenAI client initialization
 */

import OpenAI from 'openai';
import { getConfig } from '../../types/config';
import * as logger from '../utils/logger';

let openaiClient: OpenAI | null = null;

/**
 * Gets or creates a singleton OpenAI client instance
 */
export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = getConfig('OPENAI_API_KEY');

    logger.info('Initializing OpenAI client');

    openaiClient = new OpenAI({
      apiKey,
      timeout: 30000, // 30 second timeout for API calls
      maxRetries: 0, // We handle retries manually for rate limits
    });
  }

  return openaiClient;
}

/**
 * Gets the configured embedding model name
 */
export function getEmbeddingModel(): string {
  return getConfig('OPENAI_MODEL', 'text-embedding-3-large');
}
