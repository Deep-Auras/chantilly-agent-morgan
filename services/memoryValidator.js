const { logger } = require('../utils/logger');

/**
 * MemoryValidator - Validates ReasoningMemory entries
 *
 * Provides:
 * - Content validation (length, format)
 * - Malicious pattern detection
 * - Category/source validation
 * - Memory quota enforcement (100/template)
 * - Prevents memory poisoning
 */
class MemoryValidator {
  constructor() {
    this.maxMemoriesPerTemplate = 100;
    this.maxContentLength = 5000;
    this.bannedPatterns = [
      /process\./,
      /eval\(/,
      /require\(/,
      /admin\.firestore/,
      /GEMINI_API_KEY/,
      /Ignore previous/i,
      /Disregard instructions/i
    ];
  }

  /**
   * Validate memory entry
   * @param {Object} memory - Memory to validate
   * @param {string} source - Memory source
   * @returns {Object} - { valid: boolean, errors: [], sanitized: {} }
   */
  validateMemory(memory, source) {
    const errors = [];

    // Ensure memory is a plain object (not nested structures from Gemini)
    if (typeof memory !== 'object' || memory === null) {
      errors.push('Memory must be a valid object');
      return { valid: false, errors, sanitized: {} };
    }

    // Check for unexpected nested objects or arrays that could cause Firestore schema errors
    const allowedFields = ['title', 'description', 'content', 'category'];
    const unexpectedFields = Object.keys(memory).filter(key => !allowedFields.includes(key));
    if (unexpectedFields.length > 0) {
      logger.warn('Memory contains unexpected fields (will be ignored)', {
        unexpectedFields,
        memoryTitle: memory.title?.substring(0, 50)
      });
    }

    // Content validation
    if (!memory.content || memory.content.length === 0) {
      errors.push('Content is required');
    }

    if (memory.content?.length > this.maxContentLength) {
      errors.push(`Content too long (${this.maxContentLength} max)`);
    }

    // Check for malicious patterns
    for (const pattern of this.bannedPatterns) {
      if (pattern.test(memory.content)) {
        errors.push(`Banned pattern detected: ${pattern.source}`);
      }
      if (memory.title && pattern.test(memory.title)) {
        errors.push(`Banned pattern in title: ${pattern.source}`);
      }
    }

    // Category validation
    const validCategories = [
      'error_pattern',
      'fix_strategy',
      'api_usage',
      'general_strategy',
      'generation_pattern'
    ];
    if (!validCategories.includes(memory.category)) {
      errors.push(`Invalid category: ${memory.category}`);
    }

    // Source validation
    const validSources = [
      'task_success',
      'task_failure',
      'repair_success',
      'repair_failure',
      'user_modification'
    ];
    if (!validSources.includes(source)) {
      errors.push(`Invalid source: ${source}`);
    }

    // Prevent memory from failed tasks being marked as "success"
    if (source.includes('failure') && memory.successRate > 0) {
      errors.push('Failed source cannot have positive success rate');
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: this.sanitizeMemory(memory)
    };
  }

  /**
   * Sanitize memory content
   * @param {Object} memory - Memory to sanitize
   * @returns {Object} - Sanitized memory (only allowed fields)
   */
  sanitizeMemory(memory) {
    // Return ONLY the expected fields to prevent Firestore schema violations
    return {
      title: memory.title?.substring(0, 200) || 'Untitled',
      description: memory.description?.substring(0, 500) || '',
      content: memory.content?.substring(0, this.maxContentLength) || '',
      category: memory.category || 'general_strategy'
    };
  }

  /**
   * Check memory quota
   * @param {string} templateId - Template identifier
   * @param {Object} db - Firestore instance
   * @returns {Promise<Object>} - { allowed: boolean, reason?: string }
   */
  async checkMemoryQuota(templateId, db) {
    const count = await db.collection('reasoning-memory')
      .where('templateId', '==', templateId)
      .count()
      .get();

    if (count.data().count >= this.maxMemoriesPerTemplate) {
      return {
        allowed: false,
        reason: `Template has ${this.maxMemoriesPerTemplate} memories (max)`
      };
    }

    return { allowed: true };
  }
}

module.exports = { MemoryValidator };
