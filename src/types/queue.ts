import { PostMetadata } from './post';

/**
 * Message format for posts-to-process queue
 */
export interface PostQueueMessage {
  postId: string;
  content: string;
  metadata: PostMetadata;
}

/**
 * Chunk metadata for tracking chunks within a post
 */
export interface ChunkMetadata {
  /** Chunk sequence number (0-indexed) */
  chunkIndex: number;

  /** Total number of chunks for this post */
  totalChunks: number;

  /** Token count for this chunk */
  tokenCount: number;

  /** Starting character position in original content */
  startIndex: number;

  /** Ending character position in original content */
  endIndex: number;
}

/**
 * Message format for embeddings-ready queue
 */
export interface EmbeddingResult {
  postId: string;
  embedding: number[];
  metadata: PostMetadata;
  timestamp: string;

  /** Chunk metadata (present if post was chunked, undefined for single-chunk posts) */
  chunkMetadata?: ChunkMetadata;

  /** The actual post text (or chunk text if chunked) */
  postText: string;
}
