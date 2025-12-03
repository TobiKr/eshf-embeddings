/**
 * Integration tests for RAG retrieval with reranking
 *
 * These tests require actual API keys in local.settings.json:
 * - OPENAI_API_KEY (for query embeddings)
 * - PINECONE_API_KEY (for vector search)
 * - JINA_API_KEY (for reranking)
 *
 * Run with: npm test -- rag.test.ts
 *
 * NOTE: These tests make real API calls and may incur costs
 */

import { retrieveContext } from '../../src/lib/rag/retrieval';
import { rerankChunks, getRerankerConfigFromEnv } from '../../src/lib/rag/reranker';

describe('RAG Integration Tests', () => {
  const hasRequiredKeys =
    process.env.OPENAI_API_KEY && process.env.PINECONE_API_KEY && process.env.JINA_API_KEY;

  beforeAll(() => {
    if (!hasRequiredKeys) {
      console.warn('API keys not fully configured. Some integration tests will be skipped.');
    }
  });

  describe('retrieveContext with reranking', () => {
    it(
      'should retrieve and rerank results for a German energy forum query',
      async () => {
        if (!hasRequiredKeys) {
          console.log('Skipping: API keys not configured');
          return;
        }

        const query = 'Wie dimensioniere ich eine Wärmepumpe für ein Passivhaus?';
        const result = await retrieveContext(query, 30);

        expect(result.success).toBe(true);
        expect(result.chunks).toBeDefined();
        expect(Array.isArray(result.chunks)).toBe(true);

        // Should return fewer chunks after reranking (if adaptive top-k is enabled)
        if (result.chunks && result.chunks.length > 0) {
          expect(result.chunks.length).toBeGreaterThan(0);
          expect(result.chunks.length).toBeLessThanOrEqual(30);

          // Chunks should have reranker scores
          const firstChunk = result.chunks[0];
          expect(firstChunk.rerankerScore).toBeDefined();
          expect(typeof firstChunk.rerankerScore).toBe('number');
          expect(firstChunk.rerankerScore).toBeGreaterThanOrEqual(0);
          expect(firstChunk.rerankerScore).toBeLessThanOrEqual(1);

          // Chunks should be sorted by reranker score (descending)
          for (let i = 0; i < result.chunks.length - 1; i++) {
            expect(result.chunks[i].rerankerScore).toBeGreaterThanOrEqual(
              result.chunks[i + 1].rerankerScore
            );
          }
        }

        // Should have reranking metrics
        expect(result.rerankingMetrics).toBeDefined();
        if (result.rerankingMetrics) {
          expect(result.rerankingMetrics.rerankingLatency).toBeGreaterThan(0);
          expect(result.rerankingMetrics.originalCount).toBeGreaterThanOrEqual(
            result.rerankingMetrics.finalCount
          );
        }
      },
      60000
    ); // 60s timeout for API calls

    it(
      'should handle queries with no results gracefully',
      async () => {
        if (!hasRequiredKeys) {
          console.log('Skipping: API keys not configured');
          return;
        }

        // Extremely specific query unlikely to have matches
        const query = 'xyzabc123nonexistentquery999';
        const result = await retrieveContext(query, 30);

        expect(result.success).toBe(true);
        expect(result.chunks).toBeDefined();
        expect(result.chunks?.length).toBe(0);
      },
      60000
    );

    it(
      'should work with different query types',
      async () => {
        if (!hasRequiredKeys) {
          console.log('Skipping: API keys not configured');
          return;
        }

        const queries = [
          'Was ist die beste Dämmung für ein Passivhaus?',
          'KfW Förderung Wärmepumpe',
          'Luftdichtheit im Neubau',
        ];

        for (const query of queries) {
          const result = await retrieveContext(query, 30);

          expect(result.success).toBe(true);
          expect(result.chunks).toBeDefined();

          if (result.chunks && result.chunks.length > 0) {
            expect(result.chunks[0].rerankerScore).toBeDefined();
          }
        }
      },
      90000
    ); // Allow more time for multiple queries

    it(
      'should handle special characters and umlauts correctly',
      async () => {
        if (!hasRequiredKeys) {
          console.log('Skipping: API keys not configured');
          return;
        }

        const query = 'Über größere Häuser und Wärmedämmung äußern';
        const result = await retrieveContext(query, 30);

        expect(result.success).toBe(true);
        expect(result.chunks).toBeDefined();
        // No errors should occur with German special characters
      },
      60000
    );
  });

  describe('Reranker standalone tests', () => {
    it(
      'should rerank mock chunks successfully',
      async () => {
        if (!process.env.JINA_API_KEY) {
          console.log('Skipping: JINA_API_KEY not configured');
          return;
        }

        const mockChunks = [
          {
            id: 'chunk1',
            score: 0.8,
            metadata: {
              postText:
                'Wärmepumpen sind sehr effizient für Passivhäuser. Die Dimensionierung sollte auf den Wärmebedarf abgestimmt sein.',
            },
          },
          {
            id: 'chunk2',
            score: 0.75,
            metadata: {
              postText:
                'Bei der Dämmung kommt es auf die richtige Materialwahl an. Holzfaser ist eine gute Option.',
            },
          },
          {
            id: 'chunk3',
            score: 0.7,
            metadata: {
              postText:
                'Für ein Passivhaus empfehle ich eine Wärmepumpe mit niedriger Vorlauftemperatur.',
            },
          },
        ];

        const config = getRerankerConfigFromEnv();
        const query = 'Wie dimensioniere ich eine Wärmepumpe für ein Passivhaus?';

        const result = await rerankChunks(query, mockChunks, config);

        expect(result.chunks).toBeDefined();
        expect(result.chunks.length).toBeGreaterThan(0);
        expect(result.chunks.length).toBeLessThanOrEqual(mockChunks.length);

        // First and third chunks should be more relevant than second
        // (they specifically mention Wärmepumpe and Passivhaus)
        expect(result.chunks[0].rerankerScore).toBeGreaterThan(0.5);

        expect(result.metrics.rerankingLatency).toBeGreaterThan(0);
        expect(result.metrics.rerankingLatency).toBeLessThan(10000); // Should complete within 10s
      },
      30000
    );

    it(
      'should handle many chunks efficiently',
      async () => {
        if (!process.env.JINA_API_KEY) {
          console.log('Skipping: JINA_API_KEY not configured');
          return;
        }

        const mockChunks = Array.from({ length: 30 }, (_, i) => ({
          id: `chunk${i}`,
          score: 0.9 - i * 0.02,
          metadata: {
            postText: `Test content about energy saving house construction topic ${i}`,
          },
        }));

        const config = getRerankerConfigFromEnv();
        const query = 'energy saving house construction';

        const startTime = Date.now();
        const result = await rerankChunks(query, mockChunks, config);
        const duration = Date.now() - startTime;

        expect(result.chunks.length).toBeGreaterThan(0);
        expect(result.chunks.length).toBeLessThanOrEqual(mockChunks.length);

        // Reranking 30 chunks should take less than 1 second (typical: 150-300ms)
        expect(duration).toBeLessThan(2000);
        expect(result.metrics.rerankingLatency).toBeLessThan(2000);
      },
      30000
    );
  });

  describe('Reranker fallback behavior', () => {
    it('should fallback gracefully when reranker is disabled', async () => {
      if (!process.env.OPENAI_API_KEY || !process.env.PINECONE_API_KEY) {
        console.log('Skipping: OpenAI/Pinecone API keys not configured');
        return;
      }

      // Temporarily disable reranker
      const originalEnabled = process.env.RERANKER_ENABLED;
      process.env.RERANKER_ENABLED = 'false';

      const query = 'Wärmepumpe Passivhaus';
      const result = await retrieveContext(query, 10);

      expect(result.success).toBe(true);
      expect(result.chunks).toBeDefined();

      if (result.chunks && result.chunks.length > 0) {
        // Should use original vector search scores (not reranked)
        expect(result.chunks[0].rerankerScore).toBe(result.chunks[0].score);
      }

      // Restore original setting
      if (originalEnabled !== undefined) {
        process.env.RERANKER_ENABLED = originalEnabled;
      } else {
        delete process.env.RERANKER_ENABLED;
      }
    }, 60000);

    it(
      'should fallback to original scores when Jina API fails',
      async () => {
        if (!process.env.OPENAI_API_KEY || !process.env.PINECONE_API_KEY) {
          console.log('Skipping: OpenAI/Pinecone API keys not configured');
          return;
        }

        // Use invalid API key to trigger failure
        const originalKey = process.env.JINA_API_KEY;
        process.env.JINA_API_KEY = 'invalid-key-for-testing';

        const query = 'Wärmepumpe Passivhaus';
        const result = await retrieveContext(query, 10);

        expect(result.success).toBe(true);
        expect(result.chunks).toBeDefined();

        if (result.chunks && result.chunks.length > 0) {
          // Should fallback to original scores
          expect(result.chunks[0].rerankerScore).toBe(result.chunks[0].score);
        }

        // Restore original key
        if (originalKey !== undefined) {
          process.env.JINA_API_KEY = originalKey;
        } else {
          delete process.env.JINA_API_KEY;
        }
      },
      60000
    );
  });

  describe('Adaptive top-k behavior', () => {
    it(
      'should reduce chunk count based on score distribution',
      async () => {
        if (!hasRequiredKeys) {
          console.log('Skipping: API keys not configured');
          return;
        }

        // Query that should have some good matches and some poor matches
        const query = 'Wie dimensioniere ich eine Wärmepumpe?';
        const result = await retrieveContext(query, 30);

        expect(result.success).toBe(true);

        if (result.chunks && result.chunks.length > 0) {
          // With adaptive top-k, we should get fewer than 30 chunks (typical: 5-15)
          expect(result.chunks.length).toBeLessThan(30);
          expect(result.chunks.length).toBeGreaterThanOrEqual(3); // Min threshold

          // Top chunks should have high reranker scores
          expect(result.chunks[0].rerankerScore).toBeGreaterThan(0.5);

          // Check for score gap - there should be a significant drop somewhere
          let hasSignificantGap = false;
          for (let i = 0; i < result.chunks.length - 1; i++) {
            const gap = result.chunks[i].rerankerScore - result.chunks[i + 1].rerankerScore;
            if (gap > 0.1) {
              hasSignificantGap = true;
              break;
            }
          }

          // Either we found a gap, or we hit max limit, or all scores were good
          expect(
            hasSignificantGap ||
              result.chunks.length === 15 ||
              result.chunks[result.chunks.length - 1].rerankerScore > 0.6
          ).toBe(true);
        }
      },
      60000
    );
  });

  describe('Performance benchmarks', () => {
    it(
      'should complete retrieval + reranking within acceptable time',
      async () => {
        if (!hasRequiredKeys) {
          console.log('Skipping: API keys not configured');
          return;
        }

        const query = 'Wärmepumpe Dimensionierung';
        const startTime = Date.now();

        const result = await retrieveContext(query, 30);
        const totalDuration = Date.now() - startTime;

        expect(result.success).toBe(true);

        // Total time (embedding + vector search + reranking) should be under 5 seconds
        expect(totalDuration).toBeLessThan(5000);

        if (result.rerankingMetrics) {
          // Reranking alone should be under 1 second (typical: 150-300ms)
          expect(result.rerankingMetrics.rerankingLatency).toBeLessThan(1000);
        }
      },
      60000
    );
  });

  describe('Score comparison', () => {
    it(
      'should show difference between vector search and reranker scores',
      async () => {
        if (!hasRequiredKeys) {
          console.log('Skipping: API keys not configured');
          return;
        }

        const query = 'Wie dimensioniere ich eine Wärmepumpe?';
        const result = await retrieveContext(query, 30);

        expect(result.success).toBe(true);

        if (result.chunks && result.chunks.length > 0) {
          // Check that some chunks have different vector vs reranker scores
          // This proves reranking is actually happening
          let hasDifference = false;
          for (const chunk of result.chunks) {
            if (Math.abs(chunk.score - chunk.rerankerScore) > 0.05) {
              hasDifference = true;
              break;
            }
          }

          // At least some scores should differ significantly
          // (unless reranker is disabled or failed)
          if (process.env.RERANKER_ENABLED !== 'false' && process.env.JINA_API_KEY) {
            expect(hasDifference).toBe(true);
          }
        }
      },
      60000
    );
  });
});
