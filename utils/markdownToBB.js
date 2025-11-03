/**
 * Markdown to BB Code Converter for Bitrix24
 * Converts standard markdown formatting to Bitrix24-compatible BB codes
 * See: https://helpdesk.bitrix24.com/open/22132640/
 */

const { logger } = require('./logger');

class MarkdownToBBConverter {
  constructor() {
    this.conversions = [
      // Bold: **text** → [B]text[/B] (ONLY asterisks, NEVER underscores)
      { pattern: /\*\*(.+?)\*\*/g, replacement: '[B]$1[/B]', name: 'bold' },
      
      // Italic: *text* → [I]text[/I] (ONLY asterisks, NEVER underscores)
      { pattern: /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, replacement: '[I]$1[/I]', name: 'italic' },
      
      // Strikethrough: ~~text~~ → [S]text[/S]
      { pattern: /~~(.+?)~~/g, replacement: '[S]$1[/S]', name: 'strikethrough' },
      
      // Links: [text](url) → [URL=url]text[/URL]
      // Enhanced to handle URLs in link text and complex URLs
      { pattern: /\[([^\]]+)\]\(([^)]+)\)/g, replacement: '[URL=$2]$1[/URL]', name: 'link' },
      
      // Headers: ## Text → [B]Text[/B] (convert headers to bold)
      { pattern: /^#{1,6}\s+(.+)$/gm, replacement: '[B]$1[/B]', name: 'header' },
      
      // Code blocks: ```text``` → text (remove code formatting as BB doesn't support it well)
      { pattern: /```[\s\S]*?```/g, replacement: (match) => {
        return match.replace(/```(\w+)?\n?/g, '').replace(/```/g, '');
      }, name: 'code_block' },
      
      // Inline code: `text` → text (remove backticks)
      { pattern: /`([^`]+)`/g, replacement: '$1', name: 'inline_code' },
      
      // Bullet points: - item or * item → • item
      { pattern: /^[\s]*[-*+]\s+(.+)$/gm, replacement: '• $1', name: 'bullet_list' },
      
      // Numbered lists: 1. item → 1. item (keep as is)
      // No conversion needed for numbered lists
      
      // Quote blocks: > text → >>text
      { pattern: /^>\s+(.+)$/gm, replacement: '>>$1', name: 'blockquote' }
    ];
  }

  /**
   * Convert markdown text to BB code format
   * @param {string} text - The markdown text to convert
   * @param {Object} options - Conversion options
   * @returns {string} - BB code formatted text
   */
  convert(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return text;
    }

    try {
      let converted = text;
      const appliedConversions = [];

      // Protect URLs from markdown conversion by temporarily replacing them
      const urlProtector = new Map();
      let urlIndex = 0;
      
      // Find and protect URLs (including storage.googleapis.com, storage.cloud.google.com, etc.)
      const urlRegex = /https?:\/\/[^\s\)]+/g;
      converted = converted.replace(urlRegex, (url) => {
        const placeholder = `URLPLACEHOLDER${urlIndex++}`;
        urlProtector.set(placeholder, url);
        return placeholder;
      });

      // Apply each conversion (but not to protected URLs)
      for (const conversion of this.conversions) {
        const before = converted;
        
        if (typeof conversion.replacement === 'function') {
          converted = converted.replace(conversion.pattern, conversion.replacement);
        } else {
          converted = converted.replace(conversion.pattern, conversion.replacement);
        }
        
        if (before !== converted) {
          appliedConversions.push(conversion.name);
          
          // Enhanced logging for link conversions to debug malformation
          if (conversion.name === 'link' && options.debug) {
            logger.debug('Link conversion applied', {
              conversionName: conversion.name,
              beforeLength: before.length,
              afterLength: converted.length,
              beforeSnippet: before.substring(0, 150),
              afterSnippet: converted.substring(0, 150),
              pattern: conversion.pattern.toString()
            });
          }
        }
      }

      // Restore protected URLs
      urlProtector.forEach((originalUrl, placeholder) => {
        converted = converted.replace(placeholder, originalUrl);
      });

      // Log conversion details in debug mode
      if (options.debug && appliedConversions.length > 0) {
        logger.debug('Markdown to BB conversion applied', {
          conversions: appliedConversions,
          originalLength: text.length,
          convertedLength: converted.length
        });
      }

      return converted;

    } catch (error) {
      logger.error('Failed to convert markdown to BB code', {
        error: error.message,
        textLength: text.length,
        textPreview: text.substring(0, 100)
      });
      
      // Return original text if conversion fails
      return text;
    }
  }

  /**
   * Convert text for Bitrix24 chat messages
   * Wrapper method with appropriate options for chat
   * @param {string} text - The text to convert
   * @returns {string} - BB code formatted text suitable for Bitrix24
   */
  convertForChat(text) {
    return this.convert(text, { 
      debug: false, // Disable debug logging for production
      preserveLineBreaks: true 
    });
  }

  /**
   * Test the converter with sample markdown
   * @returns {Object} - Test results
   */
  test() {
    const testCases = [
      {
        name: 'Bold text',
        input: '**Bold text** and __also bold__',
        expected: '[B]Bold text[/B] and [B]also bold[/B]'
      },
      {
        name: 'Italic text', 
        input: '*Italic text* and _also italic_',
        expected: '[I]Italic text[/I] and [I]also italic[/I]'
      },
      {
        name: 'Mixed formatting',
        input: '**Bold** and *italic* and ~~strikethrough~~',
        expected: '[B]Bold[/B] and [I]italic[/I] and [S]strikethrough[/S]'
      },
      {
        name: 'Links',
        input: '[Google](https://google.com) and [Bitrix24](https://bitrix24.com)',
        expected: '[URL=https://google.com]Google[/URL] and [URL=https://bitrix24.com]Bitrix24[/URL]'
      },
      {
        name: 'Headers',
        input: '## Important Header\n### Subheader',
        expected: '[B]Important Header[/B]\n[B]Subheader[/B]'
      },
      {
        name: 'Lists',
        input: '- First item\n- Second item\n* Third item',
        expected: '• First item\n• Second item\n• Third item'
      },
      {
        name: 'Code',
        input: 'Use `console.log()` or ```\ncode block\n```',
        expected: 'Use console.log() or code block'
      },
      {
        name: 'Quotes',
        input: '> This is a quote\n> Second line',
        expected: '>>This is a quote\n>>Second line'
      }
    ];

    const results = {
      passed: 0,
      failed: 0,
      tests: []
    };

    for (const testCase of testCases) {
      const result = this.convert(testCase.input);
      const passed = result === testCase.expected;
      
      results.tests.push({
        name: testCase.name,
        input: testCase.input,
        expected: testCase.expected,
        actual: result,
        passed: passed
      });

      if (passed) {
        results.passed++;
      } else {
        results.failed++;
      }
    }

    return results;
  }
}

// Export singleton instance
const markdownToBBConverter = new MarkdownToBBConverter();

module.exports = {
  MarkdownToBBConverter,
  convertMarkdownToBB: (text, options) => markdownToBBConverter.convert(text, options),
  convertForBitrixChat: (text) => markdownToBBConverter.convertForChat(text),
  testConverter: () => markdownToBBConverter.test()
};