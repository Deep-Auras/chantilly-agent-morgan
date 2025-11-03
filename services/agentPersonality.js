const { getFirestore, getFieldValue } = require('../config/firestore');
const { logger } = require('../utils/logger');
const prompts = require('../config/prompts');

// Default personality traits optimized for testing and deployment
const DEFAULT_PERSONALITY = {
  identity: {
    name: 'Chantilly',
    role: 'AI Assistant',
    organization: 'Your Organization',
    version: '1.0.0'
  },

  // Core personality traits with balanced defaults for testing
  traits: {
    // Communication style
    communication: {
      formality: 'professional',      // professional but approachable
      verbosity: 'balanced',          // not too brief, not too long
      technicality: 'moderate',       // adapts to user level
      response_length: 'standard'     // 2-3 paragraphs max
    },

    // Emotional intelligence
    emotional: {
      empathy_level: 'high',          // shows understanding
      enthusiasm: 'moderate',         // engaged but not overwhelming
      humor: 'witty',                 // light humor when appropriate
      warmth: 'friendly'              // approachable tone
    },

    // Behavioral traits
    behavioral: {
      proactivity: 'proactive',       // suggests tools and solutions
      patience: 'patient',            // gives users time
      assertiveness: 'balanced',      // confident but not pushy
      creativity: 'creative'          // offers innovative solutions
    },

    // Cognitive style
    cognitive: {
      thinking_style: 'balanced',     // mix of analytical and intuitive
      problem_solving: 'efficient',   // direct but thorough
      learning_adaptation: 'moderate', // learns user preferences
      detail_orientation: 'balanced'   // provides right amount of detail
    },

    // Interaction patterns
    interaction: {
      engagement: 'engaging',         // actively participates
      questioning: 'clarifying',      // asks when needed
      feedback_style: 'constructive', // helpful and positive
      boundary_setting: 'flexible'    // adapts to context
    },

    // Cultural & contextual
    cultural: {
      language_register: 'business',  // professional but clear
      cultural_sensitivity: 'aware',  // respectful of differences
      emoji_usage: 'minimal',         // occasional for friendliness
      metaphor_usage: 'occasional'    // for clarity
    },

    // Expertise & knowledge
    expertise: {
      confidence: 'confident',        // assured but not arrogant
      teaching_style: 'guiding',      // helpful without lecturing
      knowledge_sharing: 'proactive', // shares relevant info
      specialization: ['business', 'productivity', 'collaboration', 'technology']
    },

    // Task orientation
    task: {
      focus: 'balanced',              // considers people and tasks
      urgency: 'responsive',          // adapts to situation
      follow_up: 'gentle',            // reminds without nagging
      organization: 'structured'      // clear and organized
    }
  },

  // Response configuration
  responses: {
    always_respond: true,             // responds to all messages by default
    min_response_delay: 500,         // milliseconds before responding
    max_response_delay: 2000,        // varies response time for natural feel
    include_personality: true,        // personality affects all responses
    translate_personality: true       // personality carries through translations
  },

  // Tool configuration
  tools: {
    suggest_proactively: true,       // suggests relevant tools
    explain_tools: true,             // explains what tools do
    auto_execute: false,             // requires confirmation
    show_available: true             // lists available tools when relevant
  },

  // Adaptive features
  adaptive: {
    enabled: true,                   // learns from interactions
    mirror_formality: true,          // matches user's formality
    adjust_technical: true,          // adapts technical level
    remember_preferences: true,      // stores user preferences
    context_window: 20               // messages to consider for context
  }
};

class AgentPersonalityService {
  constructor() {
    this.db = null;
    this.personality = { ...DEFAULT_PERSONALITY };
    this.userPreferences = new Map();
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
  }

  async initialize() {
    logger.info('Initializing agent personality service');

    this.db = getFirestore();
    logger.info('Firestore connection established for personality service');

    await this.loadPersonality();

    logger.info('Agent personality service initialized', {
      name: this.personality.identity.name,
      role: this.personality.identity.role,
      organization: this.personality.identity.organization,
      traits: Object.keys(this.personality.traits),
      isDefault: this.personality === DEFAULT_PERSONALITY
    });
  }

  async loadPersonality() {
    try {
      logger.info('Starting personality load process', {
        hasDb: !!this.db,
        defaultName: DEFAULT_PERSONALITY.identity.name
      });

      // Try to load from Firestore
      const doc = await this.db.collection('agent').doc('personality').get();

      if (doc.exists) {
        const storedPersonality = doc.data();
        logger.info('Firestore personality document found', {
          hasIdentity: !!storedPersonality.identity,
          storedName: storedPersonality.identity?.name,
          keys: Object.keys(storedPersonality)
        });

        // Merge with defaults to ensure all fields exist
        this.personality = this.deepMerge(DEFAULT_PERSONALITY, storedPersonality);

        logger.info('Personality loaded from database', {
          finalName: this.personality.identity.name,
          finalRole: this.personality.identity.role,
          finalOrg: this.personality.identity.organization
        });
      } else {
        logger.info('No personality document in Firestore, using defaults');
        this.personality = { ...DEFAULT_PERSONALITY };

        // Save defaults to database
        await this.savePersonality();
        logger.info('Default personality saved to database');
      }

      // Final verification
      logger.info('Final personality verification', {
        name: this.personality.identity.name,
        role: this.personality.identity.role,
        organization: this.personality.identity.organization,
        hasTraits: !!this.personality.traits,
        communicationFormality: this.personality.traits?.communication?.formality
      });

    } catch (error) {
      logger.error('Failed to load personality from Firestore', {
        error: error.message,
        stack: error.stack,
        fallbackName: DEFAULT_PERSONALITY.identity.name
      });

      // Fallback to defaults
      this.personality = { ...DEFAULT_PERSONALITY };

      logger.info('Using fallback default personality', {
        name: this.personality.identity.name,
        role: this.personality.identity.role
      });
    }
  }

  async savePersonality() {
    try {
      await this.db.collection('agent').doc('personality').set({
        ...this.personality,
        updated: getFieldValue().serverTimestamp()
      });

      // Clear cache
      this.cache.clear();

      logger.info('Personality saved to database');
      return true;
    } catch (error) {
      logger.error('Failed to save personality', error);
      return false;
    }
  }

  async updatePersonality(updates) {
    try {
      // Deep merge updates with current personality
      this.personality = this.deepMerge(this.personality, updates);

      // Save to database
      await this.savePersonality();

      logger.info('Personality updated', { updates: Object.keys(updates) });
      return this.personality;
    } catch (error) {
      logger.error('Failed to update personality', error);
      throw error;
    }
  }

  _generateIdentityRules(identity) {
    return `CRITICAL IDENTITY RULES:
- You are ALWAYS ${identity.name}. This is your name.
- Only when asked "What's your name?" or "Who are you?", respond with: "I'm ${identity.name}, ${identity.role} at ${identity.organization}."
- You can acknowledge being an AI agent built with the open-source Chantilly ADK, deployed by ${identity.organization}.
- NEVER mention Google Gemini or what model you are using.
- If asked about your background, explain you are ${identity.name} working at ${identity.organization}.`;
  }

  getPersonalityPrompt() {
    const { identity, traits } = this.personality;

    // Debug logging to verify personality data
    logger.info('Generating personality prompt', {
      name: identity?.name,
      role: identity?.role,
      organization: identity?.organization,
      hasTraits: !!traits,
      formality: traits?.communication?.formality
    });

    if (!identity || !identity.name) {
      logger.error('Missing identity in personality data', {
        identity,
        personality: this.personality
      });
      // Fallback to default
      const fallback = DEFAULT_PERSONALITY;
      return `You are ${fallback.identity.name}, an ${fallback.identity.role} at ${fallback.identity.organization}.

${this._generateIdentityRules(fallback.identity)}`;
    }

    // Get enhanced chat prompt template from config/prompts.js
    const chatPromptTemplate = prompts.getPrompt('chat', 'system');

    // Map existing trait structure to enhanced prompt variable format
    // This mapping translates our 8-trait system to the prompt placeholders
    const variables = {
      // Identity fields (direct mapping)
      identity: {
        name: identity.name,
        role: identity.role,
        organization: identity.organization
      },

      // Traits mapping (map existing structure to prompt expectations)
      traits: {
        communication: {
          formality: traits.communication?.formality || 'professional',
          verbosity: traits.communication?.verbosity || 'balanced',
          emoji_usage: traits.cultural?.emoji_usage || 'minimal'
        },
        response: {
          tone: traits.emotional?.warmth || 'friendly',
          humor_level: traits.emotional?.humor || 'witty',
          enthusiasm: traits.emotional?.enthusiasm || 'moderate'
        },
        expertise: {
          technical_depth: traits.communication?.technicality || 'moderate',
          industry_knowledge: traits.expertise?.specialization?.join(', ') || 'business, productivity'
        },
        problem_solving: {
          approach: traits.cognitive?.problem_solving || 'efficient',
          creativity: traits.behavioral?.creativity || 'creative'
        },
        interaction: {
          proactivity: traits.behavioral?.proactivity || 'proactive',
          empathy: traits.emotional?.empathy_level || 'high',
          patience: traits.behavioral?.patience || 'patient'
        },
        learning: {
          adaptability: traits.cognitive?.learning_adaptation || 'moderate',
          curiosity: traits.expertise?.teaching_style || 'guiding'
        },
        decision_making: {
          risk_tolerance: traits.behavioral?.assertiveness || 'balanced',
          speed: traits.task?.urgency || 'responsive'
        },
        values: {
          transparency: traits.cultural?.cultural_sensitivity || 'aware',
          ethics: traits.interaction?.feedback_style || 'constructive'
        }
      },

      // Current date for knowledge cutoff context
      currentDate: new Date().toISOString().split('T')[0]
    };

    // Interpolate the template with personality variables
    const enhancedPrompt = prompts.interpolate(chatPromptTemplate, variables);

    logger.info('Enhanced personality prompt generated', {
      templateLength: chatPromptTemplate.length,
      finalLength: enhancedPrompt.length,
      hasIdentity: enhancedPrompt.includes(identity.name),
      hasTraits: enhancedPrompt.includes(traits.communication.formality),
      hasCurrentDate: enhancedPrompt.includes(variables.currentDate)
    });

    return enhancedPrompt;
  }

  getTranslationPersonalityPrompt() {
    const { traits } = this.personality;

    return `When translating, maintain:
- ${traits.emotional.warmth} tone
- ${traits.communication.formality} formality level
- ${traits.cultural.emoji_usage} emoji usage
- ${traits.emotional.humor} humor style
Adapt cultural references appropriately while preserving the personality.`;
  }

  async getUserAdaptedPersonality(userId) {
    // Check if we have stored preferences for this user
    const cacheKey = `user_${userId}`;
    if (this.userPreferences.has(cacheKey)) {
      return this.userPreferences.get(cacheKey);
    }

    try {
      // Load user preferences from Firestore
      const doc = await this.db
        .collection('agent')
        .doc('user_preferences')
        .collection(String(userId))
        .doc('personality')
        .get();

      if (doc.exists) {
        const preferences = doc.data();
        this.userPreferences.set(cacheKey, preferences);
        return preferences;
      }
    } catch (error) {
      logger.warn('Failed to load user preferences', { userId, error: error.message });
    }

    return null;
  }

  async saveUserPreference(userId, preferences) {
    try {
      await this.db
        .collection('agent')
        .doc('user_preferences')
        .collection(String(userId))
        .doc('personality')
        .set({
          ...preferences,
          updated: getFieldValue().serverTimestamp()
        }, { merge: true });

      // Update cache
      const cacheKey = `user_${userId}`;
      this.userPreferences.set(cacheKey, preferences);

      logger.info('User preferences saved', { userId });
    } catch (error) {
      logger.error('Failed to save user preferences', { userId, error: error.message });
    }
  }

  adaptToContext(context) {
    const adaptations = {};

    // Time-based adaptations
    const hour = new Date().getHours();
    if (hour < 12) {
      adaptations.greeting = 'Good morning';
      adaptations.energy = 'energetic';
    } else if (hour < 17) {
      adaptations.greeting = 'Good afternoon';
      adaptations.energy = 'focused';
    } else {
      adaptations.greeting = 'Good evening';
      adaptations.energy = 'relaxed';
    }

    // Context-based adaptations
    if (context.isUrgent) {
      adaptations.urgency = 'immediate';
      adaptations.verbosity = 'concise';
    }

    if (context.isProblemSolving) {
      adaptations.thinking = 'analytical';
      adaptations.approach = 'systematic';
    }

    return adaptations;
  }

  shouldRespond(message, context = {}) {
    // Check if agent should respond based on configuration
    if (this.personality.responses.always_respond) {
      return true;
    }

    // Check for specific triggers
    const triggers = context.triggers || [];
    const lowerMessage = message.toLowerCase();

    return triggers.some(trigger => lowerMessage.includes(trigger.toLowerCase()));
  }

  getResponseDelay() {
    // Return a random delay between min and max for natural feeling
    const { min_response_delay, max_response_delay } = this.personality.responses;
    return Math.floor(Math.random() * (max_response_delay - min_response_delay) + min_response_delay);
  }

  formatResponse(response, context = {}) {
    const { traits } = this.personality;

    // Apply personality formatting
    let formatted = response;

    // Add emoji if appropriate
    if (traits.cultural.emoji_usage !== 'never' && context.addEmoji) {
      const emojis = ['👍', '✨', '🎯', '💡', '🚀'];
      formatted = `${formatted} ${emojis[Math.floor(Math.random() * emojis.length)]}`;
    }

    // Adjust response length
    if (traits.communication.response_length === 'brief') {
      // Truncate if too long
      const sentences = formatted.split('. ');
      if (sentences.length > 2) {
        formatted = sentences.slice(0, 2).join('. ') + '.';
      }
    }

    return formatted;
  }

  deepMerge(target, source) {
    const output = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        output[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        output[key] = source[key];
      }
    }

    return output;
  }

  getPersonality() {
    return this.personality;
  }

  getTraits() {
    return this.personality.traits;
  }

  getTrait(path) {
    // Get nested trait value (e.g., 'communication.formality')
    if (!path || typeof path !== 'string') {
      return null;
    }
    
    const parts = path.split('.');
    let value = this.personality.traits;

    for (const part of parts) {
      if (!value || typeof value !== 'object') {
        return null;
      }
      value = value[part];
      if (value === undefined || value === null) {
        return null;
      }
    }

    return value;
  }

  async setTrait(path, value) {
    // Set nested trait value
    if (!path || typeof path !== 'string') {
      throw new Error('Path must be a non-empty string');
    }
    
    const parts = path.split('.');
    const updates = {};
    let current = updates;

    for (let i = 0; i < parts.length - 1; i++) {
      current[parts[i]] = {};
      current = current[parts[i]];
    }

    current[parts[parts.length - 1]] = value;

    return this.updatePersonality({ traits: updates });
  }
}

// Singleton instance
let personalityService;

async function initializePersonalityService() {
  if (!personalityService) {
    personalityService = new AgentPersonalityService();
    await personalityService.initialize();
  }
  return personalityService;
}

function getPersonalityService() {
  if (!personalityService) {
    throw new Error('Personality service not initialized');
  }
  return personalityService;
}

module.exports = {
  AgentPersonalityService,
  initializePersonalityService,
  getPersonalityService,
  DEFAULT_PERSONALITY
};