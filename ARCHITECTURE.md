# ESHF Embeddings - Architecture Documentation

## Overview

This project implements a **TypeScript/Node.js** Azure Functions solution to process German energy-saving house forum posts from Azure Cosmos DB, generate vector embeddings using OpenAI's API, and store them in Pinecone for semantic search capabilities.

### Key Features
- **Queue-Based Architecture**: Scalable, decoupled processing pipeline using Azure Storage Queues
- **Smart Chunking**: Intelligent content splitting with overlap for better retrieval
- **German Language Support**: Handles umlauts, quoted replies, and forum-specific formatting
- **Rate Limit Handling**: Exponential backoff and retry logic for OpenAI API
- **Comprehensive Metadata**: Category, author, timestamp, and thread context preservation
- **Production-Ready**: Full error handling, monitoring, and dead-letter queue support

## System Architecture

```
┌─────────────────────┐
│   Azure Cosmos DB   │
│   (Forum Posts)     │
└──────────┬──────────┘
           │
           │ 1. Query posts without embeddings
           ▼
┌─────────────────────┐
│  Azure Function     │
│  (Timer/HTTP)       │
│                     │
│  - Fetch posts      │
│  - Batch processing │
│  - Error handling   │
└──────────┬──────────┘
           │
           │ 2. Send content for embedding
           ▼
┌─────────────────────┐
│   OpenAI API        │
│   (Embeddings)      │
│                     │
│  - text-embedding-  │
│    ada-002 or       │
│    text-embedding-  │
│    3-small/large    │
└──────────┬──────────┘
           │
           │ 3. Vector embeddings
           ▼
┌─────────────────────┐
│  Azure Function     │
│  (Processing)       │
│                     │
│  - Chunk content    │
│  - Transform data   │
│  - Prepare metadata │
└──────────┬──────────┘
           │
           │ 4. Upsert vectors + metadata
           ▼
┌─────────────────────┐
│   Pinecone DB       │
│   (Vector Store)    │
│                     │
│  - Vectors          │
│  - Metadata         │
└─────────────────────┘
           │
           │ 5. Update processed status
           ▼
┌─────────────────────┐
│   Azure Cosmos DB   │
│   (Update flags)    │
└─────────────────────┘
```

## Components

### 1. Azure Cosmos DB (Source)

**Purpose**: Stores forum posts with metadata

**Data Structure**:
```json
{
  "id": "66898-14",
  "type": "reply|post",
  "url": "https://...",
  "threadId": "66898",
  "threadSlug": "grundriss-zur-freien-diskussion",
  "category": "Bauplan & Grundriss",
  "threadTitle": "Grundriss zur freien Diskussion",
  "author": "isitreal",
  "timestamp": "2022-03-15T18:31:04Z",
  "content": "...",
  "postNumber": 14,
  "isOriginalPost": false,
  "embeddingProcessed": false,  // Track if embedding exists
  "embeddingId": null,          // Pinecone vector ID
  "lastEmbeddingUpdate": null   // Timestamp of last embedding
}
```

**Query Pattern**:
```sql
SELECT * FROM c WHERE c.embeddingProcessed = false OR NOT IS_DEFINED(c.embeddingProcessed)
```

### 2. Azure Functions Architecture

## Queue-Based Architecture

**Overview**: Decoupled architecture using Azure Storage Queues for better scalability and resilience.

```
┌──────────────────────┐
│  Timer Trigger       │
│  (Every 5 min)       │
└─────────┬────────────┘
          │
          ▼
┌──────────────────────┐       ┌──────────────────────┐
│  PostDiscovery       │──────>│  Storage Queue       │
│  Function            │       │  "posts-to-process"  │
│                      │       └─────────┬────────────┘
│  1. Query Cosmos DB  │                 │
│  2. Chunk posts      │                 │
│  3. Enqueue batches  │                 │
└──────────────────────┘                 │
          ▲                              │
          │                              ▼
┌─────────┴────────────┐       ┌──────────────────────┐
│  HTTP Trigger        │       │  EmbeddingProcessor  │
│  (Manual)            │       │  Function            │
└──────────────────────┘       │  (Queue trigger)     │
                               │                      │
                               │  1. Dequeue post     │
                               │  2. Call OpenAI      │
                               │  3. Enqueue result   │
                               └─────────┬────────────┘
                                         │
                                         ▼
                               ┌──────────────────────┐
                               │  Storage Queue       │
                               │  "embeddings-ready"  │
                               └─────────┬────────────┘
                                         │
                                         ▼
                               ┌──────────────────────┐
                               │  PineconeUploader    │
                               │  Function            │
                               │  (Queue trigger)     │
                               │                      │
                               │  1. Dequeue vectors  │
                               │  2. Batch upsert     │
                               │  3. Update Cosmos    │
                               └──────────────────────┘
```

**Function Count**: 3 main functions + 1 HTTP endpoint + 2 Storage Queues

**Key Benefits**:
- Highly scalable (each function scales independently)
- Better rate limit handling through queue-based throttling
- Partial retry on failures (individual posts can fail without blocking others)
- Queue visibility timeout handles crashes gracefully
- Can process 100k+ posts/day
- Built-in dead letter queue for failed messages
- Independent monitoring and scaling per function

## Detailed Function Specifications

### Function 1: `PostDiscovery`

**File**: `src/functions/postDiscovery.ts`

**Trigger**:
- Timer: `0 */5 * * * *` (every 5 minutes)
- Bindings: Cosmos DB input, Queue output

**Responsibilities**:
1. Query Cosmos DB for unprocessed posts
2. Apply chunking logic to posts
3. Enqueue post batches to processing queue

**Code Structure**:
```typescript
export async function postDiscovery(
  context: Context,
  timerTrigger: Timer
): Promise<void> {
  const posts = await queryUnprocessedPosts();
  const batches = createBatches(posts, BATCH_SIZE);

  for (const batch of batches) {
    const chunkedPosts = await chunkPosts(batch);
    await enqueueToProcessingQueue(chunkedPosts);
  }
}
```

**Environment Variables**:
- `COSMOS_ENDPOINT`
- `COSMOS_KEY`
- `BATCH_SIZE`
- `ENABLE_CHUNKING`

**Error Handling**:
- Log failed queries
- Continue processing remaining batches
- Send alert if error rate > 10%

---

### Function 2: `EmbeddingProcessor`

**File**: `src/functions/embeddingProcessor.ts`

**Trigger**:
- Queue: `posts-to-process`
- Batch size: 1 (process one post/chunk at a time)
- Max dequeue count: 3

**Responsibilities**:
1. Receive post/chunk from queue
2. Call OpenAI API to generate embedding
3. Handle rate limiting with exponential backoff
4. Enqueue result to embeddings-ready queue

**Code Structure**:
```typescript
export async function embeddingProcessor(
  context: Context,
  queueItem: PostQueueMessage
): Promise<void> {
  const { postId, content, metadata, chunkIndex } = queueItem;

  try {
    const embedding = await generateEmbedding(content);

    const result: EmbeddingResult = {
      postId,
      chunkIndex,
      embedding,
      metadata,
      timestamp: new Date().toISOString()
    };

    await context.bindings.embeddingsReady.push(result);

  } catch (error) {
    if (isRateLimitError(error)) {
      // Return to queue with delay
      throw error; // Will retry with exponential backoff
    }

    await logError(postId, error);
    await sendToDeadLetterQueue(queueItem);
  }
}
```

**Environment Variables**:
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `MAX_RETRIES`

**Rate Limiting Strategy**:
```typescript
async function generateEmbedding(content: string, retryCount = 0) {
  try {
    return await openai.embeddings.create({
      model: process.env.OPENAI_MODEL,
      input: content
    });
  } catch (error) {
    if (error.status === 429 && retryCount < 3) {
      const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
      await sleep(delay);
      return generateEmbedding(content, retryCount + 1);
    }
    throw error;
  }
}
```

---

### Function 3: `PineconeUploader`

**File**: `src/functions/pineconeUploader.ts`

**Trigger**:
- Queue: `embeddings-ready`
- Batch size: 100 (upsert in batches)
- Max dequeue count: 3

**Responsibilities**:
1. Receive embeddings from queue
2. Batch upsert to Pinecone (100 vectors at a time)
3. Update Cosmos DB with processing status
4. Handle failures and retries

**Code Structure**:
```typescript
export async function pineconeUploader(
  context: Context,
  queueItems: EmbeddingResult[]
): Promise<void> {
  const vectors = queueItems.map(item => ({
    id: item.chunkIndex !== null
      ? `${item.postId}-chunk-${item.chunkIndex}`
      : item.postId,
    values: item.embedding,
    metadata: {
      ...item.metadata,
      chunkIndex: item.chunkIndex,
      isChunked: item.chunkIndex !== null
    }
  }));

  try {
    // Upsert to Pinecone
    await pineconeIndex.upsert(vectors);

    // Update Cosmos DB
    await updateProcessedStatus(queueItems);

    context.log(`Successfully processed ${vectors.length} vectors`);

  } catch (error) {
    context.log.error(`Pinecone upsert failed:`, error);

    // Retry failed items individually
    await retryFailedUpserts(vectors, queueItems);
  }
}
```

**Environment Variables**:
- `PINECONE_API_KEY`
- `PINECONE_INDEX`
- `COSMOS_ENDPOINT`
- `COSMOS_KEY`

---

### Function 4: `ManualProcessor` (HTTP Trigger)

**File**: `src/functions/manualProcessor.ts`

**Trigger**: HTTP POST

**Endpoints**:
- `POST /api/process` - Process all unprocessed posts
- `POST /api/process/{postId}` - Process specific post
- `POST /api/reprocess/{postId}` - Reprocess existing post
- `GET /api/status` - Get processing statistics

**Code Structure**:
```typescript
export async function manualProcessor(
  context: Context,
  req: HttpRequest
): Promise<void> {
  const { postId } = req.params;
  const { force } = req.query; // force=true to reprocess

  if (postId) {
    // Process specific post
    const post = await getPost(postId);
    await processPost(post, force === 'true');

    context.res = {
      status: 200,
      body: { message: `Post ${postId} queued for processing` }
    };
  } else {
    // Process all unprocessed
    const stats = await triggerBatchProcessing();

    context.res = {
      status: 200,
      body: stats
    };
  }
}
```

**Use Cases**:
- Initial bulk import
- Reprocess posts after model change
- Fix failed posts
- Testing and debugging

## Function Communication Patterns

**Queue Message Schemas**:

```typescript
// posts-to-process queue
interface PostQueueMessage {
  postId: string;
  content: string;
  metadata: PostMetadata;
  chunkIndex: number | null;
  totalChunks: number;
}

// embeddings-ready queue
interface EmbeddingResult {
  postId: string;
  chunkIndex: number | null;
  embedding: number[];
  metadata: PostMetadata;
  timestamp: string;
}
```

**Enqueue Pattern**:
```typescript
await context.bindings.postsToProcess.push({
  postId: post.id,
  content: chunk.content,
  metadata: extractMetadata(post),
  chunkIndex: chunk.index,
  totalChunks: chunk.total
});
```

**Dequeue Pattern**: Automatic via queue trigger

---

## Deployment Configuration

### Programming Model v4 - No function.json Files Needed

With Azure Functions v4 programming model, all configuration is done in TypeScript code:

**PostDiscovery** (`src/functions/postDiscovery.ts`):
```typescript
app.timer('postDiscovery', {
  schedule: '0 */5 * * * *',
  extraOutputs: [postsToProcessQueue],
  handler: async (timer: Timer, context: InvocationContext) => {
    // Implementation
  }
});
```

**EmbeddingProcessor** (`src/functions/embeddingProcessor.ts`):
```typescript
app.storageQueue('embeddingProcessor', {
  queueName: 'posts-to-process',
  connection: 'AzureWebJobsStorage',
  extraOutputs: [embeddingsReadyQueue],
  handler: async (queueItem: PostQueueMessage, context: InvocationContext) => {
    // Implementation
  }
});
```

**PineconeUploader** (`src/functions/pineconeUploader.ts`):
```typescript
app.storageQueue('pineconeUploader', {
  queueName: 'embeddings-ready',
  connection: 'AzureWebJobsStorage',
  cardinality: 'many',  // Enable batch processing
  handler: async (queueItems: EmbeddingResult[], context: InvocationContext) => {
    // Implementation
  }
});
```

**ManualProcessor** (`src/functions/manualProcessor.ts`):
```typescript
app.http('manualProcess', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'process/{postId?}',
  handler: async (req: HttpRequest, context: InvocationContext) => {
    // Implementation
  }
});
```

---

## Scaling Configuration

### host.json
```json
{
  "version": "2.0",
  "extensions": {
    "queues": {
      "maxPollingInterval": "00:00:02",
      "visibilityTimeout": "00:05:00",
      "batchSize": 16,
      "maxDequeueCount": 3,
      "newBatchThreshold": 8
    }
  },
  "functionTimeout": "00:10:00",
  "logging": {
    "applicationInsights": {
      "samplingSettings": {
        "isEnabled": true,
        "maxTelemetryItemsPerSecond": 20
      }
    }
  }
}
```

**Key Settings**:
- `visibilityTimeout`: 5 minutes (time for function to process before retry)
- `batchSize`: 16 for EmbeddingProcessor, 100 for PineconeUploader
- `maxDequeueCount`: 3 attempts before moving to poison queue
- `functionTimeout`: 10 minutes maximum execution

### 3. OpenAI API

**Service**: Embeddings API
**Model Options**:
- `text-embedding-ada-002` (1536 dimensions)
- `text-embedding-3-small` (512-1536 dimensions)
- `text-embedding-3-large` (256-3072 dimensions)

**Input**: Forum post content (may include title + content)
**Output**: Vector embedding array

**Rate Limits** (to consider):
- Requests per minute (RPM)
- Tokens per minute (TPM)
- Implement batching and throttling

### 4. Pinecone Vector Database

**Index Configuration**:
- **Dimensions**: Match OpenAI model (e.g., 1536 for ada-002)
- **Metric**: Cosine similarity
- **Pod Type**: Based on scale requirements

**Vector Structure**:
```python
{
  "id": "66898-14",  // Match Cosmos DB id
  "values": [0.123, -0.456, ...],  // 1536-dimensional vector
  "metadata": {
    "type": "reply",
    "url": "https://...",
    "threadId": "66898",
    "threadSlug": "grundriss-zur-freien-diskussion",
    "category": "Bauplan & Grundriss",
    "threadTitle": "Grundriss zur freien Diskussion",
    "author": "isitreal",
    "timestamp": "2022-03-15T18:31:04Z",
    "postNumber": 14,
    "isOriginalPost": false,
    "contentPreview": "First 200 chars..."  // For display
  }
}
```

**Metadata Filtering**: Enable queries like:
- Filter by category
- Filter by author
- Filter by date range
- Filter by thread

## Data Flow

### Initial Bulk Import
1. Query all posts without `embeddingProcessed` flag
2. Process in batches (e.g., 100 posts at a time)
3. For each batch:
   - Generate embeddings via OpenAI
   - Upsert to Pinecone with metadata
   - Update Cosmos DB `embeddingProcessed = true`
4. Handle errors and log failed posts

### Incremental Updates
1. Timer trigger runs periodically
2. Query posts where `embeddingProcessed = false`
3. Process new posts using same batch logic
4. Update tracking fields

### Error Handling Flow
```
┌─────────────┐
│ Post Failed │
│ to Process  │
└──────┬──────┘
       │
       ▼
┌─────────────┐     Retry < 3?     ┌──────────────┐
│ Log Error   ├───────Yes──────────>│ Retry Queue  │
└──────┬──────┘                     └──────┬───────┘
       │                                   │
       No                                  │
       │                                   │
       ▼                                   ▼
┌─────────────┐                     ┌──────────────┐
│ Dead Letter │                     │ Retry Later  │
│ Queue/Table │                     └──────────────┘
└─────────────┘
```

## Chunking Strategy

### Overview
Forum posts vary significantly in length. To optimize embedding quality, retrieval accuracy, and cost efficiency, posts are chunked based on their content length and structure.

### Chunking Decision Logic

```
┌─────────────────┐
│  Forum Post     │
└────────┬────────┘
         │
         ▼
    Token Count?
         │
    ┌────┴────┐
    │         │
  < 500    > 500
    │         │
    │         ▼
    │    ┌─────────────┐
    │    │ Apply       │
    │    │ Chunking    │
    │    └─────┬───────┘
    │          │
    │          ▼
    │    ┌─────────────┐
    │    │ Create      │
    │    │ Overlapping │
    │    │ Chunks      │
    │    └─────┬───────┘
    │          │
    └────┬─────┘
         │
         ▼
   ┌─────────────┐
   │ Generate    │
   │ Embeddings  │
   └─────────────┘
```

### Chunking Parameters

**Token Thresholds**:
- **No chunking**: < 500 tokens (~2000 characters)
- **Chunk required**: ≥ 500 tokens
- **Max chunk size**: 400 tokens (~1600 characters)
- **Chunk overlap**: 50 tokens (~200 characters)

**Rationale**:
- Most forum posts in the examples are short (200-500 chars)
- Overlap ensures context preservation at chunk boundaries
- 400 tokens balances specificity with context
- Stays well below OpenAI's 8191 token limit

### Content Preprocessing

Before chunking, clean and prepare the content:

#### 1. Quote Detection and Extraction
Forum posts often contain quoted replies:
```
..\nusername schrieb:\n\nQuoted text here...\n\nUser's actual response
```

**Strategy**:
- **Detect pattern**: `..\n{author} schrieb:\n`
- **Extract components**:
  - `quotedAuthor`: Author being quoted
  - `quotedText`: Content of quote
  - `responseText`: User's actual response
- **Include in metadata**: Store quote context separately

**Example from data**:
```json
{
  "content": "..\nDeep schrieb:\n\nWenn du schon ein RDS hast...\n\nWeil nicht alle Rohre in einem KG stecken...",
  "parsed": {
    "quotedAuthor": "Deep",
    "quotedText": "Wenn du schon ein RDS hast...",
    "responseText": "Weil nicht alle Rohre in einem KG stecken..."
  }
}
```

#### 2. URL Handling
- **Preserve URLs**: Keep URLs intact (don't split mid-URL)
- **Metadata extraction**: Extract domains for filtering
- **Short URLs**: Don't contribute heavily to chunk decisions

#### 3. Special Characters
- Preserve German umlauts (ä, ö, ü, ß)
- Normalize whitespace
- Keep paragraph structure

### Chunking Algorithm

```python
def chunk_post(post_content: str, max_tokens: int = 400, overlap: int = 50):
    """
    Chunks forum post content with overlap for context preservation.
    """
    # 1. Tokenize content
    tokens = tokenizer.encode(post_content)

    # 2. Check if chunking needed
    if len(tokens) <= 500:
        return [post_content]  # Single chunk

    # 3. Create chunks with overlap
    chunks = []
    start = 0

    while start < len(tokens):
        # Get chunk with max_tokens
        end = min(start + max_tokens, len(tokens))
        chunk_tokens = tokens[start:end]

        # Decode back to text
        chunk_text = tokenizer.decode(chunk_tokens)
        chunks.append(chunk_text)

        # Move start position (with overlap)
        if end >= len(tokens):
            break
        start = end - overlap

    return chunks
```

### Chunk Storage in Pinecone

Each chunk gets a unique vector with preserved metadata:

```python
{
  "id": "83944-19-chunk-0",  # Format: {postId}-chunk-{index}
  "values": [0.123, -0.456, ...],
  "metadata": {
    # Original post metadata
    "postId": "83944-19",
    "type": "reply",
    "url": "https://www.energiesparhaus.at/forum-grundriss-wohnen-essen-kueche/83944",
    "threadId": "83944",
    "threadSlug": "grundriss-wohnen-essen-kueche",
    "category": "Bauplan & Grundriss",
    "threadTitle": "Grundriss Wohnen/Essen/Küche",
    "author": "FranzGrande",
    "timestamp": "2025-10-23T17:24:59Z",
    "postNumber": 19,
    "isOriginalPost": false,

    # Chunk-specific metadata
    "chunkIndex": 0,
    "totalChunks": 3,
    "chunkText": "Actual chunk content...",
    "isChunked": true,

    # Quote metadata (if applicable)
    "hasQuote": true,
    "quotedAuthor": "OtherUser",

    # Content features
    "contentLength": 1200,
    "hasUrls": false
  }
}
```

### Cosmos DB Updates

Track chunking in the source document:

```json
{
  "id": "83944-19",
  "content": "...",
  "embeddingProcessed": true,
  "embeddingId": "83944-19",  // Base ID
  "chunkingApplied": true,
  "chunkCount": 3,
  "chunkIds": [
    "83944-19-chunk-0",
    "83944-19-chunk-1",
    "83944-19-chunk-2"
  ],
  "lastEmbeddingUpdate": "2025-10-23T18:00:00Z"
}
```

### Query Strategy

When searching, handle chunked results:

#### 1. Initial Query
```python
# Query Pinecone with user's question embedding
results = index.query(
    vector=question_embedding,
    top_k=20,  # Get more results to account for chunks
    include_metadata=True,
    filter={"category": "Bauplan & Grundriss"}  # Optional filters
)
```

#### 2. Post-Processing Results
```python
def deduplicate_chunks(results):
    """
    Group chunks by postId and keep highest scoring chunk per post.
    """
    post_scores = {}

    for match in results.matches:
        post_id = match.metadata['postId']
        score = match.score

        if post_id not in post_scores or score > post_scores[post_id]['score']:
            post_scores[post_id] = {
                'score': score,
                'match': match,
                'chunks': []
            }

        # Collect all chunks for context
        if match.metadata.get('isChunked'):
            post_scores[post_id]['chunks'].append({
                'index': match.metadata['chunkIndex'],
                'text': match.metadata['chunkText'],
                'score': score
            })

    return post_scores
```

#### 3. Result Assembly
- **Best chunk first**: Show the highest-scoring chunk
- **Context available**: Allow retrieving all chunks of a post
- **Link to original**: Always include URL to full forum post

### Edge Cases

#### Very Long Posts (> 2000 tokens)
- Split into multiple chunks (e.g., 5-10 chunks)
- Ensure overlap maintains context
- Consider summarization for extremely long posts

#### Very Short Posts (< 50 tokens)
```json
// Example: "83454-13" has only ~80 tokens
{
  "content": "Weltklasse thx, dann ist die zweite Soleleitung auch dicht 😄"
}
```
- **Don't chunk**: Embed as-is
- **Add context**: Consider including thread title in embedding text
- **Enhanced metadata**: Rely on filtering by thread/author

#### Posts with Mostly URLs
```json
// Example: "83454-6" contains quoted text with URL
{
  "content": "..\nDeep schrieb:\n\nWenn du schon ein RDS hast warum nicht sowas? \nhttps://partner.pipelife.at/..."
}
```
- **Extract URLs**: Store separately in metadata
- **Embed description**: Focus on surrounding text
- **URL metadata**: Domain, link text for filtering

### Cost Optimization

**Chunking Impact on Costs**:
```
# Without chunking
1 post × 1500 tokens × $0.00002/token = $0.00003

# With chunking (3 chunks)
3 chunks × 400 tokens × $0.00002/token = $0.000024

Savings: ~20% for long posts
```

**Storage Impact**:
- More vectors in Pinecone (3× for chunked posts)
- Trade-off: Better retrieval vs. higher storage costs
- Estimate: 10-15% of posts need chunking

### Implementation Phases

**Phase 1**: No chunking (MVP)
- Process all posts as single embeddings
- Establish baseline performance
- Identify problematic long posts

**Phase 2**: Basic chunking
- Implement fixed-size chunking with overlap
- Track chunk metadata
- Update query logic

**Phase 3**: Smart chunking
- Respect paragraph boundaries
- Quote-aware chunking
- Semantic boundary detection

## Technology Stack

### Implementation Language
**TypeScript/Node.js** - Azure Functions v4 Programming Model

**Programming Model v4 Benefits**:
- **No function.json files needed** - Define triggers and bindings in TypeScript code
- **Type-safe bindings** - Full IntelliSense and compile-time checking
- **Simplified structure** - Single file per function instead of folder with multiple files
- **Better DX** - More intuitive, decorator-based approach
- **Native TypeScript support** - First-class TypeScript experience

**Why TypeScript**:
- Rapid development with hot-reload
- Native JSON handling for Cosmos DB and API integration
- Rich ecosystem for OpenAI and vector databases
- Type safety during development
- Simpler deployment pipeline
- Strong community support for AI/ML tooling

**Important**: This architecture uses the **v4 programming model**, which is fundamentally different from v3:
- v3: Each function in a folder with `index.ts` + `function.json`
- v4: Each function in a single `.ts` file with decorators/inline config

### Azure Services
- **Azure Functions**: Serverless compute (Consumption or Premium plan)
- **Azure Cosmos DB**: NoSQL database for forum posts
- **Azure Storage Queues**: Message queuing between functions
- **Azure Key Vault**: Secure storage for API keys and secrets
- **Azure Application Insights**: Monitoring, logging, and telemetry

### External Services
- **OpenAI API**: Text embedding generation
- **Pinecone**: Serverless vector database

### Core Dependencies

```json
{
  "dependencies": {
    "@azure/functions": "^4.5.0",
    "@azure/cosmos": "^4.1.0",
    "@azure/identity": "^4.0.0",
    "@azure/storage-queue": "^12.17.0",
    "@azure/keyvault-secrets": "^4.7.0",
    "openai": "^4.20.0",
    "@pinecone-database/pinecone": "^2.0.1",
    "tiktoken": "^1.0.10"
  },
  "devDependencies": {
    "@azure/functions-core-tools": "^4.0.5455",
    "@types/node": "^20.10.0",
    "typescript": "^5.3.0",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.0",
    "ts-jest": "^29.1.0",
    "eslint": "^8.50.0",
    "prettier": "^3.0.0"
  }
}
```

**Key Changes for v4**:
- `@azure/storage-queue` added for native queue client usage
- `tiktoken` instead of `js-tiktoken` (official OpenAI tokenizer)
- `@azure/functions-core-tools` in devDependencies for local development

### Development Tools
- **Azure Functions Core Tools** v4.x - Local development and testing
- **Azurite** - Local Azure Storage emulator
- **TypeScript** 5.x - Type checking and compilation
- **Jest** - Unit and integration testing
- **ESLint** + **Prettier** - Code quality and formatting

## Project Structure

```
eshf-embeddings/
├── src/
│   ├── functions/
│   │   ├── postDiscovery.ts          # Timer trigger - v4 model (no function.json)
│   │   ├── embeddingProcessor.ts     # Queue trigger - v4 model (no function.json)
│   │   ├── pineconeUploader.ts       # Queue trigger - v4 model (no function.json)
│   │   └── manualProcessor.ts        # HTTP trigger - v4 model (no function.json)
│   │
│   ├── lib/
│   │   ├── cosmos/
│   │   │   ├── client.ts              # Cosmos DB connection
│   │   │   ├── queries.ts             # Query functions
│   │   │   └── models.ts              # Type definitions
│   │   ├── openai/
│   │   │   ├── client.ts              # OpenAI client setup
│   │   │   ├── embeddings.ts          # Embedding generation
│   │   │   └── rateLimiter.ts         # Rate limit handling
│   │   ├── pinecone/
│   │   │   ├── client.ts              # Pinecone connection
│   │   │   ├── upsert.ts              # Vector upsert logic
│   │   │   └── metadata.ts            # Metadata formatting
│   │   ├── chunking/
│   │   │   ├── chunker.ts             # Chunking algorithm
│   │   │   ├── tokenizer.ts           # Token counting
│   │   │   └── preprocessor.ts        # Quote extraction, URL handling
│   │   ├── queue/
│   │   │   └── queueClient.ts         # Azure Queue client
│   │   └── utils/
│   │       ├── logger.ts              # Structured logging
│   │       ├── errors.ts              # Error handling
│   │       └── metrics.ts             # Performance metrics
│   │
│   └── types/
│       ├── post.ts                    # Forum post types
│       ├── queue.ts                   # Queue message types
│       └── config.ts                  # Configuration types
│
├── tests/
│   ├── unit/
│   │   ├── chunking.test.ts
│   │   ├── embeddings.test.ts
│   │   └── preprocessor.test.ts
│   └── integration/
│       ├── cosmos.test.ts
│       ├── openai.test.ts
│       └── pinecone.test.ts
│
├── .github/
│   └── workflows/
│       ├── azure-infrastructure.yml  # Creates Azure resources
│       ├── deploy-dev.yml            # Deploys to dev environment
│       └── deploy-prod.yml           # Deploys to production
│
├── infra/                            # Infrastructure as Code
│   ├── bicep/
│   │   ├── main.bicep               # Main Bicep template
│   │   ├── function-app.bicep       # Function App resources
│   │   ├── cosmos-db.bicep          # Cosmos DB resources
│   │   └── monitoring.bicep         # Application Insights
│   └── scripts/
│       └── setup-azure.sh           # Helper script for Azure setup
│
├── local.settings.json              # Local development settings (git-ignored)
├── host.json                         # Function app settings
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── README.md
└── ARCHITECTURE.md                   # This file
```

**Note**: With v4 programming model:
- No `function.json` files needed
- Each function is a single `.ts` file
- Triggers and bindings defined in code using `app.timer()`, `app.storageQueue()`, `app.http()`

### Key Files Description

#### `src/functions/postDiscovery.ts`
Entry point for the timer-triggered function that discovers unprocessed posts (v4 Programming Model).

```typescript
import { app, InvocationContext, Timer, output } from "@azure/functions";
import { queryUnprocessedPosts } from "../lib/cosmos/queries";
import { chunkPosts } from "../lib/chunking/chunker";

const postsToProcessQueue = output.storageQueue({
  queueName: 'posts-to-process',
  connection: 'AzureWebJobsStorage'
});

app.timer('postDiscovery', {
  schedule: '0 */5 * * * *',
  extraOutputs: [postsToProcessQueue],
  handler: async (timer: Timer, context: InvocationContext): Promise<void> => {
    context.log('PostDiscovery function started');

    const posts = await queryUnprocessedPosts();
    const chunkedPosts = await chunkPosts(posts);

    // Enqueue each post/chunk to the processing queue
    for (const chunk of chunkedPosts) {
      context.extraOutputs.set(postsToProcessQueue, chunk);
    }

    context.log(`Enqueued ${chunkedPosts.length} posts/chunks`);
  }
});
```

#### `src/lib/cosmos/queries.ts`
Centralized Cosmos DB query logic.

```typescript
import { CosmosClient } from "@azure/cosmos";

export async function queryUnprocessedPosts(limit = 100) {
  const client = getCosmosClient();
  const container = client
    .database(process.env.COSMOS_DATABASE)
    .container(process.env.COSMOS_CONTAINER);

  const querySpec = {
    query: `
      SELECT * FROM c
      WHERE c.embeddingProcessed = false
         OR NOT IS_DEFINED(c.embeddingProcessed)
      ORDER BY c._ts ASC
      OFFSET 0 LIMIT @limit
    `,
    parameters: [{ name: "@limit", value: limit }]
  };

  const { resources } = await container.items.query(querySpec).fetchAll();
  return resources;
}

export async function updateProcessedStatus(
  postId: string,
  chunkIds: string[]
) {
  // Update logic
}
```

#### `src/lib/chunking/chunker.ts`
Text chunking implementation.

```typescript
import { encode, decode } from "js-tiktoken";
import { preprocessContent } from "./preprocessor";

export interface ChunkResult {
  postId: string;
  chunks: Array<{
    index: number;
    content: string;
    tokens: number;
  }>;
  totalChunks: number;
}

export async function chunkPosts(posts: Post[]): Promise<ChunkResult[]> {
  const results: ChunkResult[] = [];

  for (const post of posts) {
    const preprocessed = preprocessContent(post.content);
    const chunks = chunkText(
      preprocessed.text,
      process.env.CHUNK_MAX_TOKENS || 400,
      process.env.CHUNK_OVERLAP_TOKENS || 50
    );

    results.push({
      postId: post.id,
      chunks: chunks.map((content, index) => ({
        index,
        content,
        tokens: encode(content).length
      })),
      totalChunks: chunks.length
    });
  }

  return results;
}

function chunkText(
  text: string,
  maxTokens: number,
  overlap: number
): string[] {
  // Implementation from architecture document
}
```

#### `src/lib/openai/embeddings.ts`
OpenAI API integration with retry logic.

```typescript
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function generateEmbedding(
  content: string,
  retryCount = 0
): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: process.env.OPENAI_MODEL || "text-embedding-3-small",
      input: content
    });

    return response.data[0].embedding;

  } catch (error: any) {
    if (error.status === 429 && retryCount < 3) {
      const delay = Math.pow(2, retryCount) * 1000;
      await sleep(delay);
      return generateEmbedding(content, retryCount + 1);
    }
    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

#### `src/types/post.ts`
TypeScript type definitions.

```typescript
export interface ForumPost {
  id: string;
  type: "post" | "reply";
  url: string;
  threadId: string;
  threadSlug: string;
  category: string;
  threadTitle: string;
  author: string;
  timestamp: string;
  content: string;
  postNumber: number;
  isOriginalPost: boolean;

  // Embedding tracking fields
  embeddingProcessed?: boolean;
  embeddingId?: string;
  chunkingApplied?: boolean;
  chunkCount?: number;
  chunkIds?: string[];
  lastEmbeddingUpdate?: string;
}

export interface PostMetadata {
  postId: string;
  type: string;
  url: string;
  threadId: string;
  category: string;
  threadTitle: string;
  author: string;
  timestamp: string;
  postNumber: number;
  isOriginalPost: boolean;
}
```

#### `host.json`
Function app configuration.

```json
{
  "version": "2.0",
  "logging": {
    "applicationInsights": {
      "samplingSettings": {
        "isEnabled": true,
        "maxTelemetryItemsPerSecond": 20
      }
    }
  },
  "extensions": {
    "queues": {
      "maxPollingInterval": "00:00:02",
      "visibilityTimeout": "00:05:00",
      "batchSize": 16,
      "maxDequeueCount": 3,
      "newBatchThreshold": 8
    }
  },
  "functionTimeout": "00:10:00"
}
```

#### `package.json`
Dependencies and scripts.

```json
{
  "name": "eshf-embeddings",
  "version": "1.0.0",
  "scripts": {
    "start": "func start",
    "build": "tsc",
    "test": "jest",
    "deploy:dev": "func azure functionapp publish eshf-embeddings-dev",
    "deploy:prod": "func azure functionapp publish eshf-embeddings-prod"
  },
  "dependencies": {
    "@azure/cosmos": "^4.0.0",
    "@azure/functions": "^4.0.0",
    "@pinecone-database/pinecone": "^2.0.0",
    "openai": "^4.0.0",
    "js-tiktoken": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0"
  }
}
```

## Configuration

### Environment Variables
```
# Cosmos DB
COSMOS_ENDPOINT=https://...
COSMOS_KEY=<stored-in-key-vault>
COSMOS_DATABASE=eshf
COSMOS_CONTAINER=forum-posts

# OpenAI
OPENAI_API_KEY=<stored-in-key-vault>
OPENAI_MODEL=text-embedding-3-small
OPENAI_MAX_TOKENS=8191

# Pinecone
PINECONE_API_KEY=<stored-in-key-vault>
PINECONE_ENVIRONMENT=us-east-1-aws
PINECONE_INDEX=eshf-forum-embeddings

# Processing
BATCH_SIZE=100
MAX_RETRIES=3
PROCESSING_INTERVAL=0 */5 * * * *  # Every 5 minutes

# Chunking
ENABLE_CHUNKING=true
CHUNK_THRESHOLD_TOKENS=500
CHUNK_MAX_TOKENS=400
CHUNK_OVERLAP_TOKENS=50
```

## Deployment Strategy

### Local Development

**Prerequisites**:
```bash
# Install Azure Functions Core Tools
npm install -g azure-functions-core-tools@4

# Install Azurite for local storage
npm install -g azurite
```

**Setup**:
1. Clone repository and install dependencies:
   ```bash
   npm install
   ```

2. Create `local.settings.json`:
   ```json
   {
     "IsEncrypted": false,
     "Values": {
       "AzureWebJobsStorage": "UseDevelopmentStorage=true",
       "FUNCTIONS_WORKER_RUNTIME": "node",
       "COSMOS_ENDPOINT": "https://your-dev-cosmos.documents.azure.com:443/",
       "COSMOS_KEY": "your-dev-key",
       "COSMOS_DATABASE": "eshf-dev",
       "COSMOS_CONTAINER": "forum-posts",
       "OPENAI_API_KEY": "your-openai-key",
       "OPENAI_MODEL": "text-embedding-3-small",
       "PINECONE_API_KEY": "your-pinecone-key",
       "PINECONE_INDEX": "eshf-forum-dev",
       "BATCH_SIZE": "10",
       "ENABLE_CHUNKING": "true"
     }
   }
   ```

3. Start Azurite (in separate terminal):
   ```bash
   azurite --silent --location ./azurite --debug ./azurite/debug.log
   ```

4. Run functions locally:
   ```bash
   npm start
   ```

### Continuous Integration/Deployment

**GitHub Actions Workflow** (`.github/workflows/deploy-prod.yml`):
```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  AZURE_FUNCTIONAPP_NAME: 'eshf-embeddings-prod'
  NODE_VERSION: '20.x'

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build TypeScript
        run: npm run build

      - name: Deploy to Azure Functions
        uses: Azure/functions-action@v1
        with:
          app-name: ${{ env.AZURE_FUNCTIONAPP_NAME }}
          package: .
          publish-profile: ${{ secrets.AZURE_FUNCTIONAPP_PUBLISH_PROFILE }}
```

### Environment Strategy

| Environment | Purpose | Cosmos DB | Pinecone Index | BATCH_SIZE |
|-------------|---------|-----------|----------------|------------|
| **Local** | Development | Local/Dev | dev | 10 |
| **Dev** | Integration Testing | eshf-dev | eshf-forum-dev | 50 |
| **Staging** | Pre-production | eshf-staging | eshf-forum-staging | 100 |
| **Production** | Live | eshf-prod | eshf-forum-prod | 100 |

### Deployment Checklist

**Pre-Deployment**:
- [ ] Run `npm test` - All tests passing
- [ ] Run `npm run build` - TypeScript compiles without errors
- [ ] Review Application Insights for recent errors
- [ ] Check Cosmos DB RU/s allocation
- [ ] Verify Pinecone index capacity

**Post-Deployment**:
- [ ] Verify all 4 functions deployed successfully
- [ ] Check Application Insights for function startup
- [ ] Monitor first batch processing
- [ ] Verify queue messages flowing correctly
- [ ] Check dead letter queue is empty
- [ ] Review cost metrics after 24 hours

## Monitoring and Observability

### Metrics to Track
- **Processing Rate**: Posts processed per hour
- **Error Rate**: Failed embeddings / total attempts
- **API Latency**: OpenAI and Pinecone response times
- **Cost**: OpenAI token usage, Pinecone storage

### Logging
- INFO: Batch processing started/completed
- WARN: Rate limit approached, retrying
- ERROR: Failed to process post (with post ID)
- DEBUG: Individual API calls and responses

### Alerts
- High error rate (>5% failures)
- Processing backlog growing
- API rate limits exceeded
- Function execution failures

## Scalability Considerations

### Bottlenecks
1. **OpenAI Rate Limits**: Primary constraint
   - Solution: Implement queue-based processing
   - Adaptive batch sizing

2. **Cosmos DB RU consumption**
   - Solution: Query optimization
   - Pagination for large result sets

3. **Pinecone Upsert Limits**
   - Solution: Batch upserts (100 vectors per request)
   - Parallel upsert operations

### Scaling Strategy
- **Horizontal**: Multiple function instances (Azure manages)
- **Vertical**: Adjust batch sizes based on load
- **Queue-based**: Use Azure Queue Storage for large backlogs

## Cost Optimization

### OpenAI Costs
- **Input tokens**: ~0.00002/token for ada-002
- Estimate: 500 tokens avg per post
- 10,000 posts = ~$0.10-1.00 depending on model

### Pinecone Costs
- Storage cost per vector
- Query costs based on usage
- Use namespaces for organization

### Azure Functions
- Consumption plan: Pay per execution
- Monitor execution time and memory usage

## Security

### API Key Management
- Store all keys in Azure Key Vault
- Use Managed Identity for Azure Functions
- Rotate keys regularly

### Data Privacy
- Ensure compliance with data protection regulations
- Consider PII in forum posts
- Implement data retention policies

### Network Security
- VNet integration for Azure Functions
- Private endpoints for Cosmos DB
- IP allowlisting for Pinecone (if needed)

## Future Enhancements

1. **Incremental Updates**: Re-embed edited posts when content changes
2. **Multi-language Support**: Language detection and model selection
3. **Hybrid Search**: Combine vector search with keyword/BM25 filtering
4. **Analytics Dashboard**: Visualize processing metrics and search patterns
5. **A/B Testing**: Compare different embedding models (ada-002 vs text-embedding-3)
6. **Smart Chunking Boundaries**: Semantic boundary detection and paragraph-aware chunking
7. **Thread Context Embeddings**: Include thread title and category in embedding for better context

---

## Implementation Roadmap

### Phase 1: MVP (Weeks 1-2)
**Goal**: Basic end-to-end pipeline working

- [ ] Set up Azure infrastructure (Functions, Cosmos DB, Storage)
- [ ] Implement `PostDiscovery` function with basic Cosmos DB query
- [ ] Implement `EmbeddingProcessor` with OpenAI integration
- [ ] Implement `PineconeUploader` with basic upsert
- [ ] Test with small dataset (100-1000 posts)
- [ ] No chunking initially - process posts as-is

**Success Criteria**: Process test batch and retrieve results from Pinecone

### Phase 2: Production Features (Weeks 3-4)
**Goal**: Add reliability and monitoring

- [ ] Implement chunking logic for long posts
- [ ] Add comprehensive error handling and retries
- [ ] Set up Application Insights monitoring
- [ ] Implement dead letter queue handling
- [ ] Add German language preprocessing (quotes, umlauts)
- [ ] Create manual HTTP trigger for reprocessing
- [ ] Write unit tests for core logic

**Success Criteria**: Process 10k+ posts with <1% error rate

### Phase 3: Optimization (Week 5)
**Goal**: Performance tuning and cost optimization

- [ ] Optimize batch sizes and queue settings
- [ ] Implement rate limiting strategies
- [ ] Add cost tracking and alerts
- [ ] Performance testing with full dataset
- [ ] Documentation and runbooks

**Success Criteria**: Process 100k posts/day within budget

### Phase 4: Advanced Features (Week 6+)
**Goal**: Enhanced capabilities

- [ ] Smart chunking with paragraph boundaries
- [ ] Metadata enrichment
- [ ] Search quality testing
- [ ] Analytics dashboard
- [ ] A/B testing framework

---

## Quick Start Guide

### 1. Prerequisites
```bash
# Install Node.js 20.x
node --version  # Should be v20.x

# Install Azure Functions Core Tools
npm install -g azure-functions-core-tools@4

# Install Azurite
npm install -g azurite
```

### 2. Clone and Setup
```bash
git clone <repository-url>
cd eshf-embeddings
npm install
```

### 3. Configure Environment
Create `local.settings.json` (see Deployment Strategy section for template)

### 4. Start Development Environment
```bash
# Terminal 1: Start Azurite
azurite

# Terminal 2: Start Functions
npm start
```

### 5. Test Locally
```bash
# Trigger manual processing
curl -X POST http://localhost:7071/api/process

# Check queue status
curl http://localhost:7071/api/status
```

### 6. Deploy to Azure
```bash
# Build
npm run build

# Deploy
func azure functionapp publish eshf-embeddings-dev
```

---

## Support and Documentation

### Key Resources
- **Azure Functions Docs**: https://learn.microsoft.com/azure/azure-functions/
- **OpenAI API Docs**: https://platform.openai.com/docs
- **Pinecone Docs**: https://docs.pinecone.io/
- **Cosmos DB Docs**: https://learn.microsoft.com/azure/cosmos-db/

### Troubleshooting

**Issue**: Functions not triggering locally
- Check Azurite is running
- Verify `local.settings.json` has correct connection string
- Check `host.json` for correct runtime version

**Issue**: OpenAI rate limits
- Reduce `BATCH_SIZE` environment variable
- Check OpenAI dashboard for rate limit tier
- Implement exponential backoff (already in code)

**Issue**: Cosmos DB throttling
- Increase RU/s provisioning
- Optimize queries with proper indexing
- Reduce batch size

**Issue**: Queue messages stuck
- Check dead letter queue for failed messages
- Verify queue visibility timeout settings
- Check Application Insights for function errors

---

## Document Version

**Version**: 1.0
**Last Updated**: 2025-11-29
**Implementation Language**: TypeScript/Node.js
**Target Azure Functions Runtime**: v4
**Node.js Version**: 20.x
