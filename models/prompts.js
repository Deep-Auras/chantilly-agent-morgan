const { getFirestore, getFieldValue } = require('../config/firestore');
const { logger } = require('../utils/logger');
const { DEFAULT_PROMPTS, interpolate } = require('../config/prompts');
const config = require('../config/env');

class PromptsModel {
  constructor() {
    this.db = null;
    this.cache = new Map();
    this.cacheTimeout = 600000; // 10 minutes
  }

  async initialize() {
    this.db = getFirestore();
  }

  async getPrompt(key, variables = {}) {
    // If DB prompts are disabled, use defaults only
    if (!config.USE_DB_PROMPTS) {
      return this.getDefaultPrompt(key, variables);
    }

    // Check cache
    const cacheKey = `prompt:${key}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return interpolate(cached.value, variables);
    }

    try {
      // Try to get from Firestore
      const doc = await this.db.collection('prompts').doc(key).get();

      if (doc.exists) {
        const data = doc.data();
        if (data.active) {
          const prompt = data.template || data.prompt;

          // Update cache
          this.cache.set(cacheKey, {
            value: prompt,
            timestamp: Date.now()
          });

          return interpolate(prompt, variables);
        }
      }
    } catch (error) {
      logger.warn('Failed to fetch prompt from database, using default', {
        key,
        error: error.message
      });
    }

    // Fall back to default
    return this.getDefaultPrompt(key, variables);
  }

  getDefaultPrompt(key, variables = {}) {
    const [category, type = 'system'] = key.split('.');
    const prompt = DEFAULT_PROMPTS[category]?.[type];

    if (!prompt) {
      logger.error('Prompt not found', { key });
      return `No prompt found for ${key}`;
    }

    return interpolate(prompt, variables);
  }

  async savePrompt(key, template, metadata = {}) {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      await this.db.collection('prompts').doc(key).set({
        template,
        active: metadata.active !== false,
        version: metadata.version || 1,
        name: metadata.name || key,
        description: metadata.description || '',
        variables: metadata.variables || [],
        created: metadata.created || getFieldValue().serverTimestamp(),
        modified: getFieldValue().serverTimestamp()
      });

      // Invalidate cache
      const cacheKey = `prompt:${key}`;
      this.cache.delete(cacheKey);

      logger.info('Prompt saved', { key });
      return true;
    } catch (error) {
      logger.error('Failed to save prompt', { key, error: error.message });
      throw error;
    }
  }

  async listPrompts(filter = {}) {
    if (!this.db) {
      return [];
    }

    try {
      let query = this.db.collection('prompts');

      if (filter.active !== undefined) {
        query = query.where('active', '==', filter.active);
      }

      const snapshot = await query.get();
      const prompts = [];

      snapshot.forEach(doc => {
        prompts.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return prompts;
    } catch (error) {
      logger.error('Failed to list prompts', error);
      return [];
    }
  }

  async deactivatePrompt(key) {
    if (!this.db) {
      return false;
    }

    try {
      await this.db.collection('prompts').doc(key).update({
        active: false,
        modified: getFieldValue().serverTimestamp()
      });

      // Invalidate cache
      const cacheKey = `prompt:${key}`;
      this.cache.delete(cacheKey);

      logger.info('Prompt deactivated', { key });
      return true;
    } catch (error) {
      logger.error('Failed to deactivate prompt', { key, error: error.message });
      return false;
    }
  }

  clearCache() {
    this.cache.clear();
    logger.info('Prompts cache cleared');
  }
}

// Singleton instance
let promptsModel;

function getPromptsModel() {
  if (!promptsModel) {
    promptsModel = new PromptsModel();
  }
  return promptsModel;
}

module.exports = {
  PromptsModel,
  getPromptsModel
};