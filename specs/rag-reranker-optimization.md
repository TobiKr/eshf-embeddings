# RAG Reranker and Optimization Implementation

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [specs/PLANS.md](./PLANS.md).

## Purpose / Big Picture

Currently, the RAG (Retrieval-Augmented Generation) chat endpoint retrieves 30 chunks from Pinecone using vector similarity alone, formats all of them into the context, and sends them to Claude for answer generation. This approach has several limitations:

1. **No reranking**: Results are ordered only by vector similarity, which may not capture semantic relevance to the specific question
2. **Fixed context size**: Always uses 30 chunks regardless of query complexity or result quality
3. **No relevance filtering**: Includes low-quality matches that may confuse the LLM
4. **Inefficient token usage**: Sends irrelevant context to Claude, increasing costs and latency

After this implementation, users will experience:
- **More accurate answers**: A reranking step ensures the most semantically relevant chunks are prioritized
- **Faster responses**: Adaptive top-k reduces unnecessary context, decreasing Claude API latency
- **Lower costs**: Fewer input tokens to Claude by filtering out low-relevance chunks
- **Better citations**: Top sources shown to users will be more relevant to their questions

**How to verify**: After implementation, query the chat endpoint with a German energy forum question (e.g., "Wie dimensioniere ich eine Wärmepumpe für ein Passivhaus?"). The response should cite fewer but more relevant sources, arrive faster, and provide more focused answers compared to the current implementation.

## Progress

- [x] Create reranker module structure and types
- [x] Implement Jina AI reranker API integration
- [x] Add relevance score threshold filtering
- [x] Implement adaptive top-k selection logic
- [x] Add error handling and fallback strategies
- [x] Integrate reranker into retrieval pipeline
- [x] Add telemetry and monitoring for reranking performance
- [x] Write unit tests for reranking logic (with mocked API)
- [x] Write integration tests for full retrieval + reranking flow
- [ ] Performance benchmark: measure latency and accuracy improvements (ready for manual testing)
- [x] Update documentation and configuration

## Surprises & Discoveries

**Implementation Date**: 2025-12-03

1. **TypeScript Strict Mode**: Required explicit type casting for `response.json()` return values. Used `as JinaRerankResponse` to satisfy strict type checking.

2. **Case-Sensitive Error Matching**: The initial retry logic failed because error message matching was case-sensitive. Changed `isRetryableError()` to use `.toLowerCase()` for reliable error detection across different error sources.

3. **Adaptive Top-K Behavior**: The score gap detection works very effectively in tests, often reducing 30 chunks down to 4-7 relevant ones. The default threshold of 0.1 provides good balance between precision and recall.

4. **Test Complexity**: Testing retry logic and exponential backoff required careful mock setup. Using `mockRejectedValueOnce()` chained calls instead of `mockRejectedValue()` was necessary to properly simulate retry scenarios.

5. **Fallback Reliability**: The graceful fallback to original vector search scores ensures the system remains operational even when the Jina API is unavailable, maintaining service reliability.

## Decision Log

- **Decision**: Use Jina AI Reranker API instead of local in-process reranking (@xenova/transformers)
  **Rationale**: (1) Extremely cost-effective (~$5/month for typical usage vs. $0 for local but worse quality), (2) significantly better accuracy especially for German language (state-of-the-art models), (3) much faster inference (150-250ms vs 300-600ms), (4) no cold start penalty from model loading (2-5s saved), (5) lighter Azure Functions (no 80-200MB model in memory), (6) automatic model improvements without code changes, (7) forum content is public data so privacy concerns are minimal
  **Date**: 2025-12-03

- **Decision**: Implement adaptive top-k based on score distribution rather than fixed thresholds
  **Rationale**: Different queries have different characteristics - some have many relevant results, others few. Score distribution analysis (e.g., score gap detection) provides a more robust signal than hard thresholds.
  **Date**: 2025-12-03

- **Decision**: Keep vector search at top-k=30, then rerank to adaptive k (5-15 typical)
  **Rationale**: Vector search is fast and cheap; reranking is more expensive. Casting a wider net in vector search ensures we don't miss relevant content, then reranking focuses on the best matches.
  **Date**: 2025-12-03

- **Decision**: Use Jina AI's multilingual reranker model (jina-reranker-v2-base-multilingual)
  **Rationale**: (1) Excellent German language support as part of multilingual training, (2) specifically optimized for reranking tasks, (3) handles up to 1024 tokens per document, (4) proven performance on MTEB benchmarks including German datasets
  **Date**: 2025-12-03

- **Decision**: Implement graceful fallback when Jina API fails
  **Rationale**: If Jina API is unavailable or rate-limited, fall back to using original vector search scores to maintain service availability. Log failures for monitoring but don't block user queries.
  **Date**: 2025-12-03

## Outcomes & Retrospective

_This section will be populated at completion._

## Context and Orientation

### Current State

The RAG pipeline is implemented in these key files:

- **[src/lib/rag/retrieval.ts](../src/lib/rag/retrieval.ts)**: Handles vector search via Pinecone. The `retrieveContext` function generates a query embedding and retrieves top-k=30 chunks.
- **[src/lib/rag/prompts.ts](../src/lib/rag/prompts.ts)**: Formats retrieved chunks into context for Claude. The `formatContextFromChunks` function takes all retrieved chunks and creates a text prompt.
- **[src/chatApi.ts](../src/chatApi.ts)**: The HTTP endpoint that orchestrates retrieval and generation. It calls `retrieveContext`, formats context, and streams responses from Claude.
- **[src/lib/pinecone/upsert.ts](../src/lib/pinecone/upsert.ts)**: Contains `queryVectors` function that performs the actual Pinecone query.

### Technology Stack

- **Runtime**: Node.js 20.x with TypeScript 5.x
- **Vector DB**: Pinecone (stores OpenAI embeddings)
- **Embeddings**: OpenAI text-embedding-3-small/large
- **LLM**: Claude Sonnet 4.5 via Anthropic SDK
- **Testing**: Jest with ts-jest

### Key Concepts

**Reranking**: A two-stage retrieval process. Stage 1 (vector search) uses fast approximate nearest neighbor search to retrieve candidate documents. Stage 2 (reranking) uses a more sophisticated model (cross-encoder) to reorder candidates by computing query-document relevance scores directly.

**Cross-encoder**: A transformer model that takes a (query, document) pair as input and outputs a relevance score. Unlike bi-encoders (which embed query and document separately), cross-encoders can model interaction between query and document tokens, yielding more accurate relevance scores at the cost of higher latency.

**Adaptive top-k**: Instead of always sending a fixed number of chunks to the LLM, dynamically select the number based on result quality. For example, if the top result has a score of 0.95 and the next is 0.45, we can confidently stop at the top result. If scores are closer (e.g., 0.85, 0.83, 0.80), we include more chunks.

**Relevance threshold**: A minimum score below which chunks are discarded. This filters out low-quality matches that may harm LLM answer quality.

## Plan of Work

### Phase 1: Reranker Module (Core Logic)

**Goal**: Create a reusable reranker module that integrates Jina AI's reranker API to compute semantic relevance scores and returns reranked results.

1. **Create module structure**:
   - New file: `src/lib/rag/reranker.ts`
   - Define interfaces: `RerankerConfig`, `RerankResult`, `ScoredChunk`, `JinaRerankRequest`, `JinaRerankResponse`
   - Define function: `rerankChunks(query: string, chunks: any[], config?: RerankerConfig): Promise<RerankResult>`

2. **Implement Jina AI reranking integration**:
   - Create Jina API client configuration (base URL: `https://api.jina.ai/v1/rerank`)
   - Build request payload with query and documents array (extract text from chunks)
   - Handle Jina API authentication via Bearer token (JINA_API_KEY environment variable)
   - Parse Jina response and map relevance scores back to original chunks
   - Return chunks sorted by reranker score (descending)

3. **Add error handling and fallback**:
   - Catch API errors (network failures, rate limits, timeouts)
   - If Jina API fails, log error and return original chunks with vector search scores
   - Set timeout for API calls (default: 5 seconds)
   - Implement retry logic with exponential backoff (max 2 retries)

4. **Add relevance filtering**:
   - Filter out chunks below a configurable threshold (e.g., score < 0.3)
   - Log filtered chunk count for monitoring

5. **Implement adaptive top-k selection**:
   - Analyze score distribution after reranking
   - Detect score gaps (e.g., if score[i] - score[i+1] > threshold, cut at i)
   - Apply min and max bounds (e.g., min=3, max=15)
   - Return only the selected top-k chunks

**Files to create**:
- `src/lib/rag/reranker.ts` - Core reranking logic with Jina API integration

**Files to modify**:
- None - Node.js built-in `fetch` API is sufficient for HTTP requests

### Phase 2: Integration into Retrieval Pipeline

**Goal**: Integrate the reranker into the existing retrieval flow so that chat queries automatically use reranked results.

1. **Modify `retrieveContext` in [src/lib/rag/retrieval.ts](../src/lib/rag/retrieval.ts)**:
   - After querying Pinecone, call `rerankChunks` to rerank results
   - Replace the original chunks with reranked chunks in the return value
   - Add logging for before/after chunk counts and score distributions

2. **Add configuration options**:
   - Environment variables for reranker settings:
     - `RERANKER_ENABLED` (default: true)
     - `JINA_API_KEY` (required when reranker enabled)
     - `JINA_RERANKER_MODEL` (default: jina-reranker-v2-base-multilingual)
     - `RERANKER_MIN_SCORE` (default: 0.3)
     - `RERANKER_ADAPTIVE_TOPK_MIN` (default: 3)
     - `RERANKER_ADAPTIVE_TOPK_MAX` (default: 15)
     - `RERANKER_SCORE_GAP_THRESHOLD` (default: 0.1)
     - `RERANKER_TIMEOUT_MS` (default: 5000)
     - `RERANKER_MAX_RETRIES` (default: 2)
   - Add config type in `src/types/config.ts`

3. **Update context formatting**:
   - Modify `formatContextFromChunks` in [src/lib/rag/prompts.ts](../src/lib/rag/prompts.ts) to handle reranked scores
   - Optionally add reranker score to the context for transparency (e.g., "Relevanz: 87% (Reranked)")

**Files to modify**:
- `src/lib/rag/retrieval.ts` - Add reranking step
- `src/types/config.ts` - Add reranker config types
- `src/lib/rag/prompts.ts` - Update formatting to show reranked scores

**Files to create**:
- `.env.example` - Document new environment variables

### Phase 3: Telemetry and Monitoring

**Goal**: Instrument the reranker to track performance, accuracy, and operational metrics.

1. **Add telemetry in reranker module**:
   - Log reranking latency (time to compute scores)
   - Log score distributions (mean, min, max, stddev)
   - Log chunk filtering statistics (original count, filtered count, final count)
   - Log adaptive top-k decisions (why a specific k was chosen)

2. **Add Application Insights tracking**:
   - Track custom metrics: `reranker.latency`, `reranker.chunks_filtered`, `reranker.final_topk`
   - Track custom events: `reranker.low_confidence` (when all scores are below threshold)

3. **Update logger module**:
   - Ensure `src/lib/utils/logger.ts` supports structured logging for these new fields

**Files to modify**:
- `src/lib/rag/reranker.ts` - Add telemetry calls
- `src/lib/utils/logger.ts` - Ensure support for reranker events

### Phase 4: Testing and Validation

**Goal**: Comprehensive testing to ensure reranking works correctly and improves answer quality.

1. **Unit tests for reranker module** (`tests/unit/reranker.test.ts`):
   - Mock Jina API responses using Jest mocks
   - Test successful reranking (scores are computed and chunks reordered)
   - Test relevance filtering (chunks below threshold are removed)
   - Test adaptive top-k logic (score gaps, min/max bounds)
   - Test error handling (API failures, timeouts, rate limits)
   - Test fallback behavior (returns original scores when API fails)
   - Test edge cases (empty results, all low scores, all high scores)
   - Test retry logic with exponential backoff

2. **Integration tests** (`tests/integration/rag.test.ts`):
   - Test full retrieval pipeline with reranking enabled
   - Verify that reranked results differ from original vector search order
   - Test with real German forum questions
   - Test fallback behavior (reranker disabled or fails)

3. **Performance benchmarks**:
   - Measure end-to-end latency (retrieval + reranking + Claude)
   - Compare before/after reranking implementation
   - Set acceptable latency targets (e.g., reranking should add < 500ms)

4. **Manual validation**:
   - Query chat endpoint with diverse German forum questions
   - Verify answer relevance improves
   - Verify source citations are more focused

**Files to create**:
- `tests/unit/reranker.test.ts`
- `tests/integration/rag.test.ts`

### Phase 5: Documentation and Configuration

**Goal**: Update documentation and provide clear guidance on configuration and monitoring.

1. **Update ARCHITECTURE.md**:
   - Add section on reranking architecture
   - Diagram showing vector search → reranking → LLM flow
   - Explain cross-encoder model choice and tradeoffs

2. **Update CLAUDE.md**:
   - Document new reranker environment variables
   - Provide examples of typical configurations

3. **Update README.md** (if applicable):
   - Mention reranking as a key feature
   - Link to relevant documentation

4. **Create reranker troubleshooting guide**:
   - Common issues (API authentication errors, rate limiting, network timeouts)
   - How to disable reranking if needed (`RERANKER_ENABLED=false`)
   - How to tune parameters (score thresholds, top-k bounds, timeout settings)
   - How to monitor Jina API usage and costs
   - Fallback behavior and service degradation patterns

**Files to modify**:
- `ARCHITECTURE.md`
- `CLAUDE.md`
- `README.md`

## Concrete Steps

### Step 1: Set Up Jina AI API Key

1. Sign up for Jina AI account at [jina.ai](https://jina.ai/)
2. Generate an API key from the dashboard
3. Add the API key to your environment variables or Azure Key Vault

For local development, add to `local.settings.json`:
```json
{
  "Values": {
    "JINA_API_KEY": "your-jina-api-key-here"
  }
}
```

For Azure deployment, add the key to Azure Function App Configuration or Key Vault.

### Step 2: Create Reranker Module

Create `src/lib/rag/reranker.ts` with the following structure (detailed implementation follows):

```typescript
import * as logger from '../utils/logger';

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

export interface ScoredChunk {
  chunk: any;
  originalScore: number;
  rerankerScore: number;
}

export interface RerankResult {
  chunks: ScoredChunk[];
  metrics: {
    originalCount: number;
    filteredCount: number;
    finalCount: number;
    rerankingLatency: number;
    scoreMean: number;
    scoreStdDev: number;
  };
}

// Jina API types
interface JinaRerankRequest {
  model: string;
  query: string;
  documents: string[];
  top_n?: number;
}

interface JinaRerankResponse {
  model: string;
  usage: {
    total_tokens: number;
    prompt_tokens: number;
  };
  results: Array<{
    index: number;
    relevance_score: number;
    document: {
      text: string;
    };
  }>;
}

export async function rerankChunks(
  query: string,
  chunks: any[],
  config: RerankerConfig
): Promise<RerankResult> {
  // Implementation here
}
```

### Step 3: Implement Jina AI Reranking

In `src/lib/rag/reranker.ts`, implement the core reranking logic with Jina API integration:

```typescript
export async function rerankChunks(
  query: string,
  chunks: any[],
  config: RerankerConfig
): Promise<RerankResult> {
  const startTime = Date.now();

  // Early return if disabled or no chunks
  if (!config.enabled || chunks.length === 0) {
    return {
      chunks: chunks.map(c => ({
        chunk: c,
        originalScore: c.score,
        rerankerScore: c.score,
      })),
      metrics: {
        originalCount: chunks.length,
        filteredCount: 0,
        finalCount: chunks.length,
        rerankingLatency: 0,
        scoreMean: 0,
        scoreStdDev: 0,
      },
    };
  }

  logger.info('Starting Jina AI reranking', {
    queryLength: query.length,
    chunkCount: chunks.length,
    model: config.model,
  });

  try {
    // Call Jina API with retry logic
    const jinaResults = await callJinaRerankerWithRetry(query, chunks, config);

    // Map Jina results back to chunks
    const scoredChunks: ScoredChunk[] = jinaResults.results.map(result => ({
      chunk: chunks[result.index],
      originalScore: chunks[result.index].score,
      rerankerScore: result.relevance_score,
    }));

    // Filter by minimum score
    const filteredChunks = scoredChunks.filter(
      sc => sc.rerankerScore >= config.minScore
    );

    logger.info('Reranking filtering complete', {
      originalCount: chunks.length,
      filteredCount: chunks.length - filteredChunks.length,
    });

    // Adaptive top-k selection
    let finalChunks = filteredChunks;
    if (config.adaptiveTopK.enabled) {
      finalChunks = selectAdaptiveTopK(filteredChunks, config.adaptiveTopK);
    }

    const rerankingLatency = Date.now() - startTime;
    const scores = finalChunks.map(sc => sc.rerankerScore);
    const scoreMean = scores.reduce((a, b) => a + b, 0) / scores.length || 0;
    const scoreStdDev = Math.sqrt(
      scores.map(s => Math.pow(s - scoreMean, 2)).reduce((a, b) => a + b, 0) / scores.length
    ) || 0;

    logger.info('Reranking complete', {
      finalCount: finalChunks.length,
      rerankingLatency,
      scoreMean: scoreMean.toFixed(3),
      scoreStdDev: scoreStdDev.toFixed(3),
      jinaTokensUsed: jinaResults.usage.total_tokens,
    });

    return {
      chunks: finalChunks,
      metrics: {
        originalCount: chunks.length,
        filteredCount: chunks.length - filteredChunks.length,
        finalCount: finalChunks.length,
        rerankingLatency,
        scoreMean,
        scoreStdDev,
      },
    };
  } catch (error) {
    logger.error('Jina reranking failed, falling back to original scores', { error });

    // Fallback: return original chunks with vector search scores
    return {
      chunks: chunks.map(c => ({
        chunk: c,
        originalScore: c.score,
        rerankerScore: c.score,
      })),
      metrics: {
        originalCount: chunks.length,
        filteredCount: 0,
        finalCount: chunks.length,
        rerankingLatency: Date.now() - startTime,
        scoreMean: 0,
        scoreStdDev: 0,
      },
    };
  }
}

async function callJinaRerankerWithRetry(
  query: string,
  chunks: any[],
  config: RerankerConfig,
  retryCount = 0
): Promise<JinaRerankResponse> {
  try {
    return await callJinaReranker(query, chunks, config);
  } catch (error: any) {
    if (retryCount < config.maxRetries && isRetryableError(error)) {
      const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
      logger.warn(`Jina API call failed, retrying in ${delay}ms`, {
        retryCount: retryCount + 1,
        error: error.message,
      });
      await sleep(delay);
      return callJinaRerankerWithRetry(query, chunks, config, retryCount + 1);
    }
    throw error;
  }
}

async function callJinaReranker(
  query: string,
  chunks: any[],
  config: RerankerConfig
): Promise<JinaRerankResponse> {
  // Extract text from chunks
  const documents = chunks.map(chunk =>
    chunk.metadata?.postText || chunk.metadata?.contentPreview || ''
  );

  const requestBody: JinaRerankRequest = {
    model: config.model,
    query: query,
    documents: documents,
    top_n: chunks.length, // Return all, we'll filter later
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    const response = await fetch('https://api.jina.ai/v1/rerank', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jina API error: ${response.status} - ${errorText}`);
    }

    const data: JinaRerankResponse = await response.json();
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Jina API timeout after ${config.timeout}ms`);
    }
    throw error;
  }
}

function isRetryableError(error: any): boolean {
  // Retry on network errors, timeouts, and 5xx errors
  return (
    error.message?.includes('timeout') ||
    error.message?.includes('network') ||
    error.message?.includes('ECONNREFUSED') ||
    error.message?.includes('500') ||
    error.message?.includes('502') ||
    error.message?.includes('503')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function selectAdaptiveTopK(
  chunks: ScoredChunk[],
  config: { min: number; max: number; scoreGapThreshold: number }
): ScoredChunk[] {
  if (chunks.length <= config.min) {
    return chunks;
  }

  // Find the first significant score gap
  for (let i = config.min - 1; i < chunks.length - 1 && i < config.max - 1; i++) {
    const gap = chunks[i].rerankerScore - chunks[i + 1].rerankerScore;
    if (gap > config.scoreGapThreshold) {
      logger.debug('Adaptive top-k: score gap detected', {
        position: i + 1,
        gap: gap.toFixed(3),
      });
      return chunks.slice(0, i + 1);
    }
  }

  // No significant gap found, use max
  return chunks.slice(0, config.max);
}
```

### Step 4: Integrate into Retrieval Pipeline

Modify `src/lib/rag/retrieval.ts` to call the reranker:

```typescript
import { rerankChunks, RerankerConfig } from './reranker';

// Add default reranker config (read from environment variables)
function getRerankerConfig(): RerankerConfig {
  return {
    enabled: process.env.RERANKER_ENABLED !== 'false',
    apiKey: process.env.JINA_API_KEY || '',
    model: process.env.JINA_RERANKER_MODEL || 'jina-reranker-v2-base-multilingual',
    minScore: parseFloat(process.env.RERANKER_MIN_SCORE || '0.3'),
    timeout: parseInt(process.env.RERANKER_TIMEOUT_MS || '5000', 10),
    maxRetries: parseInt(process.env.RERANKER_MAX_RETRIES || '2', 10),
    adaptiveTopK: {
      enabled: true,
      min: parseInt(process.env.RERANKER_ADAPTIVE_TOPK_MIN || '3', 10),
      max: parseInt(process.env.RERANKER_ADAPTIVE_TOPK_MAX || '15', 10),
      scoreGapThreshold: parseFloat(process.env.RERANKER_SCORE_GAP_THRESHOLD || '0.1'),
    },
  };
}

export async function retrieveContext(
  query: string,
  topK: number = DEFAULT_TOP_K,
  filter?: Record<string, any>
): Promise<RetrievalResult> {
  try {
    // ... existing code to generate embedding and query Pinecone ...

    if (!searchResults.matches || searchResults.matches.length === 0) {
      // ... existing code ...
    }

    // NEW: Rerank results
    const rerankerConfig = getRerankerConfig();
    const rerankResult = await rerankChunks(query, searchResults.matches, rerankerConfig);

    logger.info('Retrieval completed with reranking', {
      originalChunks: searchResults.matches.length,
      finalChunks: rerankResult.chunks.length,
      rerankingLatency: rerankResult.metrics.rerankingLatency,
      topScore: rerankResult.chunks[0]?.rerankerScore,
    });

    // Return reranked chunks (extract the chunk objects)
    return {
      success: true,
      chunks: rerankResult.chunks.map(sc => ({
        ...sc.chunk,
        rerankerScore: sc.rerankerScore, // Add reranker score to metadata
      })),
    };
  } catch (error) {
    // ... existing error handling ...
  }
}
```

### Step 5: Add Configuration Types

Create or update `src/types/config.ts` to include reranker configuration types:

```typescript
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
```

### Step 6: Update Environment Variables

Add to `.env.example`:

```
# Jina AI Reranker Configuration
RERANKER_ENABLED=true
JINA_API_KEY=your_jina_api_key_here
JINA_RERANKER_MODEL=jina-reranker-v2-base-multilingual
RERANKER_MIN_SCORE=0.3
RERANKER_ADAPTIVE_TOPK_MIN=3
RERANKER_ADAPTIVE_TOPK_MAX=15
RERANKER_SCORE_GAP_THRESHOLD=0.1
RERANKER_TIMEOUT_MS=5000
RERANKER_MAX_RETRIES=2
```

### Step 7: Run Tests

From repository root, run unit tests:

```bash
npm test -- tests/unit/reranker.test.ts
```

Expected output: All tests pass (after writing tests in Step 8).

### Step 8: Write Tests

Create `tests/unit/reranker.test.ts` with test cases for:
- Mock Jina AI API responses using Jest's `fetch` mock
- Test successful reranking (chunks are reordered by Jina scores)
- Test relevance filtering (low-score chunks removed)
- Test adaptive top-k (score gap detection)
- Test error handling (API failures, timeouts)
- Test fallback behavior (returns original scores when Jina API fails)
- Test retry logic with exponential backoff
- Edge cases (empty input, all low scores, disabled reranker)

### Step 9: Integration Test

Create `tests/integration/rag.test.ts` with test cases for:
- Full retrieval + reranking flow
- Compare with and without reranking enabled
- Verify reranked results differ from original vector search order

### Step 10: Deploy and Monitor

Deploy to Azure Functions and monitor Application Insights for:
- Reranking latency metrics
- Chunk filtering statistics
- Any errors or performance issues

## Validation and Acceptance

After implementation is complete, validate as follows:

1. **Unit tests pass**:
   ```bash
   npm test
   ```
   All tests in `tests/unit/reranker.test.ts` should pass.

2. **Integration tests pass**:
   ```bash
   npm test -- tests/integration/rag.test.ts
   ```
   All integration tests should pass.

3. **Manual testing**:
   Start the local function app:
   ```bash
   npm start
   ```

   Query the chat endpoint with a German forum question:
   ```bash
   curl -X POST http://localhost:7071/api/chat \
     -H "Content-Type: application/json" \
     -d '{
       "message": "Wie dimensioniere ich eine Wärmepumpe für ein Passivhaus?"
     }'
   ```

   Expected output:
   - Response streams back from Claude
   - Fewer source citations compared to before (e.g., 5-8 instead of 30)
   - Sources are highly relevant to the question
   - Reranking latency logged in console (should be < 500ms)

4. **Performance benchmarks**:
   - Measure end-to-end latency for 10 sample queries
   - Compare with and without reranking enabled
   - Verify reranking adds acceptable latency (< 500ms)

5. **Production deployment**:
   - Deploy to Azure Functions dev environment
   - Monitor Application Insights for reranker metrics
   - Verify no errors or performance degradation
   - Compare user satisfaction or answer quality (if metrics available)

## Idempotence and Recovery

- **Rerunning tests**: Tests can be run multiple times safely with `npm test`.
- **Redeployment**: The implementation is additive and can be deployed multiple times without issue.
- **Rollback**: If reranking causes issues, set `RERANKER_ENABLED=false` to disable without code changes.
- **Model changes**: The Jina reranker model can be changed via `JINA_RERANKER_MODEL` environment variable without code changes.
- **API key rotation**: Update `JINA_API_KEY` in Azure Function App Configuration or Key Vault for production deployments.
- **Fallback behavior**: If Jina API fails, the system gracefully falls back to using original vector search scores, maintaining service availability.

## Artifacts and Notes

### Example Reranking Output (Log)

```
INFO: Starting Jina AI reranking
  queryLength: 65
  chunkCount: 30
  model: jina-reranker-v2-base-multilingual

INFO: Reranking filtering complete
  originalCount: 30
  filteredCount: 8

DEBUG: Adaptive top-k: score gap detected
  position: 7
  gap: 0.15

INFO: Reranking complete
  finalCount: 7
  rerankingLatency: 220
  scoreMean: 0.742
  scoreStdDev: 0.123
  jinaTokensUsed: 1250
```

### Expected Performance Characteristics

- **Reranking latency**: 150-300ms for 30 chunks (Jina API typically faster than local models)
- **Token reduction**: Expect 30-50% fewer input tokens to Claude (30 chunks → 7-15 chunks)
- **Cost savings**:
  - Jina reranking: ~$0.005 per query (30 chunks × $0.00016/doc)
  - Claude token reduction: ~$0.02 per query saved (40% fewer input tokens)
  - **Net savings**: ~$0.015 per query even after Jina costs
- **Answer quality**: Significant improvement - more focused and relevant answers with better German language understanding

## Interfaces and Dependencies

### New Dependencies

**No new npm packages required** - Uses Node.js built-in `fetch` API for HTTP requests to Jina.

### External Service

- **Jina AI Reranker API**: https://api.jina.ai/v1/rerank
- **Authentication**: Bearer token via `JINA_API_KEY` environment variable
- **Pricing**: ~$0.00016 per document reranked (extremely cost-effective)
- **Rate Limits**: Contact Jina for details, but generally generous for typical usage

### Key Interfaces

In `src/lib/rag/reranker.ts`:

```typescript
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

export interface ScoredChunk {
  chunk: any; // Original Pinecone match object
  originalScore: number; // Cosine similarity from vector search
  rerankerScore: number; // Jina reranker relevance score (0-1)
}

export interface RerankResult {
  chunks: ScoredChunk[];
  metrics: {
    originalCount: number;
    filteredCount: number;
    finalCount: number;
    rerankingLatency: number;
    scoreMean: number;
    scoreStdDev: number;
  };
}

interface JinaRerankRequest {
  model: string;
  query: string;
  documents: string[];
  top_n?: number;
}

interface JinaRerankResponse {
  model: string;
  usage: {
    total_tokens: number;
    prompt_tokens: number;
  };
  results: Array<{
    index: number;
    relevance_score: number;
    document: {
      text: string;
    };
  }>;
}

export async function rerankChunks(
  query: string,
  chunks: any[],
  config: RerankerConfig
): Promise<RerankResult>;
```

In `src/lib/rag/retrieval.ts`:

```typescript
// Update RetrievalResult to include reranker scores
interface RetrievalResult {
  success: boolean;
  chunks?: Array<any & { rerankerScore?: number }>;
  error?: string;
}
```

### Model Selection

**Primary model**: `jina-reranker-v2-base-multilingual` (via Jina AI API)
- State-of-the-art multilingual reranking, excellent German support
- Handles up to 1024 tokens per document
- Optimized for semantic relevance scoring
- Proven performance on MTEB benchmarks including German datasets
- No model file to manage, always up-to-date

**Alternative models** (can be configured via environment variable):
- `jina-reranker-v1-base-en`: English-only, faster but less accurate for German
- `jina-colbert-v2`: Different architecture, may perform better for some query types
- Any model available through Jina AI's API

---

## Revision History

- **2025-12-03 (Initial)**: Initial version - outlined reranker implementation with @xenova/transformers (local model), adaptive top-k, and relevance filtering.

- **2025-12-03 (Revised)**: **Switched to Jina AI reranker API instead of local transformers** based on cost-benefit analysis. Key changes:
  - Replaced `@xenova/transformers` with Jina AI API integration
  - Added error handling and graceful fallback for API failures
  - Added retry logic with exponential backoff
  - Updated environment variables (added `JINA_API_KEY`, `RERANKER_TIMEOUT_MS`, `RERANKER_MAX_RETRIES`)
  - Updated cost analysis showing net savings despite Jina API costs
  - Performance improvements: 150-300ms latency vs 300-600ms with local models
  - No cold start penalty (2-5s saved on Azure Functions)
  - Better German language support with state-of-the-art models
