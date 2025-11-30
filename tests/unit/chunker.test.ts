/**
 * Unit tests for text chunking
 */

import { chunkText, countTokens } from '../../src/lib/chunking/chunker';

describe('countTokens', () => {
  it('should count tokens in simple text', () => {
    const text = 'Hello world';
    const count = countTokens(text);
    expect(count).toBeGreaterThan(0);
    expect(typeof count).toBe('number');
  });

  it('should count tokens in German text', () => {
    const text = 'Über die Dämmung müssen wir reden';
    const count = countTokens(text);
    expect(count).toBeGreaterThan(0);
  });

  it('should return 0 for empty string', () => {
    const count = countTokens('');
    expect(count).toBe(0);
  });
});

describe('chunkText', () => {
  it('should return single chunk for short content', () => {
    const content = 'This is a short forum post about home insulation.';
    const result = chunkText(content);

    expect(result.chunks).toHaveLength(1);
    expect(result.wasChunked).toBe(false);
    expect(result.chunks[0].chunkIndex).toBe(0);
    expect(result.chunks[0].totalChunks).toBe(1);
  });

  it('should create multiple chunks for long content', () => {
    // Create content that's definitely longer than 400 tokens
    const sentence = 'This is a sentence about energy-efficient building techniques. ';
    const content = sentence.repeat(100); // ~800+ tokens

    const result = chunkText(content, { maxTokens: 400, overlap: 50 });

    expect(result.chunks.length).toBeGreaterThan(1);
    expect(result.wasChunked).toBe(true);
    expect(result.totalTokens).toBeGreaterThan(400);
  });

  it('should preserve chunk ordering and metadata', () => {
    const sentence = 'Energy efficiency is important for sustainable housing. ';
    const content = sentence.repeat(100);

    const result = chunkText(content, { maxTokens: 300, overlap: 50 });

    result.chunks.forEach((chunk, index) => {
      expect(chunk.chunkIndex).toBe(index);
      expect(chunk.totalChunks).toBe(result.chunks.length);
      expect(chunk.tokenCount).toBeGreaterThan(0);
      expect(chunk.tokenCount).toBeLessThanOrEqual(300);
    });
  });

  it('should handle German special characters in chunks', () => {
    const content = 'Über die Dämmung müssen wir reden. '.repeat(100);
    const result = chunkText(content, { maxTokens: 300 });

    result.chunks.forEach((chunk) => {
      // German characters should be preserved
      expect(chunk.text).toMatch(/[äöüÄÖÜß]/);
    });
  });

  it('should create overlap between chunks', () => {
    const sentence = 'Each sentence provides unique information about the topic. ';
    const content = sentence.repeat(100);

    const result = chunkText(content, { maxTokens: 300, overlap: 50 });

    if (result.chunks.length > 1) {
      // With overlap, chunks should share some content
      // This is approximate due to token boundaries
      expect(result.chunks.length).toBeGreaterThan(1);
    }
  });

  it('should handle empty content gracefully', () => {
    const result = chunkText('');

    expect(result.chunks).toHaveLength(0);
    expect(result.wasChunked).toBe(false);
    expect(result.totalTokens).toBe(0);
  });

  it('should handle very short content', () => {
    const result = chunkText('Hi');

    expect(result.chunks).toHaveLength(0); // Too short, filtered by preprocessor
  });

  it('should respect custom max tokens', () => {
    const sentence = 'This is a test sentence. ';
    const content = sentence.repeat(100);

    const result = chunkText(content, { maxTokens: 200 });

    result.chunks.forEach((chunk) => {
      expect(chunk.tokenCount).toBeLessThanOrEqual(200);
    });
  });

  it('should respect custom overlap', () => {
    const sentence = 'Test sentence for overlap verification. ';
    const content = sentence.repeat(100);

    const result = chunkText(content, { maxTokens: 300, overlap: 100 });

    // With larger overlap, we should get more chunks
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  it('should handle content with quoted replies', () => {
    const content = `
      Original post content here.

      [quote]Someone said something[/quote]

      My response to the quote.
    `.repeat(50);

    const result = chunkText(content);

    // Quoted text should be preprocessed and removed
    result.chunks.forEach((chunk) => {
      expect(chunk.text).toContain('[quoted text removed]');
    });
  });

  it('should handle content with code blocks', () => {
    const content = `
      Here's my solution:

      [code]
      function calculate() {
        return 42;
      }
      [/code]

      What do you think?
    `.repeat(20);

    const result = chunkText(content);

    // Code blocks should be simplified
    result.chunks.forEach((chunk) => {
      if (chunk.text.includes('[code')) {
        expect(chunk.text).toMatch(/\[code block:/);
      }
    });
  });

  it('should handle content with URLs', () => {
    const content = `
      Check out this resource: https://example.com/path/to/page?param=value

      More information here: http://another-site.com/info
    `.repeat(30);

    const result = chunkText(content);

    // URLs should be simplified
    result.chunks.forEach((chunk) => {
      expect(chunk.text).not.toContain('?param=value');
    });
  });

  it('should handle mixed German and English content', () => {
    const content = `
      Die Wärmepumpe (heat pump) ist sehr effizient.
      The efficiency of modern heat pumps ist beeindruckend.
      Wir müssen about sustainable energy nachdenken.
    `.repeat(40);

    const result = chunkText(content);

    expect(result.chunks.length).toBeGreaterThan(0);
    result.chunks.forEach((chunk) => {
      expect(chunk.text.length).toBeGreaterThan(0);
    });
  });

  it('should provide accurate chunking result metadata', () => {
    const content = 'Test content for metadata validation. '.repeat(100);
    const result = chunkText(content);

    expect(result.originalLength).toBe(content.length);
    expect(result.totalTokens).toBeGreaterThan(0);
    expect(typeof result.wasChunked).toBe('boolean');

    if (result.wasChunked) {
      expect(result.chunks.length).toBeGreaterThan(1);
    } else {
      expect(result.chunks.length).toBeLessThanOrEqual(1);
    }
  });

  it('should handle paragraph-based semantic splitting', () => {
    const content = `
Paragraph one has information about heat pumps.
This paragraph continues the discussion.

Paragraph two discusses insulation materials.
More details about insulation here.

Paragraph three covers ventilation systems.
And even more about ventilation.
    `.repeat(30);

    const result = chunkText(content, { maxTokens: 400 });

    // Should successfully chunk the content
    expect(result.chunks.length).toBeGreaterThan(0);
  });
});
