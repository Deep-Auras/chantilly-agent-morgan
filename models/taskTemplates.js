const { getFirestore, getFieldValue } = require('../config/firestore');
const { FieldValue } = require('@google-cloud/firestore');
const { logger } = require('../utils/logger');
const embeddingService = require('../services/embeddingService');

/**
 * TaskTemplatesModel - Manages task templates in Firestore
 * Follows established Chantilly model patterns for consistency
 */
class TaskTemplatesModel {
  constructor() {
    this.db = null;
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
    this.collectionName = 'task-templates';
  }

  async initialize() {
    this.db = getFirestore();
  }

  /**
   * Get a task template by ID
   * @param {string} templateId - Template identifier
   * @returns {Object|null} - Template data or null if not found
   */
  async getTemplate(templateId) {
    if (!this.db) {
      await this.initialize();
    }

    // Check cache first
    const cacheKey = `template:${templateId}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.value;
    }

    try {
      const doc = await this.db.collection(this.collectionName).doc(templateId).get();
      
      if (!doc.exists) {
        return null;
      }

      const template = doc.data();
      
      // Update cache
      this.cache.set(cacheKey, {
        value: template,
        timestamp: Date.now()
      });

      return template;
    } catch (error) {
      logger.error('Failed to get task template', { templateId, error: error.message });
      return null;
    }
  }

  /**
   * Get all templates (enabled and disabled)
   * @returns {Array} - Array of all templates
   */
  async getAllTemplates() {
    if (!this.db) {
      await this.initialize();
    }

    // Check cache first
    const cacheKey = 'all_templates';
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.value;
    }

    try {
      const snapshot = await this.db.collection(this.collectionName)
        .orderBy('updatedAt', 'desc')
        .get();

      const templates = [];
      snapshot.forEach(doc => {
        templates.push({ id: doc.id, ...doc.data() });
      });

      // Update cache
      this.cache.set(cacheKey, {
        value: templates,
        timestamp: Date.now()
      });

      logger.info('All templates loaded', { count: templates.length });
      return templates;
    } catch (error) {
      logger.error('Failed to get all templates', { error: error.message });
      return [];
    }
  }

  /**
   * Get all active templates
   * @returns {Array} - Array of active templates
   */
  async getActiveTemplates() {
    if (!this.db) {
      await this.initialize();
    }

    // Check cache first
    const cacheKey = 'active_templates';
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.value;
    }

    try {
      const snapshot = await this.db.collection(this.collectionName)
        .where('enabled', '==', true)
        .orderBy('updatedAt', 'desc')
        .get();

      const templates = [];
      snapshot.forEach(doc => {
        templates.push({ id: doc.id, ...doc.data() });
      });

      // Update cache
      this.cache.set(cacheKey, {
        value: templates,
        timestamp: Date.now()
      });

      logger.info('Active templates loaded', { count: templates.length });
      return templates;
    } catch (error) {
      logger.error('Failed to get active templates', { error: error.message });
      return [];
    }
  }

  /**
   * Create a new task template
   * @param {string} templateId - Template identifier
   * @param {Object} templateData - Template configuration
   * @returns {boolean} - Success status
   */
  async createTemplate(templateId, templateData) {
    if (!this.db) {
      await this.initialize();
    }

    try {
      // PHASE 1: Validate executionScript before storing
      if (templateData.executionScript) {
        const { getTaskTemplateLoader } = require('../services/taskTemplateLoader');
        const loader = getTaskTemplateLoader();

        const scriptValidation = await loader.validateAndPrepareScript(
          templateData.executionScript,
          templateId
        );

        if (!scriptValidation.valid) {
          logger.error('Template script validation failed during creation', {
            templateId,
            error: scriptValidation.error
          });
          throw new Error(`Invalid executionScript: ${scriptValidation.error}`);
        }

        // Use validated/escaped script
        templateData.executionScript = scriptValidation.script;

        if (scriptValidation.escaped) {
          logger.warn('Template script was auto-escaped during creation', {
            templateId,
            originalError: scriptValidation.originalError
          });
        }
      }

      // PHASE 2: Generate TWO embeddings for semantic search
      // nameEmbedding: High similarity for exact name matches (short queries)
      // embedding: Full semantic search (descriptive queries)
      let nameEmbedding = null;
      let embedding = null;

      const templateName = templateData.name || '';
      const embeddingText = `${templateName} ${templateData.description || ''}`.trim();

      if (templateName) {
        try {
          // Generate name-only embedding for exact matching
          nameEmbedding = await embeddingService.embedQuery(templateName, 'SEMANTIC_SIMILARITY');
          logger.info('Template name embedding generated', {
            templateId,
            name: templateName,
            embeddingDimensions: nameEmbedding?.length || 0
          });
        } catch (embeddingError) {
          logger.error('Failed to generate template name embedding', {
            templateId,
            error: embeddingError.message
          });
        }
      }

      if (embeddingText) {
        try {
          // Generate full-text embedding for semantic search
          embedding = await embeddingService.embedQuery(embeddingText, 'SEMANTIC_SIMILARITY');
          logger.info('Template full embedding generated', {
            templateId,
            name: templateName,
            embeddingDimensions: embedding?.length || 0
          });
        } catch (embeddingError) {
          logger.error('Failed to generate template full embedding', {
            templateId,
            error: embeddingError.message
          });
          // Continue without embedding - template still gets created
        }
      }

      const template = {
        ...templateData,
        templateId,
        nameEmbedding: nameEmbedding ? FieldValue.vector(nameEmbedding) : null, // Name-only for exact matching
        embedding: embedding ? FieldValue.vector(embedding) : null, // Full text for semantic search
        createdAt: getFieldValue().serverTimestamp(),
        updatedAt: getFieldValue().serverTimestamp(),
        enabled: templateData.enabled ?? true,
        testing: templateData.testing ?? true, // Default to testing mode for safe initial runs
        scriptValidated: true, // Mark as validated
        scriptEscaped: templateData.scriptEscaped || false
      };

      await this.db.collection(this.collectionName).doc(templateId).set(template);

      // Clear cache
      this.clearCache();

      // CRITICAL: Also clear executor cache when template is created
      // This ensures any cached references are removed (defensive programming)
      try {
        const { getTaskTemplateLoader } = require('../services/taskTemplateLoader');
        const templateLoader = getTaskTemplateLoader();
        templateLoader.clearTemplateCache(templateId);
        logger.info('Cleared executor cache after template creation', { templateId });
      } catch (error) {
        logger.error('Failed to clear executor cache after creation', {
          templateId,
          error: error.message
        });
        // Don't fail the creation if cache clear fails
      }

      logger.info('Task template created', {
        templateId,
        name: templateData.name,
        hasEmbedding: !!embedding
      });
      return true;
    } catch (error) {
      logger.error('Failed to create task template', { templateId, error: error.message });
      return false;
    }
  }

  /**
   * Update an existing task template
   * @param {string} templateId - Template identifier
   * @param {Object} updates - Fields to update
   * @returns {boolean} - Success status
   */
  async updateTemplate(templateId, updates) {
    if (!this.db) {
      await this.initialize();
    }

    try {
      // PHASE 1: Validate executionScript if being updated
      if (updates.executionScript) {
        const { getTaskTemplateLoader } = require('../services/taskTemplateLoader');
        const loader = getTaskTemplateLoader();

        const scriptValidation = await loader.validateAndPrepareScript(
          updates.executionScript,
          templateId
        );

        if (!scriptValidation.valid) {
          logger.error('Template script validation failed during update', {
            templateId,
            error: scriptValidation.error
          });
          throw new Error(`Invalid executionScript: ${scriptValidation.error}`);
        }

        // Use validated/escaped script
        updates.executionScript = scriptValidation.script;

        if (scriptValidation.escaped) {
          logger.warn('Template script was auto-escaped during update', {
            templateId,
            originalError: scriptValidation.originalError
          });
          updates.scriptEscaped = true;
        }

        updates.scriptValidated = true;
      }

      // PHASE 2: Regenerate BOTH embeddings on ANY update to keep search index current
      // This ensures templates remain findable via both exact and semantic search
      let nameEmbedding = null;
      let embedding = null;

      // Get current template to merge with updates for embedding generation
      const current = await this.getTemplate(templateId);
      const templateName = updates.name || current?.name || '';
      const embeddingText = `${templateName} ${updates.description || current?.description || ''}`.trim();

      if (templateName) {
        try {
          // Regenerate name-only embedding
          nameEmbedding = await embeddingService.embedQuery(templateName, 'SEMANTIC_SIMILARITY');
          logger.info('Template name embedding regenerated after update', {
            templateId,
            name: templateName,
            embeddingDimensions: nameEmbedding?.length || 0
          });
        } catch (embeddingError) {
          logger.error('Failed to regenerate template name embedding', {
            templateId,
            error: embeddingError.message
          });
        }
      }

      if (embeddingText) {
        try {
          // Regenerate full-text embedding
          embedding = await embeddingService.embedQuery(embeddingText, 'SEMANTIC_SIMILARITY');
          logger.info('Template full embedding regenerated after update', {
            templateId,
            name: templateName,
            embeddingDimensions: embedding?.length || 0,
            updateType: updates.name || updates.description ? 'metadata_change' : 'script_modification'
          });
        } catch (embeddingError) {
          logger.error('Failed to regenerate template full embedding', {
            templateId,
            error: embeddingError.message
          });
          // Continue without embedding - update still proceeds
        }
      }

      const updateData = {
        ...updates,
        ...(nameEmbedding ? { nameEmbedding: FieldValue.vector(nameEmbedding) } : {}), // Update name embedding if generated
        ...(embedding ? { embedding: FieldValue.vector(embedding) } : {}), // Update full embedding if generated
        updatedAt: getFieldValue().serverTimestamp()
      };

      await this.db.collection(this.collectionName).doc(templateId).update(updateData);

      // Clear cache
      this.clearCache();

      // CRITICAL: Also clear executor cache when template is manually modified
      // This ensures compiled scripts are regenerated with the new template code
      try {
        const { getTaskTemplateLoader } = require('../services/taskTemplateLoader');
        const templateLoader = getTaskTemplateLoader();
        templateLoader.clearTemplateCache(templateId);
        logger.info('Cleared executor cache after template update', { templateId });
      } catch (error) {
        logger.error('Failed to clear executor cache after update', {
          templateId,
          error: error.message
        });
        // Don't fail the update if cache clear fails
      }

      logger.info('Task template updated', {
        templateId,
        hasNewEmbedding: !!embedding
      });
      return true;
    } catch (error) {
      logger.error('Failed to update task template', { templateId, error: error.message });
      return false;
    }
  }

  /**
   * Delete a task template
   * @param {string} templateId - Template identifier
   * @returns {boolean} - Success status
   */
  async deleteTemplate(templateId) {
    if (!this.db) {
      await this.initialize();
    }

    try {
      await this.db.collection(this.collectionName).doc(templateId).delete();
      
      // Clear cache
      this.clearCache();
      
      logger.info('Task template deleted', { templateId });
      return true;
    } catch (error) {
      logger.error('Failed to delete task template', { templateId, error: error.message });
      return false;
    }
  }

  /**
   * Enable/disable a template
   * @param {string} templateId - Template identifier
   * @param {boolean} enabled - Enable status
   * @returns {boolean} - Success status
   */
  async setTemplateEnabled(templateId, enabled) {
    return await this.updateTemplate(templateId, { enabled });
  }

  /**
   * Find templates by category
   * @param {string} category - Template category
   * @returns {Array} - Matching templates
   */
  async getTemplatesByCategory(category) {
    if (!this.db) {
      await this.initialize();
    }

    try {
      const snapshot = await this.db.collection(this.collectionName)
        .where('category', 'array-contains', category)
        .where('enabled', '==', true)
        .get();

      const templates = [];
      snapshot.forEach(doc => {
        templates.push({ id: doc.id, ...doc.data() });
      });

      return templates;
    } catch (error) {
      logger.error('Failed to get templates by category', { category, error: error.message });
      return [];
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    logger.debug('Task templates cache cleared');
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache stats
   */
  getCacheStats() {
    return {
      cacheSize: this.cache.size,
      cacheTimeout: this.cacheTimeout
    };
  }
}

// Singleton instance
let instance = null;

function getTaskTemplatesModel() {
  if (!instance) {
    instance = new TaskTemplatesModel();
  }
  return instance;
}

module.exports = {
  TaskTemplatesModel,
  getTaskTemplatesModel
};