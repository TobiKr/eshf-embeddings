/**
 * Integration tests for OpenAI embeddings
 *
 * These tests require actual OpenAI API key in local.settings.json
 * Run with: npm test -- openai.test.ts
 *
 * NOTE: These tests make real API calls and may incur costs
 */

import { generateEmbedding, validateEmbedding } from '../../src/lib/openai/embeddings';

describe('OpenAI Integration Tests', () => {
  beforeAll(() => {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('OpenAI API key not set. Skipping integration tests.');
    }
  });

  describe('generateEmbedding', () => {
    it('should generate embeddings for English text', async () => {
      if (!process.env.OPENAI_API_KEY) {
        console.log('Skipping: OpenAI API key not configured');
        return;
      }

      const content = 'This is a test message for embedding generation.';
      const embedding = await generateEmbedding(content);

      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(3072); // text-embedding-3-large dimensions
      expect(embedding.every((val) => typeof val === 'number')).toBe(true);
      expect(embedding.every((val) => !isNaN(val))).toBe(true);
    }, 30000);

    it('should generate embeddings for German text', async () => {
      if (!process.env.OPENAI_API_KEY) {
        console.log('Skipping: OpenAI API key not configured');
        return;
      }

      const content =
        'Hallo zusammen, ich würde gerne euren Feedback zu meinem Grundriss bekommen.';
      const embedding = await generateEmbedding(content);

      expect(embedding.length).toBe(3072);
      expect(validateEmbedding(embedding)).toBe(true);
    }, 30000);

    it('should generate embeddings for long text', async () => {
      if (!process.env.OPENAI_API_KEY) {
        console.log('Skipping: OpenAI API key not configured');
        return;
      }

      const content = 'This is a longer text. '.repeat(100); // ~2300 chars
      const embedding = await generateEmbedding(content);

      expect(embedding.length).toBe(3072);
      expect(validateEmbedding(embedding)).toBe(true);
    }, 30000);

    it('should handle special characters and umlauts', async () => {
      if (!process.env.OPENAI_API_KEY) {
        console.log('Skipping: OpenAI API key not configured');
        return;
      }

      const content = 'Über größere Häuser äußern Österreich Müller';
      const embedding = await generateEmbedding(content);

      expect(embedding.length).toBe(3072);
      expect(validateEmbedding(embedding)).toBe(true);
    }, 30000);

    it('should generate different embeddings for different content', async () => {
      if (!process.env.OPENAI_API_KEY) {
        console.log('Skipping: OpenAI API key not configured');
        return;
      }

      const content1 = 'This is the first message about houses.';
      const content2 = 'This is a completely different topic about cars.';

      const embedding1 = await generateEmbedding(content1);
      const embedding2 = await generateEmbedding(content2);

      // Embeddings should be different
      expect(embedding1).not.toEqual(embedding2);

      // But both should be valid
      expect(validateEmbedding(embedding1)).toBe(true);
      expect(validateEmbedding(embedding2)).toBe(true);
    }, 30000);
  });

  describe('validateEmbedding', () => {
    it('should validate correct embedding dimensions', () => {
      const validEmbedding = Array(3072).fill(0.5);
      expect(validateEmbedding(validEmbedding)).toBe(true);
    });

    it('should reject embeddings with wrong dimensions', () => {
      const invalidEmbedding = Array(1536).fill(0.5);
      expect(validateEmbedding(invalidEmbedding)).toBe(false);
    });

    it('should reject non-array embeddings', () => {
      expect(validateEmbedding({} as any)).toBe(false);
      expect(validateEmbedding(null as any)).toBe(false);
      expect(validateEmbedding('not an array' as any)).toBe(false);
    });

    it('should reject embeddings with NaN values', () => {
      const invalidEmbedding = Array(3072).fill(0.5);
      invalidEmbedding[100] = NaN;
      expect(validateEmbedding(invalidEmbedding)).toBe(false);
    });

    it('should reject embeddings with non-number values', () => {
      const invalidEmbedding = Array(3072).fill(0.5);
      invalidEmbedding[100] = 'string' as any;
      expect(validateEmbedding(invalidEmbedding)).toBe(false);
    });
  });
});
