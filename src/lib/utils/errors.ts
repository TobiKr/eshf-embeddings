/**
 * Custom error classes for the embeddings pipeline
 */

/**
 * Error thrown when OpenAI API rate limit is exceeded
 */
export class RateLimitError extends Error {
  constructor(message: string, public retryAfter?: number) {
    super(message);
    this.name = 'RateLimitError';
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Error thrown when database operations fail
 */
export class DatabaseError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'DatabaseError';
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

/**
 * Error thrown when embedding generation fails
 */
export class EmbeddingError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'EmbeddingError';
    Object.setPrototypeOf(this, EmbeddingError.prototype);
  }
}

/**
 * Error thrown when Pinecone operations fail
 */
export class VectorDatabaseError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'VectorDatabaseError';
    Object.setPrototypeOf(this, VectorDatabaseError.prototype);
  }
}

/**
 * Error thrown when queue operations fail
 */
export class QueueError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'QueueError';
    Object.setPrototypeOf(this, QueueError.prototype);
  }
}

/**
 * Type guard to check if an error is a RateLimitError
 */
export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

/**
 * Type guard to check if an error is a DatabaseError
 */
export function isDatabaseError(error: unknown): error is DatabaseError {
  return error instanceof DatabaseError;
}

/**
 * Type guard to check if an error is an EmbeddingError
 */
export function isEmbeddingError(error: unknown): error is EmbeddingError {
  return error instanceof EmbeddingError;
}

/**
 * Type guard to check if an error is a VectorDatabaseError
 */
export function isVectorDatabaseError(
  error: unknown
): error is VectorDatabaseError {
  return error instanceof VectorDatabaseError;
}

/**
 * Type guard to check if an error is a QueueError
 */
export function isQueueError(error: unknown): error is QueueError {
  return error instanceof QueueError;
}
