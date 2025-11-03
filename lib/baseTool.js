const { logger } = require('../utils/logger');
const { getFirestore } = require('../config/firestore');
const { getQueueManager } = require('../services/bitrix24-queue');

class BaseTool {
  constructor(context = {}) {
    // Required properties
    this.name = this.constructor.name;
    this.description = 'Base tool class';
    this.parameters = {}; // JSON schema for parameters
    this.timeout = 30000; // 30 seconds timeout

    // Context objects
    this.firestore = context.firestore || null;
    this.queue = context.queue || null;
    this.logger = context.logger || logger;

    // Metadata
    this.version = '1.0.0';
    this.author = 'Unknown';
    this.category = 'general';
    this.enabled = true;
    this.priority = 50; // Default priority (0-100, higher = more important)
  }

  // Abstract method - must be implemented by subclasses
  async execute(params, toolContext = {}) {
    throw new Error(`Execute method not implemented for tool: ${this.name}`);
  }

  // Optional method - implement if tool should auto-trigger based on message content
  async shouldTrigger(message) {
    return false;
  }

  // Validation method for parameters
  validateParameters(params) {
    if (!this.parameters || Object.keys(this.parameters).length === 0) {
      return { valid: true, params };
    }

    // Basic validation - could be enhanced with joi in the future
    const required = this.parameters.required || [];
    const properties = this.parameters.properties || {};

    for (const field of required) {
      if (!(field in params)) {
        return {
          valid: false,
          error: `Missing required parameter: ${field}`
        };
      }
    }

    // Type validation
    for (const [field, value] of Object.entries(params)) {
      if (properties[field]) {
        const expectedType = properties[field].type;
        const actualType = typeof value;

        if (expectedType && expectedType !== actualType) {
          return {
            valid: false,
            error: `Parameter ${field} expected ${expectedType}, got ${actualType}`
          };
        }
      }
    }

    return { valid: true, params };
  }

  // Helper method to interact with Bitrix24 API
  async callBitrix24(method, params) {
    if (!this.queue) {
      this.queue = getQueueManager();
    }

    return this.queue.add({
      method,
      params,
      toolName: this.name
    });
  }

  // Helper method to save data to Firestore
  async saveToFirestore(collection, docId, data) {
    if (!this.firestore) {
      this.firestore = getFirestore();
    }

    return this.firestore.collection(collection).doc(docId).set(data);
  }

  // Helper method to read data from Firestore
  async readFromFirestore(collection, docId) {
    if (!this.firestore) {
      this.firestore = getFirestore();
    }

    const doc = await this.firestore.collection(collection).doc(docId).get();
    return doc.exists ? doc.data() : null;
  }

  // Helper method for logging with tool context
  log(level, message, meta = {}) {
    this.logger[level](message, {
      tool: this.name,
      ...meta
    });
  }

  // Get tool metadata
  getMetadata() {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
      version: this.version,
      author: this.author,
      category: this.category,
      enabled: this.enabled,
      timeout: this.timeout,
      priority: this.priority
    };
  }

  // Enable/disable tool
  setEnabled(enabled) {
    this.enabled = enabled;
    this.log('info', `Tool ${enabled ? 'enabled' : 'disabled'}`);
  }

  // Tool lifecycle methods
  async initialize() {
    // Override in subclasses if needed
    this.log('info', 'Tool initialized');
  }

  async cleanup() {
    // Override in subclasses if needed
    this.log('info', 'Tool cleaned up');
  }

  // Error handling wrapper
  async safeExecute(params, messageData) {
    const startTime = Date.now();

    try {
      // Validate tool is enabled
      if (!this.enabled) {
        throw new Error(`Tool ${this.name} is disabled`);
      }

      // Validate parameters
      const validation = this.validateParameters(params);
      if (!validation.valid) {
        throw new Error(`Parameter validation failed: ${validation.error}`);
      }

      // Set timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Tool execution timeout')), this.timeout);
      });

      // Execute with timeout
      const result = await Promise.race([
        this.execute(validation.params, messageData),
        timeoutPromise
      ]);

      const duration = Date.now() - startTime;
      this.log('info', 'Tool executed successfully', {
        duration,
        hasResult: !!result
      });

      return {
        success: true,
        result,
        duration,
        tool: this.name
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log('error', 'Tool execution failed', {
        error: error.message,
        duration
      });

      return {
        success: false,
        error: error.message,
        duration,
        tool: this.name
      };
    }
  }
}

module.exports = BaseTool;