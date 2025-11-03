const express = require('express');
const router = express.Router();
const joi = require('joi');
const { getPersonalityService } = require('../services/agentPersonality');
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
const updatePersonalitySchema = joi.object({
  identity: joi.object({
    name: joi.string(),
    role: joi.string(),
    organization: joi.string(),
    version: joi.string()
  }),
  traits: joi.object(),
  responses: joi.object({
    always_respond: joi.boolean(),
    min_response_delay: joi.number().min(0),
    max_response_delay: joi.number().min(0),
    include_personality: joi.boolean(),
    translate_personality: joi.boolean()
  }),
  tools: joi.object({
    suggest_proactively: joi.boolean(),
    explain_tools: joi.boolean(),
    auto_execute: joi.boolean(),
    show_available: joi.boolean()
  }),
  adaptive: joi.object({
    enabled: joi.boolean(),
    mirror_formality: joi.boolean(),
    adjust_technical: joi.boolean(),
    remember_preferences: joi.boolean(),
    context_window: joi.number().min(1).max(100)
  })
});

const updateTraitSchema = joi.object({
  path: joi.string().required(),
  value: joi.any().required()
});

const triggerSchema = joi.object({
  triggers: joi.array().items(joi.string()).required(),
  topics: joi.array().items(joi.string()).optional(),
  enabled: joi.boolean().optional()
});

// Get current personality
router.get('/personality', async (req, res) => {
  try {
    const personalityService = getPersonalityService();
    const personality = personalityService.getPersonality();

    res.json({
      success: true,
      personality
    });
  } catch (error) {
    logger.error('Failed to get personality', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve personality'
    });
  }
});

// Get specific personality traits
router.get('/personality/traits', async (req, res) => {
  try {
    const personalityService = getPersonalityService();
    const traits = personalityService.getTraits();

    res.json({
      success: true,
      traits
    });
  } catch (error) {
    logger.error('Failed to get traits', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve traits'
    });
  }
});

// Get a specific trait by path
router.get('/personality/trait/:path', async (req, res) => {
  try {
    // Validate path parameter
    if (!req.params.path || typeof req.params.path !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid trait path'
      });
    }

    const personalityService = getPersonalityService();
    const value = personalityService.getTrait(req.params.path);

    if (value === null || value === undefined) {
      return res.status(404).json({
        success: false,
        error: 'Trait not found'
      });
    }

    res.json({
      success: true,
      path: req.params.path,
      value
    });
  } catch (error) {
    logger.error('Failed to get trait', error);
    res.status(400).json({
      success: false,
      error: 'Failed to retrieve trait'
    });
  }
});

// Update entire personality (protected)
router.put('/personality',
  sensitiveOpLimiter,
  authenticateToken,
  functionLevelAuth('admin'),
  propertyLevelAuth(['identity', 'traits', 'responses', 'tools', 'adaptive']),
  async (req, res) => {
    try {
      const { error, value } = updatePersonalitySchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }

      const personalityService = getPersonalityService();
      const updated = await personalityService.updatePersonality(value);

      res.json({
        success: true,
        personality: updated
      });
    } catch (error) {
      logger.error('Failed to update personality', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update personality'
      });
    }
  });

// Update a specific trait (protected)
router.patch('/personality/trait',
  sensitiveOpLimiter,
  authenticateToken,
  functionLevelAuth('admin'),
  propertyLevelAuth(['path', 'value']),
  async (req, res) => {
    try {
      const { error, value } = updateTraitSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }

      const personalityService = getPersonalityService();
      const updated = await personalityService.setTrait(value.path, value.value);

      res.json({
        success: true,
        path: value.path,
        value: value.value,
        personality: updated
      });
    } catch (error) {
      logger.error('Failed to update trait', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update trait'
      });
    }
  });

// Reset to default personality (protected)
router.post('/personality/reset',
  sensitiveOpLimiter,
  authenticateToken,
  functionLevelAuth('admin'),
  async (req, res) => {
    try {
      const personalityService = getPersonalityService();
      const { DEFAULT_PERSONALITY } = require('../services/agentPersonality');

      const updated = await personalityService.updatePersonality(DEFAULT_PERSONALITY);

      res.json({
        success: true,
        message: 'Personality reset to defaults',
        personality: updated
      });
    } catch (error) {
      logger.error('Failed to reset personality', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reset personality'
      });
    }
  });

// Get personality profiles (presets)
router.get('/personality/profiles', async (req, res) => {
  try {
    const profiles = {
      business_professional: {
        description: 'Professional and task-focused for business environments',
        traits: {
          communication: { formality: 'professional', verbosity: 'balanced' },
          emotional: { warmth: 'friendly', humor: 'minimal' },
          behavioral: { proactivity: 'balanced', assertiveness: 'confident' },
          task: { focus: 'task_first', organization: 'structured' }
        }
      },
      creative_collaborator: {
        description: 'Creative and engaging for brainstorming and innovation',
        traits: {
          communication: { formality: 'casual', verbosity: 'detailed' },
          emotional: { enthusiasm: 'energetic', humor: 'playful' },
          cognitive: { thinking_style: 'intuitive', creativity: 'innovative' },
          behavioral: { proactivity: 'proactive', creativity: 'creative' }
        }
      },
      technical_expert: {
        description: 'Technical and analytical for development and problem-solving',
        traits: {
          communication: { technicality: 'technical', verbosity: 'detailed' },
          cognitive: { thinking_style: 'analytical', detail_orientation: 'detail_focused' },
          expertise: { confidence: 'authoritative', teaching_style: 'instructive' },
          task: { organization: 'methodical', focus: 'task_first' }
        }
      },
      supportive_coach: {
        description: 'Empathetic and patient for guidance and support',
        traits: {
          emotional: { empathy_level: 'high', warmth: 'warm' },
          interaction: { feedback_style: 'coaching', questioning: 'socratic' },
          expertise: { teaching_style: 'mentoring', confidence: 'modest' },
          behavioral: { patience: 'nurturing', assertiveness: 'gentle' }
        }
      }
    };

    res.json({
      success: true,
      profiles
    });
  } catch (error) {
    logger.error('Failed to get profiles', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve profiles'
    });
  }
});

// Apply a personality profile (protected)
router.post('/personality/profile/:profileName',
  sensitiveOpLimiter,
  authenticateToken,
  functionLevelAuth('admin'),
  async (req, res) => {
    try {
      const profiles = {
        business_professional: {
          traits: {
            communication: { formality: 'professional', verbosity: 'balanced' },
            emotional: { warmth: 'friendly', humor: 'minimal' },
            behavioral: { proactivity: 'balanced', assertiveness: 'confident' },
            task: { focus: 'task_first', organization: 'structured' }
          }
        },
        creative_collaborator: {
          traits: {
            communication: { formality: 'casual', verbosity: 'detailed' },
            emotional: { enthusiasm: 'energetic', humor: 'playful' },
            cognitive: { thinking_style: 'intuitive' },
            behavioral: { creativity: 'innovative' }
          }
        },
        technical_expert: {
          traits: {
            communication: { technicality: 'technical' },
            cognitive: { thinking_style: 'analytical' },
            expertise: { confidence: 'authoritative' }
          }
        },
        supportive_coach: {
          traits: {
            emotional: { empathy_level: 'high', warmth: 'warm' },
            interaction: { feedback_style: 'coaching' },
            behavioral: { patience: 'nurturing' }
          }
        }
      };

      const profile = profiles[req.params.profileName];
      if (!profile) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found'
        });
      }

      const personalityService = getPersonalityService();
      const updated = await personalityService.updatePersonality(profile);

      res.json({
        success: true,
        message: `Applied ${req.params.profileName} profile`,
        personality: updated
      });
    } catch (error) {
      logger.error('Failed to apply profile', error);
      res.status(500).json({
        success: false,
        error: 'Failed to apply profile'
      });
    }
  });

// Get user-specific personality adaptations
router.get('/personality/user/:userId', async (req, res) => {
  try {
    const personalityService = getPersonalityService();
    const preferences = await personalityService.getUserAdaptedPersonality(req.params.userId);

    res.json({
      success: true,
      userId: req.params.userId,
      preferences: preferences || {}
    });
  } catch (error) {
    logger.error('Failed to get user preferences', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user preferences'
    });
  }
});

// Save user-specific preferences (protected)
router.put('/personality/user/:userId',
  authenticateToken,
  objectLevelAuth,
  functionLevelAuth('admin'),
  async (req, res) => {
    try {
      const personalityService = getPersonalityService();
      await personalityService.saveUserPreference(req.params.userId, req.body);

      res.json({
        success: true,
        message: 'User preferences saved',
        userId: req.params.userId
      });
    } catch (error) {
      logger.error('Failed to save user preferences', error);
      res.status(500).json({
        success: false,
        error: 'Failed to save user preferences'
      });
    }
  });

// Configure response triggers (protected)
router.post('/triggers',
  sensitiveOpLimiter,
  authenticateToken,
  functionLevelAuth('admin'),
  propertyLevelAuth(['triggers', 'topics', 'enabled']),
  async (req, res) => {
    try {
      const { error, value } = triggerSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }

      // Save triggers to Firestore
      const { getFirestore, getFieldValue } = require('../config/firestore');
      const db = getFirestore();

      await db.collection('agent').doc('triggers').set({
        ...value,
        updated: getFieldValue().serverTimestamp()
      });

      res.json({
        success: true,
        message: 'Triggers configured',
        triggers: value
      });
    } catch (error) {
      logger.error('Failed to configure triggers', error);
      res.status(500).json({
        success: false,
        error: 'Failed to configure triggers'
      });
    }
  });

// Get current triggers
router.get('/triggers', async (req, res) => {
  try {
    const { getFirestore } = require('../config/firestore');
    const db = getFirestore();

    const doc = await db.collection('agent').doc('triggers').get();
    const triggers = doc.exists ? doc.data() : { triggers: [], topics: [], enabled: true };

    res.json({
      success: true,
      triggers
    });
  } catch (error) {
    logger.error('Failed to get triggers', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve triggers'
    });
  }
});

// Memory Dashboard - ReasoningBank monitoring and analytics
router.get('/memory/dashboard',
  authenticateToken,
  async (req, res) => {
    try {
      const config = require('../config/env');

      // Check if memory system is enabled
      if (!config.REASONING_MEMORY_ENABLED) {
        return res.json({
          success: true,
          enabled: false,
          message: 'ReasoningBank memory system is not enabled. Set REASONING_MEMORY_ENABLED=true to enable.',
          dashboard: null
        });
      }

      const { getReasoningMemoryModel } = require('../models/reasoningMemory');
      const memoryModel = getReasoningMemoryModel();
      await memoryModel.initialize();

      // Retrieve all memories for analysis (limit 1000)
      const memories = await memoryModel.getAllMemories(1000);

      if (memories.length === 0) {
        return res.json({
          success: true,
          enabled: true,
          message: 'No memories in the system yet. Memories will be created as tasks complete and repairs occur.',
          dashboard: {
            totalMemories: 0,
            sourceBreakdown: {},
            categoryBreakdown: {},
            performanceMetrics: {
              avgSuccessRate: null,
              totalRetrievals: 0,
              memoriesWithStats: 0,
              topPerformers: []
            },
            recentMemories: []
          }
        });
      }

      const dashboard = {
        totalMemories: memories.length,
        sourceBreakdown: {},
        categoryBreakdown: {},
        performanceMetrics: {
          avgSuccessRate: 0,
          totalRetrievals: 0,
          memoriesWithStats: 0,
          topPerformers: []
        },
        recentMemories: []
      };

      // Calculate breakdowns and metrics
      let totalSuccessRate = 0;
      let memoriesWithRate = 0;

      memories.forEach(m => {
        // Source breakdown
        dashboard.sourceBreakdown[m.source] = (dashboard.sourceBreakdown[m.source] || 0) + 1;

        // Category breakdown
        dashboard.categoryBreakdown[m.category] = (dashboard.categoryBreakdown[m.category] || 0) + 1;

        // Performance metrics
        dashboard.performanceMetrics.totalRetrievals += m.timesRetrieved || 0;

        if (m.successRate != null) {
          totalSuccessRate += m.successRate;
          memoriesWithRate++;
        }
      });

      // Calculate average success rate
      dashboard.performanceMetrics.memoriesWithStats = memoriesWithRate;
      if (memoriesWithRate > 0) {
        dashboard.performanceMetrics.avgSuccessRate =
          (totalSuccessRate / memoriesWithRate * 100).toFixed(1) + '%';
      } else {
        dashboard.performanceMetrics.avgSuccessRate = 'N/A';
      }

      // Top performers
      dashboard.performanceMetrics.topPerformers = memories
        .filter(m => m.successRate != null && m.timesRetrieved > 0)
        .sort((a, b) => {
          // Sort by success rate first, then by retrieval count
          if (b.successRate !== a.successRate) {
            return b.successRate - a.successRate;
          }
          return b.timesRetrieved - a.timesRetrieved;
        })
        .slice(0, 10)
        .map(m => ({
          id: m.id,
          title: m.title,
          category: m.category,
          source: m.source,
          successRate: (m.successRate * 100).toFixed(0) + '%',
          timesRetrieved: m.timesRetrieved,
          timesUsedInSuccess: m.timesUsedInSuccess || 0,
          timesUsedInFailure: m.timesUsedInFailure || 0
        }));

      // Recent memories (last 10)
      dashboard.recentMemories = memories.slice(0, 10).map(m => ({
        id: m.id,
        title: m.title,
        description: m.description,
        category: m.category,
        source: m.source,
        successRate: m.successRate ? (m.successRate * 100).toFixed(0) + '%' : 'N/A',
        timesRetrieved: m.timesRetrieved || 0,
        createdAt: m.createdAt?.toDate ? m.createdAt.toDate().toISOString() : m.createdAt
      }));

      logger.info('Memory dashboard retrieved', {
        totalMemories: dashboard.totalMemories,
        avgSuccessRate: dashboard.performanceMetrics.avgSuccessRate,
        totalRetrievals: dashboard.performanceMetrics.totalRetrievals
      });

      res.json({
        success: true,
        enabled: true,
        dashboard
      });

    } catch (error) {
      logger.error('Failed to get memory dashboard', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve memory dashboard'
      });
    }
  });

module.exports = router;