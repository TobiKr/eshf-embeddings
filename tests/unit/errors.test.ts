/**
 * Unit tests for custom error classes
 */

import {
  RateLimitError,
  DatabaseError,
  EmbeddingError,
  VectorDatabaseError,
  QueueError,
  isRateLimitError,
  isDatabaseError,
  isEmbeddingError,
  isVectorDatabaseError,
  isQueueError,
} from '../../src/lib/utils/errors';

describe('Error Classes', () => {
  describe('RateLimitError', () => {
    it('should create error with message', () => {
      const error = new RateLimitError('Rate limit exceeded');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.name).toBe('RateLimitError');
    });

    it('should store retryAfter value', () => {
      const error = new RateLimitError('Rate limit', 5000);
      expect(error.retryAfter).toBe(5000);
    });
  });

  describe('DatabaseError', () => {
    it('should create error with message', () => {
      const error = new DatabaseError('Database connection failed');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DatabaseError);
      expect(error.message).toBe('Database connection failed');
      expect(error.name).toBe('DatabaseError');
    });

    it('should store original error', () => {
      const originalError = new Error('Connection timeout');
      const error = new DatabaseError('Database failed', originalError);
      expect(error.originalError).toBe(originalError);
    });
  });

  describe('EmbeddingError', () => {
    it('should create error with message', () => {
      const error = new EmbeddingError('Embedding generation failed');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(EmbeddingError);
      expect(error.message).toBe('Embedding generation failed');
      expect(error.name).toBe('EmbeddingError');
    });
  });

  describe('VectorDatabaseError', () => {
    it('should create error with message', () => {
      const error = new VectorDatabaseError('Pinecone upsert failed');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(VectorDatabaseError);
      expect(error.message).toBe('Pinecone upsert failed');
      expect(error.name).toBe('VectorDatabaseError');
    });
  });

  describe('QueueError', () => {
    it('should create error with message', () => {
      const error = new QueueError('Queue operation failed');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(QueueError);
      expect(error.message).toBe('Queue operation failed');
      expect(error.name).toBe('QueueError');
    });
  });

  describe('Type Guards', () => {
    it('isRateLimitError should identify RateLimitError', () => {
      const rateLimitError = new RateLimitError('Rate limit');
      const otherError = new Error('Other');

      expect(isRateLimitError(rateLimitError)).toBe(true);
      expect(isRateLimitError(otherError)).toBe(false);
      expect(isRateLimitError('not an error')).toBe(false);
      expect(isRateLimitError(null)).toBe(false);
    });

    it('isDatabaseError should identify DatabaseError', () => {
      const dbError = new DatabaseError('DB error');
      const otherError = new Error('Other');

      expect(isDatabaseError(dbError)).toBe(true);
      expect(isDatabaseError(otherError)).toBe(false);
    });

    it('isEmbeddingError should identify EmbeddingError', () => {
      const embError = new EmbeddingError('Embedding error');
      const otherError = new Error('Other');

      expect(isEmbeddingError(embError)).toBe(true);
      expect(isEmbeddingError(otherError)).toBe(false);
    });

    it('isVectorDatabaseError should identify VectorDatabaseError', () => {
      const vecDbError = new VectorDatabaseError('Vector DB error');
      const otherError = new Error('Other');

      expect(isVectorDatabaseError(vecDbError)).toBe(true);
      expect(isVectorDatabaseError(otherError)).toBe(false);
    });

    it('isQueueError should identify QueueError', () => {
      const queueError = new QueueError('Queue error');
      const otherError = new Error('Other');

      expect(isQueueError(queueError)).toBe(true);
      expect(isQueueError(otherError)).toBe(false);
    });
  });
});
