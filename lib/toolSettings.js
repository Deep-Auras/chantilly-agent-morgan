const { getFieldValue } = require('../config/firestore');
const { logger } = require('../utils/logger');

class ToolSettingsManager {
  constructor() {
    this.db = null;
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {return;}

    try {
      // Use the same Firestore initialization as the working knowledge management
      const { getFirestore } = require('../config/firestore');

      // Initialize Firestore if not already done
      await require('../config/firestore').initializeFirestore();

      this.db = getFirestore();
      this.initialized = true;
      logger.info('ToolSettingsManager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize ToolSettingsManager', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  async getToolSettings(toolName) {
    try {
      if (!this.initialized) {await this.initialize();}

      // Check cache first
      const cacheKey = `settings:${toolName}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.settings;
      }

      // Load from Firestore
      const doc = await this.db.collection('tool-settings').doc(toolName).get();

      if (doc.exists) {
        const settings = doc.data();

        // Cache the result
        this.cache.set(cacheKey, {
          settings: settings,
          timestamp: Date.now()
        });

        logger.info('Tool settings loaded', { toolName, settingsKeys: Object.keys(settings) });
        return settings;
      } else {
        logger.debug('No settings found for tool', { toolName });
        return {};
      }
    } catch (error) {
      logger.error('Failed to get settings for tool', { toolName, error: error.message, stack: error.stack });
      return {};
    }
  }

  async updateToolSettings(toolName, settings, userId = 'system') {
    try {
      if (!this.initialized) {await this.initialize();}

      const updateData = {
        ...settings,
        updatedAt: getFieldValue().serverTimestamp(),
        updatedBy: userId
      };

      await this.db.collection('tool-settings').doc(toolName).set(updateData, { merge: true });

      // Clear cache
      this.cache.delete(`settings:${toolName}`);

      logger.info('Tool settings updated', { toolName, userId });
      return { success: true };
    } catch (error) {
      logger.error('Failed to update settings for tool', { toolName, error: error.message, stack: error.stack });
      return { success: false, error: error.message };
    }
  }

  async deleteToolSettings(toolName, userId = 'system') {
    try {
      if (!this.initialized) {await this.initialize();}

      await this.db.collection('tool-settings').doc(toolName).delete();

      // Clear cache
      this.cache.delete(`settings:${toolName}`);

      logger.info('Tool settings deleted', { toolName, userId });
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete settings for tool', { toolName, error: error.message, stack: error.stack });
      return { success: false, error: error.message };
    }
  }

  async listAllToolSettings() {
    try {
      if (!this.initialized) {await this.initialize();}

      const snapshot = await this.db.collection('tool-settings').get();
      const allSettings = {};

      snapshot.forEach(doc => {
        allSettings[doc.id] = doc.data();
      });

      return allSettings;
    } catch (error) {
      logger.error('Failed to list all tool settings', { error: error.message, stack: error.stack });
      return {};
    }
  }

  async initializeDefaultSettings(toolName, defaultSettings, userId = 'system') {
    try {
      if (!this.initialized) {await this.initialize();}

      const doc = await this.db.collection('tool-settings').doc(toolName).get();
      
      if (!doc.exists) {
        const initData = {
          ...defaultSettings,
          createdAt: getFieldValue().serverTimestamp(),
          createdBy: userId,
          updatedAt: getFieldValue().serverTimestamp(),
          updatedBy: userId
        };

        await this.db.collection('tool-settings').doc(toolName).set(initData);
        logger.info('Default settings initialized', { toolName });
        return { success: true, created: true };
      } else {
        logger.debug('Settings already exist, skipping initialization', { toolName });
        return { success: true, created: false };
      }
    } catch (error) {
      logger.error('Failed to initialize default settings', { toolName, error: error.message, stack: error.stack });
      return { success: false, error: error.message };
    }
  }

  clearCache(toolName = null) {
    if (toolName) {
      this.cache.delete(`settings:${toolName}`);
    } else {
      this.cache.clear();
    }
  }
}

// Singleton instance
const toolSettingsManager = new ToolSettingsManager();

module.exports = toolSettingsManager;