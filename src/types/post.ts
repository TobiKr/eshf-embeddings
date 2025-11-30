/**
 * Forum post structure from Cosmos DB
 */
export interface ForumPost {
  id: string;
  type: 'post' | 'reply';
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

  // Embedding tracking (added by processing)
  embeddingProcessed?: boolean;
  embeddingId?: string;
  lastEmbeddingUpdate?: string;

  // Cosmos DB metadata
  _rid?: string;
  _self?: string;
  _etag?: string;
  _ts?: number;
}

/**
 * Metadata extracted from forum post for embedding storage
 */
export interface PostMetadata {
  postId: string;
  type: string;
  url: string;
  threadId: string;
  threadSlug: string;
  category: string;
  threadTitle: string;
  author: string;
  timestamp: string;
  postNumber: number;
  isOriginalPost: boolean;
}
