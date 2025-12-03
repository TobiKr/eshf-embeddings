/**
 * Environment variable configuration
 */
export interface EnvironmentConfig {
  // Azure Functions
  AzureWebJobsStorage: string;
  FUNCTIONS_WORKER_RUNTIME: string;
  APPLICATIONINSIGHTS_CONNECTION_STRING?: string;

  // Cosmos DB
  COSMOS_ENDPOINT: string;
  COSMOS_KEY: string;
  COSMOS_DATABASE: string;
  COSMOS_CONTAINER: string;

  // OpenAI
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;

  // Pinecone
  PINECONE_API_KEY: string;
  PINECONE_HOST: string;
  PINECONE_INDEX: string;

  // Processing Configuration
  BATCH_SIZE: string;

  // Jina AI Reranker Configuration
  RERANKER_ENABLED?: string;
  JINA_API_KEY?: string;
  JINA_RERANKER_MODEL?: string;
  RERANKER_MIN_SCORE?: string;
  RERANKER_ADAPTIVE_TOPK_MIN?: string;
  RERANKER_ADAPTIVE_TOPK_MAX?: string;
  RERANKER_SCORE_GAP_THRESHOLD?: string;
  RERANKER_TIMEOUT_MS?: string;
  RERANKER_MAX_RETRIES?: string;
}

/**
 * Reranker configuration interface
 */
export interface RerankerConfig {
  enabled: boolean;
  apiKey: string;
  model: string;
  minScore: number;
  timeout: number;
  maxRetries: number;
  adaptiveTopK: {
    enabled: boolean;
    min: number;
    max: number;
    scoreGapThreshold: number;
  };
}

/**
 * Validates that required environment variables are set
 * @throws Error if any required variable is missing
 */
export function validateConfig(): void {
  const required: (keyof EnvironmentConfig)[] = [
    'AzureWebJobsStorage',
    'FUNCTIONS_WORKER_RUNTIME',
    'COSMOS_ENDPOINT',
    'COSMOS_KEY',
    'COSMOS_DATABASE',
    'COSMOS_CONTAINER',
    'OPENAI_API_KEY',
    'OPENAI_MODEL',
    'PINECONE_API_KEY',
    'PINECONE_HOST',
    'PINECONE_INDEX',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

/**
 * Gets configuration value from environment with default fallback
 */
export function getConfig<K extends keyof EnvironmentConfig>(
  key: K,
  defaultValue?: string
): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
}
