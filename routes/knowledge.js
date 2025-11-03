const express = require('express');
const router = express.Router();
const joi = require('joi');
const { getKnowledgeBase } = require('../services/knowledgeBase');
const { authenticateToken, sanitizeInput } = require('../middleware/auth');
const {
  objectLevelAuth,
  propertyLevelAuth,
  functionLevelAuth,
  businessFlowProtection,
  ssrfProtection,
  sensitiveOpLimiter
} = require('../middleware/security');
const { logger } = require('../utils/logger');

// Apply security middleware to all routes
router.use(sanitizeInput);
router.use(ssrfProtection);
router.use(businessFlowProtection);

// Validation schemas
const addKnowledgeSchema = joi.object({
  title: joi.string().required().max(200),
  content: joi.string().required().max(10000),
  tags: joi.array().items(joi.string().max(50)).default([]),
  category: joi.string().max(100).default('general'),
  priority: joi.number().min(0).max(100).default(0),
  searchTerms: joi.array().items(joi.string().max(100)).default([]),
  enabled: joi.boolean().default(true)
});

const updateKnowledgeSchema = joi.object({
  title: joi.string().max(200),
  content: joi.string().max(10000),
  tags: joi.array().items(joi.string().max(50)),
  category: joi.string().max(100),
  priority: joi.number().min(0).max(100),
  searchTerms: joi.array().items(joi.string().max(100)),
  enabled: joi.boolean()
});

const searchSchema = joi.object({
  query: joi.string().required().max(500),
  category: joi.string().max(100),
  maxResults: joi.number().min(1).max(20).default(5),
  minRelevance: joi.number().min(0).max(1).default(0.3)
});

// Search knowledge base (public - no auth required for agent use)
router.post('/search', async (req, res) => {
  try {
    const { error, value } = searchSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const knowledgeBase = getKnowledgeBase();
    const results = await knowledgeBase.searchKnowledge(value.query, {
      category: value.category,
      maxResults: value.maxResults,
      minRelevance: value.minRelevance
    });

    res.json({
      success: true,
      query: value.query,
      results: results.map(r => ({
        id: r.id,
        title: r.title,
        content: r.content,
        category: r.category,
        tags: r.tags,
        relevanceScore: r.relevanceScore
      }))
    });
  } catch (error) {
    logger.error('Failed to search knowledge base', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search knowledge base'
    });
  }
});

// Get all knowledge entries (admin only)
router.get('/',
  authenticateToken,
  functionLevelAuth('admin'),
  async (req, res) => {
    try {
      const { category, enabled } = req.query;
      const knowledgeBase = getKnowledgeBase();

      const options = {};
      if (category) {options.category = category;}
      if (enabled !== undefined) {options.enabled = enabled === 'true';}

      const entries = await knowledgeBase.getAllKnowledge(options);

      res.json({
        success: true,
        count: entries.length,
        entries
      });
    } catch (error) {
      logger.error('Failed to get knowledge entries', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve knowledge entries'
      });
    }
  });

// Get specific knowledge entry
router.get('/:id', async (req, res) => {
  try {
    const knowledgeBase = getKnowledgeBase();
    const entry = await knowledgeBase.getKnowledge(req.params.id);

    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Knowledge entry not found'
      });
    }

    res.json({
      success: true,
      entry
    });
  } catch (error) {
    logger.error('Failed to get knowledge entry', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve knowledge entry'
    });
  }
});

// Add new knowledge entry (admin only)
router.post('/',
  sensitiveOpLimiter,
  authenticateToken,
  functionLevelAuth('admin'),
  propertyLevelAuth(['title', 'content', 'tags', 'category', 'priority', 'searchTerms', 'enabled']),
  async (req, res) => {
    try {
      const { error, value } = addKnowledgeSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }

      const knowledgeBase = getKnowledgeBase();
      const id = await knowledgeBase.addKnowledge(value);

      res.status(201).json({
        success: true,
        id,
        message: 'Knowledge entry created successfully'
      });
    } catch (error) {
      logger.error('Failed to add knowledge entry', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create knowledge entry'
      });
    }
  });

// Update knowledge entry (admin only)
router.put('/:id',
  sensitiveOpLimiter,
  authenticateToken,
  functionLevelAuth('admin'),
  propertyLevelAuth(['title', 'content', 'tags', 'category', 'priority', 'searchTerms', 'enabled']),
  async (req, res) => {
    try {
      const { error, value } = updateKnowledgeSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }

      const knowledgeBase = getKnowledgeBase();
      await knowledgeBase.updateKnowledge(req.params.id, value);

      res.json({
        success: true,
        message: 'Knowledge entry updated successfully'
      });
    } catch (error) {
      logger.error('Failed to update knowledge entry', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update knowledge entry'
      });
    }
  });

// Delete knowledge entry (admin only)
router.delete('/:id',
  sensitiveOpLimiter,
  authenticateToken,
  functionLevelAuth('admin'),
  async (req, res) => {
    try {
      const knowledgeBase = getKnowledgeBase();
      await knowledgeBase.deleteKnowledge(req.params.id);

      res.json({
        success: true,
        message: 'Knowledge entry deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete knowledge entry', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete knowledge entry'
      });
    }
  });

// Get knowledge base statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const knowledgeBase = getKnowledgeBase();
    const stats = await knowledgeBase.getStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('Failed to get knowledge base stats', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve statistics'
    });
  }
});

// Get available categories
router.get('/meta/categories', async (req, res) => {
  try {
    const knowledgeBase = getKnowledgeBase();
    const categories = await knowledgeBase.getCategories();

    res.json({
      success: true,
      categories
    });
  } catch (error) {
    logger.error('Failed to get categories', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve categories'
    });
  }
});

// Bulk operations (admin only)
router.post('/bulk/import',
  sensitiveOpLimiter,
  authenticateToken,
  functionLevelAuth('admin'),
  async (req, res) => {
    try {
      const { entries } = req.body;

      if (!Array.isArray(entries)) {
        return res.status(400).json({
          success: false,
          error: 'Entries must be an array'
        });
      }

      const knowledgeBase = getKnowledgeBase();
      const results = [];

      for (const entry of entries) {
        try {
          const { error, value } = addKnowledgeSchema.validate(entry);
          if (error) {
            results.push({ success: false, error: error.details[0].message, entry });
            continue;
          }

          const id = await knowledgeBase.addKnowledge(value);
          results.push({ success: true, id, title: value.title });
        } catch (error) {
          results.push({ success: false, error: error.message, entry });
        }
      }

      const successCount = results.filter(r => r.success).length;

      res.json({
        success: true,
        message: `Imported ${successCount}/${entries.length} entries`,
        results
      });
    } catch (error) {
      logger.error('Failed to bulk import', error);
      res.status(500).json({
        success: false,
        error: 'Failed to import knowledge entries'
      });
    }
  });

module.exports = router;