/**
 * Unit tests for text preprocessor
 */

import { preprocessContent, isValidContent, getContentPreview } from '../../src/lib/chunking/preprocessor';

describe('preprocessContent', () => {
  it('should preserve German special characters', () => {
    const content = 'Über die Dämmung müssen wir reden. Größe: 30cm.';
    const result = preprocessContent(content);
    expect(result).toContain('Über');
    expect(result).toContain('Dämmung');
    expect(result).toContain('müssen');
    expect(result).toContain('Größe');
  });

  it('should normalize line endings', () => {
    const content = 'Line 1\r\nLine 2\r\nLine 3';
    const result = preprocessContent(content);
    expect(result).toBe('Line 1\nLine 2\nLine 3');
  });

  it('should remove quoted replies', () => {
    const content = 'My response here.\n[quote]Someone else said this[/quote]\nMore of my content.';
    const result = preprocessContent(content);
    expect(result).toContain('My response here');
    expect(result).toContain('[quoted text removed]');
    expect(result).toContain('More of my content');
    expect(result).not.toContain('Someone else said this');
  });

  it('should simplify code blocks', () => {
    const content = 'Here is some code:\n[code]function test() {\n  return 42;\n}[/code]\nThat was the code.';
    const result = preprocessContent(content);
    expect(result).toContain('Here is some code');
    expect(result).toContain('[code block:');
    expect(result).toContain('That was the code');
    // Code preview is kept for context (up to 50 chars), may include newlines
    expect(result).toMatch(/\[code block:[\s\S]*\.\.\.\]/);
  });

  it('should simplify URLs', () => {
    const content = 'Check out https://example.com/very/long/path?param=value for more info.';
    const result = preprocessContent(content);
    expect(result).toContain('[link: example.com]');
    expect(result).not.toContain('/very/long/path');
    expect(result).not.toContain('?param=value');
  });

  it('should normalize multiple newlines', () => {
    const content = 'Paragraph 1\n\n\n\n\nParagraph 2';
    const result = preprocessContent(content);
    expect(result).toBe('Paragraph 1\n\nParagraph 2');
  });

  it('should normalize multiple spaces', () => {
    const content = 'Too    many     spaces';
    const result = preprocessContent(content);
    expect(result).toBe('Too many spaces');
  });

  it('should trim whitespace from lines', () => {
    const content = '  Line 1  \n  Line 2  ';
    const result = preprocessContent(content);
    expect(result).toBe('Line 1\nLine 2');
  });

  it('should handle empty content', () => {
    const result = preprocessContent('');
    expect(result).toBe('');
  });

  it('should handle null/undefined gracefully', () => {
    const result1 = preprocessContent(null as any);
    const result2 = preprocessContent(undefined as any);
    expect(result1).toBe('');
    expect(result2).toBe('');
  });

  it('should handle complex forum post with German content', () => {
    const content = `
      [quote author="Hans"]
      Wie funktioniert die Wärmepumpe?
      [/quote]

      Die Wärmepumpe nutzt das Prinzip der Wärmeübertragung.

      Hier ist ein Beispiel:
      [code]
      temperature = 20°C
      efficiency = 0.95
      [/code]

      Mehr Infos: https://energieforum.de/waermepumpe?id=123



      Das war's!
    `;
    const result = preprocessContent(content);
    expect(result).toContain('[quoted text removed]');
    expect(result).toContain('Wärmepumpe');
    expect(result).toContain('Wärmeübertragung');
    expect(result).toContain('[code block:');
    expect(result).toContain('[link: energieforum.de]');
    expect(result).not.toContain('\n\n\n');
    expect(result.trim()).toBe(result); // No leading/trailing whitespace
  });
});

describe('isValidContent', () => {
  it('should accept valid content', () => {
    const content = 'This is valid forum post content with enough text.';
    expect(isValidContent(content)).toBe(true);
  });

  it('should reject empty content', () => {
    expect(isValidContent('')).toBe(false);
  });

  it('should reject null/undefined', () => {
    expect(isValidContent(null as any)).toBe(false);
    expect(isValidContent(undefined as any)).toBe(false);
  });

  it('should reject very short content', () => {
    expect(isValidContent('Hi')).toBe(false);
    expect(isValidContent('123')).toBe(false);
  });

  it('should reject mostly whitespace content', () => {
    expect(isValidContent('                ')).toBe(false);
    expect(isValidContent('\n\n\n\n\n')).toBe(false);
  });

  it('should accept content with German characters', () => {
    const content = 'Gültiger Inhalt über Dämmung';
    expect(isValidContent(content)).toBe(true);
  });
});

describe('getContentPreview', () => {
  it('should return full content if shorter than max length', () => {
    const content = 'Short content';
    expect(getContentPreview(content)).toBe('Short content');
  });

  it('should truncate long content with ellipsis', () => {
    const content = 'a'.repeat(200);
    const preview = getContentPreview(content, 100);
    expect(preview).toHaveLength(103); // 100 chars + '...'
    expect(preview.endsWith('...')).toBe(true);
  });

  it('should handle empty content', () => {
    expect(getContentPreview('')).toBe('[empty]');
    expect(getContentPreview(null as any)).toBe('[empty]');
  });

  it('should respect custom max length', () => {
    const content = 'a'.repeat(100);
    const preview = getContentPreview(content, 50);
    expect(preview).toHaveLength(53); // 50 chars + '...'
  });
});
