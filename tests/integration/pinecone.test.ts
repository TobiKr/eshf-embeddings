/**
 * Integration tests for Pinecone operations
 *
 * These tests require actual Pinecone credentials in local.settings.json
 * Run with: npm test -- pinecone.test.ts
 */

import { upsertVector, upsertVectors, queryVectors } from '../../src/lib/pinecone/upsert';
import { testConnection } from '../../src/lib/pinecone/client';
import { PineconeVector } from '../../src/lib/pinecone/upsert';

describe('Pinecone Integration Tests', () => {
  beforeAll(() => {
    if (!process.env.PINECONE_API_KEY) {
      console.warn('Pinecone API key not set. Skipping integration tests.');
    }
  });

  describe('testConnection', () => {
    it('should successfully connect to Pinecone', async () => {
      if (!process.env.PINECONE_API_KEY) {
        console.log('Skipping: Pinecone credentials not configured');
        return;
      }

      await expect(testConnection()).resolves.toBe(true);
    }, 30000);
  });

  describe('upsertVector', () => {
    it('should upsert a single vector successfully', async () => {
      if (!process.env.PINECONE_API_KEY) {
        console.log('Skipping: Pinecone credentials not configured');
        return;
      }

      const testVector: PineconeVector = {
        id: `test-${Date.now()}-1`,
        values: Array(3072).fill(0.1), // Match text-embedding-3-large dimensions
        metadata: {
          test: true,
          category: 'Test Category',
          content: 'This is a test vector',
        },
      };

      await expect(upsertVector(testVector)).resolves.not.toThrow();
    }, 30000);

    it('should upsert vector with German metadata', async () => {
      if (!process.env.PINECONE_API_KEY) {
        console.log('Skipping: Pinecone credentials not configured');
        return;
      }

      const testVector: PineconeVector = {
        id: `test-${Date.now()}-2`,
        values: Array(3072).fill(0.2),
        metadata: {
          test: true,
          category: 'Bauplan & Grundriss',
          content: 'Über größere Häuser',
        },
      };

      await expect(upsertVector(testVector)).resolves.not.toThrow();
    }, 30000);
  });

  describe('upsertVectors', () => {
    it('should upsert multiple vectors successfully', async () => {
      if (!process.env.PINECONE_API_KEY) {
        console.log('Skipping: Pinecone credentials not configured');
        return;
      }

      const timestamp = Date.now();
      const testVectors: PineconeVector[] = [
        {
          id: `test-${timestamp}-batch-1`,
          values: Array(3072).fill(0.3),
          metadata: { test: true, batch: 1 },
        },
        {
          id: `test-${timestamp}-batch-2`,
          values: Array(3072).fill(0.4),
          metadata: { test: true, batch: 2 },
        },
        {
          id: `test-${timestamp}-batch-3`,
          values: Array(3072).fill(0.5),
          metadata: { test: true, batch: 3 },
        },
      ];

      await expect(upsertVectors(testVectors)).resolves.not.toThrow();
    }, 30000);

    it('should handle empty vector array gracefully', async () => {
      if (!process.env.PINECONE_API_KEY) {
        console.log('Skipping: Pinecone credentials not configured');
        return;
      }

      await expect(upsertVectors([])).resolves.not.toThrow();
    }, 30000);
  });

  describe('queryVectors', () => {
    it('should query vectors by embedding', async () => {
      if (!process.env.PINECONE_API_KEY) {
        console.log('Skipping: Pinecone credentials not configured');
        return;
      }

      // Use a simple query vector
      const queryEmbedding = Array(3072).fill(0.1);

      const results = await queryVectors(queryEmbedding, 5);

      expect(results).toBeDefined();
      expect(results.matches).toBeDefined();
      expect(Array.isArray(results.matches)).toBe(true);

      if (results.matches && results.matches.length > 0) {
        const match = results.matches[0];
        expect(match).toHaveProperty('id');
        expect(match).toHaveProperty('score');
        expect(match).toHaveProperty('metadata');
      }
    }, 30000);

    it('should respect topK parameter', async () => {
      if (!process.env.PINECONE_API_KEY) {
        console.log('Skipping: Pinecone credentials not configured');
        return;
      }

      const queryEmbedding = Array(3072).fill(0.1);
      const results = await queryVectors(queryEmbedding, 3);

      expect(results.matches).toBeDefined();
      if (results.matches) {
        expect(results.matches.length).toBeLessThanOrEqual(3);
      }
    }, 30000);

    it('should filter by metadata if provided', async () => {
      if (!process.env.PINECONE_API_KEY) {
        console.log('Skipping: Pinecone credentials not configured');
        return;
      }

      const queryEmbedding = Array(3072).fill(0.1);
      const filter = { test: { $eq: true } };

      const results = await queryVectors(queryEmbedding, 5, filter);

      expect(results).toBeDefined();
      expect(results.matches).toBeDefined();

      if (results.matches && results.matches.length > 0) {
        results.matches.forEach((match: any) => {
          if (match.metadata) {
            expect(match.metadata.test).toBe(true);
          }
        });
      }
    }, 30000);
  });
});
