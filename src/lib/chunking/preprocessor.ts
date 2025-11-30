/**
 * Text preprocessing for German energy forum content
 *
 * Handles:
 * - German special characters (umlauts: ä, ö, ü, ß)
 * - Quoted reply formatting
 * - Multiple newlines and whitespace normalization
 * - Forum-specific formatting (code blocks, links)
 */

import * as logger from '../utils/logger';

/**
 * Preprocesses forum post content for embedding generation
 *
 * @param content - Raw forum post content
 * @returns Cleaned and normalized content
 */
export function preprocessContent(content: string): string {
  if (!content || typeof content !== 'string') {
    logger.warn('Invalid content provided to preprocessor', {
      contentType: typeof content,
    });
    return '';
  }

  let processed = content;

  // Step 1: Normalize line endings (Windows CRLF -> Unix LF)
  processed = processed.replace(/\r\n/g, '\n');

  // Step 2: Remove or simplify quoted replies (common in forums)
  // Pattern: [quote]...[/quote] or similar BBCode-style quotes
  processed = processed.replace(/\[quote[^\]]*\][\s\S]*?\[\/quote\]/gi, '[quoted text removed]');

  // Step 3: Clean up code blocks but preserve their presence
  // Pattern: [code]...[/code] or ```...```
  processed = processed.replace(/\[code[^\]]*\]([\s\S]*?)\[\/code\]/gi, (match, code) => {
    return `[code block: ${code.trim().substring(0, 50)}...]`;
  });
  processed = processed.replace(/```[\s\S]*?```/g, '[code block]');

  // Step 4: Simplify URLs while preserving context
  // Keep domain for context but remove query parameters
  processed = processed.replace(
    /https?:\/\/([^\s]+)/gi,
    (match, rest) => {
      const domain = rest.split('/')[0];
      return `[link: ${domain}]`;
    }
  );

  // Step 5: Normalize whitespace (but preserve paragraph breaks)
  // Replace 3+ newlines with 2 newlines (paragraph separator)
  processed = processed.replace(/\n{3,}/g, '\n\n');

  // Replace multiple spaces with single space
  processed = processed.replace(/ {2,}/g, ' ');

  // Trim whitespace from start and end of each line
  processed = processed
    .split('\n')
    .map((line) => line.trim())
    .join('\n');

  // Step 6: Remove empty lines at start and end
  processed = processed.trim();

  // Step 7: Preserve German special characters (no normalization needed)
  // Characters like ä, ö, ü, ß should be preserved as-is for German language processing

  logger.debug('Content preprocessed', {
    originalLength: content.length,
    processedLength: processed.length,
    reductionPercent: Math.round(((content.length - processed.length) / content.length) * 100),
  });

  return processed;
}

/**
 * Validates that content is suitable for embedding generation
 *
 * @param content - Content to validate
 * @returns true if valid, false otherwise
 */
export function isValidContent(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false;
  }

  const trimmed = content.trim();

  // Minimum content length (at least a few words)
  if (trimmed.length < 10) {
    logger.warn('Content too short for embedding', { length: trimmed.length });
    return false;
  }

  // Check if content is mostly whitespace
  const nonWhitespaceRatio = (trimmed.replace(/\s/g, '').length / trimmed.length);
  if (nonWhitespaceRatio < 0.3) {
    logger.warn('Content is mostly whitespace', { ratio: nonWhitespaceRatio });
    return false;
  }

  return true;
}

/**
 * Extracts a preview of the content for logging/debugging
 *
 * @param content - Content to preview
 * @param maxLength - Maximum preview length (default: 100)
 * @returns Preview string
 */
export function getContentPreview(content: string, maxLength = 100): string {
  if (!content) {
    return '[empty]';
  }

  const preview = content.trim().substring(0, maxLength);
  return preview.length < content.trim().length ? `${preview}...` : preview;
}
