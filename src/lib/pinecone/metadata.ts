/**
 * Pinecone metadata formatting utilities
 */

import { RecordMetadata } from '@pinecone-database/pinecone';
import { ForumPost, PostMetadata } from '../../types/post';
import * as logger from '../utils/logger';

/**
 * Converts a forum post to Pinecone metadata format
 *
 * Strips unnecessary Cosmos DB internal fields and formats metadata
 * for efficient storage and filtering in Pinecone.
 *
 * @param post - The forum post to convert
 * @returns Metadata object suitable for Pinecone storage
 */
export function formatMetadata(post: ForumPost): RecordMetadata {
  // Create content preview (first 200 characters)
  const contentPreview =
    post.content.length > 200
      ? post.content.substring(0, 200) + '...'
      : post.content;

  const metadata: RecordMetadata = {
    postId: post.id,
    type: post.type,
    url: post.url,
    threadId: post.threadId,
    threadSlug: post.threadSlug,
    category: post.category,
    threadTitle: post.threadTitle,
    author: post.author,
    timestamp: post.timestamp,
    postNumber: post.postNumber,
    isOriginalPost: post.isOriginalPost,
    contentPreview,
    contentLength: post.content.length,
  };

  logger.debug('Formatted metadata for Pinecone', {
    postId: post.id,
    category: post.category,
  });

  return metadata;
}

/**
 * Converts PostMetadata to Pinecone metadata format
 *
 * @param metadata - The post metadata to convert
 * @param postText - Optional post text (or chunk text if chunked)
 * @returns Metadata object suitable for Pinecone storage
 */
export function formatMetadataFromPostMetadata(
  metadata: PostMetadata,
  postText?: string
): RecordMetadata {
  const pineconeMetadata: RecordMetadata = {
    postId: metadata.postId,
    type: metadata.type,
    url: metadata.url,
    threadId: metadata.threadId,
    threadSlug: metadata.threadSlug,
    category: metadata.category,
    threadTitle: metadata.threadTitle,
    author: metadata.author,
    timestamp: metadata.timestamp,
    postNumber: metadata.postNumber,
    isOriginalPost: metadata.isOriginalPost,
  };

  if (postText) {
    pineconeMetadata.postText = postText;
  }

  return pineconeMetadata;
}

/**
 * Validates that metadata doesn't exceed Pinecone limits
 *
 * Pinecone has limits on metadata size and values.
 *
 * @param metadata - The metadata to validate
 * @returns true if valid, false otherwise
 */
export function validateMetadata(metadata: RecordMetadata): boolean {
  // Check that all values are serializable
  try {
    JSON.stringify(metadata);
  } catch (err) {
    logger.error('Metadata is not serializable', { error: String(err) });
    return false;
  }

  // Check metadata size (Pinecone limit is typically 40KB)
  const metadataSize = JSON.stringify(metadata).length;
  if (metadataSize > 40000) {
    logger.error('Metadata exceeds size limit', {
      size: metadataSize,
      limit: 40000,
    });
    return false;
  }

  logger.debug('Metadata validation passed', { size: metadataSize });
  return true;
}
