const { logger } = require('./logger');

/**
 * Feature Flag System for Gradual Rollout
 *
 * Supports percentage-based rollout for vector search features.
 * Uses random distribution to determine feature availability per request.
 *
 * Environment Variables:
 * - ENABLE_VECTOR_SEARCH: Master switch (true/false)
 * - VECTOR_SEARCH_ROLLOUT_PERCENTAGE: 0-100 percentage
 * - ENABLE_SEMANTIC_TEMPLATES: Master switch
 * - SEMANTIC_TEMPLATES_ROLLOUT_PERCENTAGE: 0-100
 * - ENABLE_SEMANTIC_TOOLS: Master switch
 * - SEMANTIC_TOOLS_ROLLOUT_PERCENTAGE: 0-100
 */
class FeatureFlags {
  /**
   * Check if vector search should be enabled for this request
   * @returns {boolean} True if vector search should be used
   */
  static shouldUseVectorSearch() {
    // Check master switch first
    if (process.env.ENABLE_VECTOR_SEARCH !== 'true') {
      logger.debug('Vector search disabled by master switch');
      return false;
    }

    // Check rollout percentage
    const rolloutPercentage = parseInt(process.env.VECTOR_SEARCH_ROLLOUT_PERCENTAGE || '100');

    // If 100%, always enable (most common case in production)
    if (rolloutPercentage >= 100) {
      return true;
    }

    // If 0%, always disable
    if (rolloutPercentage <= 0) {
      return false;
    }

    // Random distribution for gradual rollout
    const random = Math.random() * 100;
    const shouldEnable = random < rolloutPercentage;

    logger.debug('Vector search rollout decision', {
      rolloutPercentage,
      randomValue: random.toFixed(2),
      enabled: shouldEnable
    });

    return shouldEnable;
  }

  /**
   * Check if semantic template matching should be enabled
   * @returns {boolean} True if semantic templates should be used
   */
  static shouldUseSemanticTemplates() {
    if (process.env.ENABLE_SEMANTIC_TEMPLATES !== 'true') {
      logger.debug('Semantic templates disabled by master switch');
      return false;
    }

    const rolloutPercentage = parseInt(process.env.SEMANTIC_TEMPLATES_ROLLOUT_PERCENTAGE || '100');

    if (rolloutPercentage >= 100) {
      return true;
    }

    if (rolloutPercentage <= 0) {
      return false;
    }

    const random = Math.random() * 100;
    return random < rolloutPercentage;
  }

  /**
   * Check if semantic tool triggers should be enabled
   * @returns {boolean} True if semantic tools should be used
   */
  static shouldUseSemanticTools() {
    if (process.env.ENABLE_SEMANTIC_TOOLS !== 'true') {
      logger.debug('Semantic tools disabled by master switch');
      return false;
    }

    const rolloutPercentage = parseInt(process.env.SEMANTIC_TOOLS_ROLLOUT_PERCENTAGE || '100');

    if (rolloutPercentage >= 100) {
      return true;
    }

    if (rolloutPercentage <= 0) {
      return false;
    }

    const random = Math.random() * 100;
    return random < rolloutPercentage;
  }

  /**
   * Get all feature flag states for monitoring/debugging
   * @returns {object} Current feature flag configuration
   */
  static getFeatureStates() {
    return {
      vectorSearch: {
        masterSwitch: process.env.ENABLE_VECTOR_SEARCH === 'true',
        rolloutPercentage: parseInt(process.env.VECTOR_SEARCH_ROLLOUT_PERCENTAGE || '100'),
        enabled: this.shouldUseVectorSearch()
      },
      semanticTemplates: {
        masterSwitch: process.env.ENABLE_SEMANTIC_TEMPLATES === 'true',
        rolloutPercentage: parseInt(process.env.SEMANTIC_TEMPLATES_ROLLOUT_PERCENTAGE || '100'),
        enabled: this.shouldUseSemanticTemplates()
      },
      semanticTools: {
        masterSwitch: process.env.ENABLE_SEMANTIC_TOOLS === 'true',
        rolloutPercentage: parseInt(process.env.SEMANTIC_TOOLS_ROLLOUT_PERCENTAGE || '100'),
        enabled: this.shouldUseSemanticTools()
      }
    };
  }

  /**
   * Log feature flag status for debugging
   */
  static logStatus() {
    const states = this.getFeatureStates();
    logger.info('Feature flag status', states);
  }
}

module.exports = { FeatureFlags };
