/**
 * Unit tests for RAG reranker module
 */

import { rerankChunks, getRerankerConfigFromEnv, RerankerConfig } from '../../src/lib/rag/reranker';
import * as logger from '../../src/lib/utils/logger';

// Mock the logger
jest.mock('../../src/lib/utils/logger');

// Mock fetch globally
global.fetch = jest.fn();

describe('Reranker Module', () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockClear();
    jest.clearAllMocks();
  });

  const createMockConfig = (overrides?: Partial<RerankerConfig>): RerankerConfig => ({
    enabled: true,
    apiKey: 'test-api-key',
    model: 'jina-reranker-v2-base-multilingual',
    minScore: 0.3,
    timeout: 5000,
    maxRetries: 2,
    adaptiveTopK: {
      enabled: true,
      min: 3,
      max: 15,
      scoreGapThreshold: 0.1,
    },
    ...overrides,
  });

  const createMockChunks = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      id: `chunk-${i}`,
      score: 0.8 - i * 0.05,
      metadata: {
        postText: `Test content for chunk ${i}`,
        postId: `post-${i}`,
      },
    }));
  };

  const createMockJinaResponse = (chunkCount: number, scores?: number[]) => {
    const defaultScores = Array.from({ length: chunkCount }, (_, i) => 0.9 - i * 0.08);
    const relevanceScores = scores || defaultScores;

    return {
      model: 'jina-reranker-v2-base-multilingual',
      usage: {
        total_tokens: 1500,
        prompt_tokens: 1200,
      },
      results: relevanceScores.map((score, index) => ({
        index,
        relevance_score: score,
        document: {
          text: `Test content for chunk ${index}`,
        },
      })),
    };
  };

  describe('rerankChunks', () => {
    describe('Basic functionality', () => {
      it('should successfully rerank chunks using Jina API', async () => {
        const chunks = createMockChunks(5);
        const config = createMockConfig({
          adaptiveTopK: {
            enabled: false, // Disable adaptive top-k for this test
            min: 3,
            max: 15,
            scoreGapThreshold: 0.1,
          },
        });
        const jinaResponse = createMockJinaResponse(5, [0.95, 0.88, 0.75, 0.65, 0.45]);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => jinaResponse,
        } as Response);

        const result = await rerankChunks('test query', chunks, config);

        expect(result.chunks).toHaveLength(5);
        expect(result.chunks[0].rerankerScore).toBe(0.95);
        expect(result.chunks[1].rerankerScore).toBe(0.88);
        expect(result.metrics.originalCount).toBe(5);
        expect(result.metrics.finalCount).toBe(5);
      });

      it('should make correct API call to Jina', async () => {
        const chunks = createMockChunks(3);
        const config = createMockConfig();
        const jinaResponse = createMockJinaResponse(3);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => jinaResponse,
        } as Response);

        await rerankChunks('test query', chunks, config);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.jina.ai/v1/rerank',
          expect.objectContaining({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer test-api-key',
            },
            body: expect.stringContaining('test query'),
          })
        );

        const callBody = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
        expect(callBody.model).toBe('jina-reranker-v2-base-multilingual');
        expect(callBody.query).toBe('test query');
        expect(callBody.documents).toHaveLength(3);
      });

      it('should extract text content from chunk metadata', async () => {
        const chunks = [
          { id: 'c1', score: 0.8, metadata: { postText: 'Content from postText' } },
          { id: 'c2', score: 0.7, metadata: { contentPreview: 'Content from preview' } },
          { id: 'c3', score: 0.6, metadata: { text: 'Content from text' } },
        ];
        const config = createMockConfig();
        const jinaResponse = createMockJinaResponse(3);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => jinaResponse,
        } as Response);

        await rerankChunks('test query', chunks, config);

        const callBody = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
        expect(callBody.documents[0]).toBe('Content from postText');
        expect(callBody.documents[1]).toBe('Content from preview');
        expect(callBody.documents[2]).toBe('Content from text');
      });
    });

    describe('Disabled reranker', () => {
      it('should return original chunks when reranker is disabled', async () => {
        const chunks = createMockChunks(5);
        const config = createMockConfig({ enabled: false });

        const result = await rerankChunks('test query', chunks, config);

        expect(mockFetch).not.toHaveBeenCalled();
        expect(result.chunks).toHaveLength(5);
        expect(result.chunks[0].originalScore).toBe(result.chunks[0].rerankerScore);
        expect(result.metrics.rerankingLatency).toBe(0);
      });

      it('should return empty result for empty chunks', async () => {
        const config = createMockConfig();

        const result = await rerankChunks('test query', [], config);

        expect(mockFetch).not.toHaveBeenCalled();
        expect(result.chunks).toHaveLength(0);
        expect(result.metrics.originalCount).toBe(0);
      });
    });

    describe('Relevance score filtering', () => {
      it('should filter out chunks below minimum score threshold', async () => {
        const chunks = createMockChunks(6);
        const config = createMockConfig({ minScore: 0.5 });
        // Scores: 0.9, 0.7, 0.55, 0.4, 0.25, 0.1 (last 3 should be filtered)
        const jinaResponse = createMockJinaResponse(6, [0.9, 0.7, 0.55, 0.4, 0.25, 0.1]);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => jinaResponse,
        } as Response);

        const result = await rerankChunks('test query', chunks, config);

        expect(result.chunks.length).toBe(3); // Only scores >= 0.5
        expect(result.chunks[0].rerankerScore).toBe(0.9);
        expect(result.chunks[1].rerankerScore).toBe(0.7);
        expect(result.chunks[2].rerankerScore).toBe(0.55);
        expect(result.metrics.filteredCount).toBe(3);
      });

      it('should handle case where all chunks are filtered', async () => {
        const chunks = createMockChunks(3);
        const config = createMockConfig({ minScore: 0.9 });
        const jinaResponse = createMockJinaResponse(3, [0.5, 0.4, 0.3]);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => jinaResponse,
        } as Response);

        const result = await rerankChunks('test query', chunks, config);

        expect(result.chunks).toHaveLength(0);
        expect(result.metrics.filteredCount).toBe(3);
      });
    });

    describe('Adaptive top-k selection', () => {
      it('should detect score gap and cut at appropriate position', async () => {
        const chunks = createMockChunks(10);
        const config = createMockConfig({
          adaptiveTopK: {
            enabled: true,
            min: 3,
            max: 15,
            scoreGapThreshold: 0.15,
          },
        });
        // Large gap after position 3: 0.85 - 0.6 = 0.25 > 0.15
        const jinaResponse = createMockJinaResponse(10, [
          0.95, 0.92, 0.88, 0.85, 0.6, 0.4, 0.38, 0.35, 0.33, 0.3,
        ]);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => jinaResponse,
        } as Response);

        const result = await rerankChunks('test query', chunks, config);

        // Should cut at position 4 (after detecting gap between 0.85 and 0.6)
        expect(result.chunks.length).toBe(4);
        expect(result.chunks[3].rerankerScore).toBe(0.85);
      });

      it('should respect minimum top-k bound', async () => {
        const chunks = createMockChunks(10);
        const config = createMockConfig({
          adaptiveTopK: {
            enabled: true,
            min: 5,
            max: 15,
            scoreGapThreshold: 0.2,
          },
        });
        // Gap at position 2, but min is 5
        const jinaResponse = createMockJinaResponse(10, [0.9, 0.85, 0.5, 0.48, 0.45, 0.4, 0.38, 0.35, 0.3, 0.25]);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => jinaResponse,
        } as Response);

        const result = await rerankChunks('test query', chunks, config);

        // Should keep at least min=5 chunks
        expect(result.chunks.length).toBeGreaterThanOrEqual(5);
      });

      it('should respect maximum top-k bound', async () => {
        const chunks = createMockChunks(20);
        const config = createMockConfig({
          adaptiveTopK: {
            enabled: true,
            min: 3,
            max: 10,
            scoreGapThreshold: 0.5, // Very high threshold, no gap will be found
          },
        });
        const jinaResponse = createMockJinaResponse(20);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => jinaResponse,
        } as Response);

        const result = await rerankChunks('test query', chunks, config);

        // Should cap at max=10 chunks
        expect(result.chunks.length).toBeLessThanOrEqual(10);
      });

      it('should return all chunks when count is below minimum', async () => {
        const chunks = createMockChunks(2);
        const config = createMockConfig({
          adaptiveTopK: {
            enabled: true,
            min: 5,
            max: 15,
            scoreGapThreshold: 0.1,
          },
        });
        const jinaResponse = createMockJinaResponse(2);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => jinaResponse,
        } as Response);

        const result = await rerankChunks('test query', chunks, config);

        expect(result.chunks.length).toBe(2);
      });

      it('should work when adaptive top-k is disabled', async () => {
        const chunks = createMockChunks(10);
        const config = createMockConfig({
          minScore: 0.2, // Lower threshold so all chunks pass
          adaptiveTopK: {
            enabled: false,
            min: 3,
            max: 10,
            scoreGapThreshold: 0.1,
          },
        });
        // All scores above minScore threshold
        const jinaResponse = createMockJinaResponse(10, [
          0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45,
        ]);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => jinaResponse,
        } as Response);

        const result = await rerankChunks('test query', chunks, config);

        // Should return all filtered chunks (no adaptive selection)
        expect(result.chunks.length).toBe(10);
      });
    });

    describe('Error handling and fallback', () => {
      it('should fallback to original scores when API fails', async () => {
        const chunks = createMockChunks(5);
        const config = createMockConfig({ maxRetries: 0 });

        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        const result = await rerankChunks('test query', chunks, config);

        expect(result.chunks).toHaveLength(5);
        // Should use original vector search scores
        expect(result.chunks[0].rerankerScore).toBe(result.chunks[0].originalScore);
        expect(logger.error).toHaveBeenCalledWith(
          'Jina reranking failed, falling back to original scores',
          expect.any(Object)
        );
      });

      it('should handle API timeout', async () => {
        const chunks = createMockChunks(3);
        const config = createMockConfig({ timeout: 100, maxRetries: 0 });

        mockFetch.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve({ ok: true } as Response), 200);
            })
        );

        const result = await rerankChunks('test query', chunks, config);

        expect(result.chunks).toHaveLength(3);
        expect(result.chunks[0].rerankerScore).toBe(result.chunks[0].originalScore);
      });

      it('should handle non-OK HTTP responses', async () => {
        const chunks = createMockChunks(3);
        const config = createMockConfig({ maxRetries: 0 });

        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => 'Internal Server Error',
        } as Response);

        const result = await rerankChunks('test query', chunks, config);

        expect(result.chunks).toHaveLength(3);
        expect(result.chunks[0].rerankerScore).toBe(result.chunks[0].originalScore);
      });

      it('should handle missing API key gracefully', async () => {
        const chunks = createMockChunks(3);
        const config = createMockConfig({ apiKey: '', maxRetries: 0 });

        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: async () => 'Unauthorized',
        } as Response);

        const result = await rerankChunks('test query', chunks, config);

        expect(result.chunks).toHaveLength(3);
      });
    });

    describe('Retry logic', () => {
      it('should retry on retryable errors', async () => {
        const chunks = createMockChunks(3);
        const config = createMockConfig({ maxRetries: 2 });
        const jinaResponse = createMockJinaResponse(3);

        // Fail twice, then succeed
        mockFetch
          .mockRejectedValueOnce(new Error('Network timeout'))
          .mockRejectedValueOnce(new Error('503 Service Unavailable'))
          .mockResolvedValueOnce({
            ok: true,
            json: async () => jinaResponse,
          } as Response);

        const result = await rerankChunks('test query', chunks, config);

        expect(mockFetch).toHaveBeenCalledTimes(3);
        expect(result.chunks).toHaveLength(3);
        expect(result.chunks[0].rerankerScore).toBeGreaterThan(0);
        expect(logger.warn).toHaveBeenCalledTimes(2);
      });

      it('should give up after max retries', async () => {
        const chunks = createMockChunks(3);
        const config = createMockConfig({ maxRetries: 2 });

        // Fail all attempts
        mockFetch
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'));

        const result = await rerankChunks('test query', chunks, config);

        expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
        expect(result.chunks[0].rerankerScore).toBe(result.chunks[0].originalScore);
      });

      it('should not retry on non-retryable errors', async () => {
        const chunks = createMockChunks(3);
        const config = createMockConfig({ maxRetries: 2 });

        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: async () => 'Bad Request',
        } as Response);

        const result = await rerankChunks('test query', chunks, config);

        expect(mockFetch).toHaveBeenCalledTimes(1); // No retries for 4xx errors
        expect(result.chunks[0].rerankerScore).toBe(result.chunks[0].originalScore);
      });

      it('should use exponential backoff for retries', async () => {
        const chunks = createMockChunks(3);
        const config = createMockConfig({ maxRetries: 2 });
        const jinaResponse = createMockJinaResponse(3);

        const startTime = Date.now();

        mockFetch
          .mockRejectedValueOnce(new Error('timeout'))
          .mockRejectedValueOnce(new Error('timeout'))
          .mockResolvedValueOnce({
            ok: true,
            json: async () => jinaResponse,
          } as Response);

        await rerankChunks('test query', chunks, config);

        const duration = Date.now() - startTime;
        // Should wait ~1s + ~2s = ~3s total (with some tolerance)
        expect(duration).toBeGreaterThanOrEqual(2500);
      });
    });

    describe('Metrics calculation', () => {
      it('should calculate correct metrics', async () => {
        const chunks = createMockChunks(10);
        const config = createMockConfig({
          minScore: 0.5,
          adaptiveTopK: {
            enabled: false, // Disable adaptive top-k to get predictable count
            min: 3,
            max: 15,
            scoreGapThreshold: 0.1,
          },
        });
        const jinaResponse = createMockJinaResponse(10, [
          0.9, 0.85, 0.8, 0.75, 0.7, 0.6, 0.45, 0.4, 0.35, 0.3,
        ]);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => jinaResponse,
        } as Response);

        const result = await rerankChunks('test query', chunks, config);

        expect(result.metrics.originalCount).toBe(10);
        // Should filter out chunks with scores < 0.5
        expect(result.metrics.filteredCount).toBeGreaterThan(0);
        expect(result.metrics.finalCount).toBeLessThan(10);
        expect(result.metrics.finalCount).toBeGreaterThan(0);
        expect(result.metrics.rerankingLatency).toBeGreaterThanOrEqual(0);
        expect(result.metrics.scoreMean).toBeGreaterThan(0);
        expect(result.metrics.scoreStdDev).toBeGreaterThanOrEqual(0);
      });

      it('should track reranking latency', async () => {
        const chunks = createMockChunks(3);
        const config = createMockConfig();
        const jinaResponse = createMockJinaResponse(3);

        mockFetch.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              setTimeout(
                () =>
                  resolve({
                    ok: true,
                    json: async () => jinaResponse,
                  } as Response),
                50
              );
            })
        );

        const result = await rerankChunks('test query', chunks, config);

        expect(result.metrics.rerankingLatency).toBeGreaterThanOrEqual(50);
      });
    });
  });

  describe('getRerankerConfigFromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should load configuration from environment variables', () => {
      process.env.RERANKER_ENABLED = 'true';
      process.env.JINA_API_KEY = 'test-key';
      process.env.JINA_RERANKER_MODEL = 'test-model';
      process.env.RERANKER_MIN_SCORE = '0.5';
      process.env.RERANKER_TIMEOUT_MS = '3000';
      process.env.RERANKER_MAX_RETRIES = '3';
      process.env.RERANKER_ADAPTIVE_TOPK_MIN = '5';
      process.env.RERANKER_ADAPTIVE_TOPK_MAX = '20';
      process.env.RERANKER_SCORE_GAP_THRESHOLD = '0.2';

      const config = getRerankerConfigFromEnv();

      expect(config.enabled).toBe(true);
      expect(config.apiKey).toBe('test-key');
      expect(config.model).toBe('test-model');
      expect(config.minScore).toBe(0.5);
      expect(config.timeout).toBe(3000);
      expect(config.maxRetries).toBe(3);
      expect(config.adaptiveTopK.min).toBe(5);
      expect(config.adaptiveTopK.max).toBe(20);
      expect(config.adaptiveTopK.scoreGapThreshold).toBe(0.2);
    });

    it('should use default values when env vars are not set', () => {
      delete process.env.RERANKER_ENABLED;
      delete process.env.JINA_API_KEY;
      delete process.env.JINA_RERANKER_MODEL;

      const config = getRerankerConfigFromEnv();

      expect(config.enabled).toBe(true);
      expect(config.apiKey).toBe('');
      expect(config.model).toBe('jina-reranker-v2-base-multilingual');
      expect(config.minScore).toBe(0.3);
      expect(config.timeout).toBe(5000);
      expect(config.maxRetries).toBe(2);
    });

    it('should handle RERANKER_ENABLED=false', () => {
      process.env.RERANKER_ENABLED = 'false';

      const config = getRerankerConfigFromEnv();

      expect(config.enabled).toBe(false);
    });
  });
});
