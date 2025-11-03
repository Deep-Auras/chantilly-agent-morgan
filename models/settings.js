const { getFirestore, getFieldValue } = require('../config/firestore');
const { logger } = require('../utils/logger');

class SettingsModel {
  constructor() {
    this.db = null;
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
  }

  async initialize() {
    this.db = getFirestore();
  }

  async get(path, defaultValue = null) {
    // Initialize if not already done
    if (!this.db) {
      await this.initialize();
    }

    // Check cache first
    const cacheKey = `settings:${path}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.value;
    }

    try {
      const [collection, docId] = path.split('/');
      const doc = await this.db.collection('settings').doc(collection).get();

      if (!doc.exists) {
        return defaultValue;
      }

      const data = doc.data();
      const value = docId ? data[docId] : data;

      // Update cache
      this.cache.set(cacheKey, {
        value,
        timestamp: Date.now()
      });

      return value || defaultValue;
    } catch (error) {
      logger.error('Failed to get setting', { path, error: error.message });
      return defaultValue;
    }
  }

  async set(path, value) {
    // Initialize if not already done
    if (!this.db) {
      await this.initialize();
    }

    try {
      const [collection, docId] = path.split('/');

      if (docId) {
        // Update nested field
        await this.db.collection('settings').doc(collection).set({
          [docId]: value,
          updated: getFieldValue().serverTimestamp()
        }, { merge: true });
      } else {
        // Update entire document
        await this.db.collection('settings').doc(collection).set({
          ...value,
          updated: getFieldValue().serverTimestamp()
        });
      }

      // Invalidate cache
      const cacheKey = `settings:${path}`;
      this.cache.delete(cacheKey);

      logger.info('Setting updated', { path });
      return true;
    } catch (error) {
      logger.error('Failed to set setting', { path, error: error.message });
      return false;
    }
  }

  async getGlobalSettings() {
    return this.get('global', {
      features: {
        translation: {
          enabled: true,
          autoDetectLanguage: true,
          defaultTargetLanguage: 'en'
        },
        queue: {
          maxRetries: 3,
          retryDelayMs: 5000
        }
      },
      rateLimits: {
        override: false,
        customLimits: {}
      }
    });
  }

  async getChannelSettings(channelId) {
    return this.get(`channels/${channelId}`, {
      enabled: true,
      features: [],
      customPrompts: {}
    });
  }

  async getUserSettings(userId) {
    return this.get(`users/${userId}`, {
      preferences: {
        language: 'en',
        notifications: true
      }
    });
  }

  clearCache() {
    this.cache.clear();
    logger.info('Settings cache cleared');
  }
}

// Singleton instance
let settingsModel;

function getSettingsModel() {
  if (!settingsModel) {
    settingsModel = new SettingsModel();
  }
  return settingsModel;
}

module.exports = {
  SettingsModel,
  getSettingsModel
};