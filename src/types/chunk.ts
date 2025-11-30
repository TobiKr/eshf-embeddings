/**
 * Text chunk with metadata for embedding generation
 */
export interface Chunk {
  /** The text content of this chunk */
  text: string;

  /** Starting character position in the original content */
  startIndex: number;

  /** Ending character position in the original content */
  endIndex: number;

  /** Chunk sequence number (0-indexed) */
  chunkIndex: number;

  /** Total number of chunks from the original content */
  totalChunks: number;

  /** Approximate token count for this chunk */
  tokenCount: number;
}

/**
 * Configuration for text chunking
 */
export interface ChunkingConfig {
  /** Maximum tokens per chunk (default: 400) */
  maxTokens?: number;

  /** Token overlap between consecutive chunks (default: 50) */
  overlap?: number;

  /** Encoding to use for tokenization (default: 'cl100k_base' for text-embedding-3-*) */
  encoding?: string;
}

/**
 * Result of chunking operation
 */
export interface ChunkingResult {
  /** Array of text chunks */
  chunks: Chunk[];

  /** Original content length in characters */
  originalLength: number;

  /** Total tokens in original content */
  totalTokens: number;

  /** Whether the content was split into multiple chunks */
  wasChunked: boolean;
}
