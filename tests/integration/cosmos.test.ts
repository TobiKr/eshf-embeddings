/**
 * Integration tests for Cosmos DB operations
 *
 * These tests require actual Cosmos DB credentials in local.settings.json
 * Run with: npm test -- cosmos.test.ts
 */

import {
  queryUnprocessedPosts,
  getProcessingStats,
  testConnection,
} from '../../src/lib/cosmos/queries';

describe('Cosmos DB Integration Tests', () => {
  beforeAll(async () => {
    // Load environment variables from local.settings.json
    if (process.env.COSMOS_ENDPOINT === undefined) {
      console.warn(
        'Cosmos DB environment variables not set. Skipping integration tests.'
      );
    }
  });

  describe('testConnection', () => {
    it('should successfully connect to Cosmos DB', async () => {
      if (!process.env.COSMOS_ENDPOINT) {
        console.log('Skipping: Cosmos DB credentials not configured');
        return;
      }

      await expect(testConnection()).resolves.toBe(true);
    }, 30000);
  });

  describe('queryUnprocessedPosts', () => {
    it('should query unprocessed posts with limit', async () => {
      if (!process.env.COSMOS_ENDPOINT) {
        console.log('Skipping: Cosmos DB credentials not configured');
        return;
      }

      const posts = await queryUnprocessedPosts(5);

      expect(Array.isArray(posts)).toBe(true);
      expect(posts.length).toBeLessThanOrEqual(5);

      if (posts.length > 0) {
        const post = posts[0];
        expect(post).toHaveProperty('id');
        expect(post).toHaveProperty('content');
        expect(post).toHaveProperty('threadId');
        expect(post).toHaveProperty('category');
        expect(post.embeddingProcessed).not.toBe(true);
      }
    }, 30000);

    it('should handle empty results gracefully', async () => {
      if (!process.env.COSMOS_ENDPOINT) {
        console.log('Skipping: Cosmos DB credentials not configured');
        return;
      }

      const posts = await queryUnprocessedPosts(0);
      expect(Array.isArray(posts)).toBe(true);
      expect(posts.length).toBe(0);
    }, 30000);
  });

  describe('getProcessingStats', () => {
    it('should retrieve processing statistics', async () => {
      if (!process.env.COSMOS_ENDPOINT) {
        console.log('Skipping: Cosmos DB credentials not configured');
        return;
      }

      const stats = await getProcessingStats();

      expect(stats).toHaveProperty('totalPosts');
      expect(stats).toHaveProperty('processedPosts');
      expect(stats).toHaveProperty('unprocessedPosts');

      expect(typeof stats.totalPosts).toBe('number');
      expect(typeof stats.processedPosts).toBe('number');
      expect(typeof stats.unprocessedPosts).toBe('number');

      expect(stats.totalPosts).toBeGreaterThanOrEqual(0);
      expect(stats.processedPosts).toBeGreaterThanOrEqual(0);
      expect(stats.unprocessedPosts).toBeGreaterThanOrEqual(0);

      // Total should equal processed + unprocessed
      expect(stats.totalPosts).toBe(stats.processedPosts + stats.unprocessedPosts);
    }, 30000);
  });
});
