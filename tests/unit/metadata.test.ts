/**
 * Unit tests for Pinecone metadata formatting
 */

import {
  formatMetadata,
  formatMetadataFromPostMetadata,
  validateMetadata,
} from '../../src/lib/pinecone/metadata';
import { ForumPost, PostMetadata } from '../../src/types/post';

describe('Pinecone Metadata Formatting', () => {
  const samplePost: ForumPost = {
    id: '83944-1',
    type: 'post',
    url: 'https://www.energiesparhaus.at/forum/thread-83944.html',
    threadId: '83944',
    threadSlug: 'grundriss-feedback',
    category: 'Bauplan & Grundriss',
    threadTitle: 'Grundriss Feedback',
    author: 'Hausbauer2025',
    timestamp: '2025-11-03T08:25Z',
    content: 'Hallo zusammen, ich würde gerne euren Feedback zu meinem Grundriss bekommen. Was haltet ihr davon?',
    postNumber: 1,
    isOriginalPost: true,
  };

  describe('formatMetadata', () => {
    it('should convert ForumPost to Pinecone metadata', () => {
      const metadata = formatMetadata(samplePost);

      expect(metadata.postId).toBe('83944-1');
      expect(metadata.type).toBe('post');
      expect(metadata.url).toBe('https://www.energiesparhaus.at/forum/thread-83944.html');
      expect(metadata.threadId).toBe('83944');
      expect(metadata.category).toBe('Bauplan & Grundriss');
      expect(metadata.author).toBe('Hausbauer2025');
      expect(metadata.isOriginalPost).toBe(true);
    });

    it('should create content preview for long content', () => {
      const longPost = { ...samplePost, content: 'A'.repeat(300) };
      const metadata = formatMetadata(longPost);

      expect(metadata.contentPreview).toBeDefined();
      expect(metadata.contentPreview).toHaveLength(203); // 200 chars + '...'
      expect(String(metadata.contentPreview).endsWith('...')).toBe(true);
    });

    it('should use full content for short content', () => {
      const shortPost = { ...samplePost, content: 'Short content' };
      const metadata = formatMetadata(shortPost);

      expect(metadata.contentPreview).toBe('Short content');
    });

    it('should include content length', () => {
      const metadata = formatMetadata(samplePost);
      expect(metadata.contentLength).toBe(samplePost.content.length);
    });

    it('should handle German characters correctly', () => {
      const germanPost = {
        ...samplePost,
        content: 'Über größere Häuser äußern',
      };
      const metadata = formatMetadata(germanPost);

      expect(metadata.contentPreview).toBe('Über größere Häuser äußern');
    });

    it('should not include Cosmos DB internal fields', () => {
      const postWithCosmosMeta = {
        ...samplePost,
        _rid: 'rid123',
        _self: 'self123',
        _etag: 'etag123',
        _ts: 1234567890,
      };
      const metadata = formatMetadata(postWithCosmosMeta);

      expect(metadata).not.toHaveProperty('_rid');
      expect(metadata).not.toHaveProperty('_self');
      expect(metadata).not.toHaveProperty('_etag');
      expect(metadata).not.toHaveProperty('_ts');
    });
  });

  describe('formatMetadataFromPostMetadata', () => {
    const sampleMetadata: PostMetadata = {
      postId: '83944-1',
      type: 'post',
      url: 'https://www.energiesparhaus.at/forum/thread-83944.html',
      threadId: '83944',
      threadSlug: 'grundriss-feedback',
      category: 'Bauplan & Grundriss',
      threadTitle: 'Grundriss Feedback',
      author: 'Hausbauer2025',
      timestamp: '2025-11-03T08:25Z',
      postNumber: 1,
      isOriginalPost: true,
    };

    it('should convert PostMetadata to Pinecone metadata', () => {
      const metadata = formatMetadataFromPostMetadata(sampleMetadata);

      expect(metadata.postId).toBe('83944-1');
      expect(metadata.type).toBe('post');
      expect(metadata.category).toBe('Bauplan & Grundriss');
      expect(metadata.author).toBe('Hausbauer2025');
    });

    it('should include postText if provided', () => {
      const postText = 'This is the post text';
      const metadata = formatMetadataFromPostMetadata(sampleMetadata, postText);

      expect(metadata.postText).toBe(postText);
    });

    it('should not include postText if not provided', () => {
      const metadata = formatMetadataFromPostMetadata(sampleMetadata);

      expect(metadata.postText).toBeUndefined();
    });
  });

  describe('validateMetadata', () => {
    it('should validate correct metadata', () => {
      const metadata = formatMetadata(samplePost);
      expect(validateMetadata(metadata)).toBe(true);
    });

    it('should reject metadata exceeding size limit', () => {
      const largeMetadata = {
        postId: '1',
        content: 'A'.repeat(45000), // Exceeds 40KB limit
      };

      expect(validateMetadata(largeMetadata)).toBe(false);
    });

    it('should reject non-serializable metadata', () => {
      const invalidMetadata: any = {
        postId: '1',
        circular: null,
      };
      invalidMetadata.circular = invalidMetadata; // Create circular reference

      expect(validateMetadata(invalidMetadata)).toBe(false);
    });

    it('should accept metadata under size limit', () => {
      const validMetadata = {
        postId: '1',
        content: 'A'.repeat(1000), // Well under 40KB
      };

      expect(validateMetadata(validMetadata)).toBe(true);
    });
  });
});
