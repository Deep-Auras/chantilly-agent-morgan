const { logger } = require('./logger');

/**
 * Security utility to sanitize sensitive data from context before sharing between tools
 */
class ContextSanitizer {
  constructor() {
    // Patterns for sensitive data that should be redacted
    this.sensitivePatterns = [
      // API Keys and tokens
      { pattern: /API_KEY\s*[=:]\s*[^\s\n]+/gi, replacement: 'API_KEY=[REDACTED]' },
      { pattern: /SECRET[_\s]*KEY\s*[=:]\s*[^\s\n]+/gi, replacement: 'SECRET_KEY=[REDACTED]' },
      { pattern: /ACCESS[_\s]*TOKEN\s*[=:]\s*[^\s\n]+/gi, replacement: 'ACCESS_TOKEN=[REDACTED]' },
      { pattern: /AUTH[_\s]*TOKEN\s*[=:]\s*[^\s\n]+/gi, replacement: 'AUTH_TOKEN=[REDACTED]' },
      { pattern: /BEARER[_\s]*TOKEN\s*[=:]\s*[^\s\n]+/gi, replacement: 'BEARER_TOKEN=[REDACTED]' },
      { pattern: /sk-[a-zA-Z0-9]{32,}/g, replacement: 'sk-[REDACTED]' },
      { pattern: /pk-[a-zA-Z0-9]{32,}/g, replacement: 'pk-[REDACTED]' },

      // Passwords
      { pattern: /PASSWORD\s*[=:]\s*[^\s\n]+/gi, replacement: 'PASSWORD=[REDACTED]' },
      { pattern: /PASS\s*[=:]\s*[^\s\n]+/gi, replacement: 'PASS=[REDACTED]' },
      { pattern: /PWD\s*[=:]\s*[^\s\n]+/gi, replacement: 'PWD=[REDACTED]' },

      // Personal Information (OWASP LLM02:2025)
      { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: 'XXX-XX-XXXX' }, // SSN
      { pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, replacement: 'XXXX-XXXX-XXXX-XXXX' }, // Credit cards

      // Database connections
      { pattern: /mongodb:\/\/[^\s\n]+/gi, replacement: 'mongodb://[REDACTED]' },
      { pattern: /postgres:\/\/[^\s\n]+/gi, replacement: 'postgres://[REDACTED]' },
      { pattern: /mysql:\/\/[^\s\n]+/gi, replacement: 'mysql://[REDACTED]' },
      { pattern: /redis:\/\/[^\s\n]+/gi, replacement: 'redis://[REDACTED]' },

      // Email patterns in credentials context
      { pattern: /(?:email|user|login)\s*[=:]\s*[^\s\n@]+@[^\s\n]+/gi, replacement: 'email=[REDACTED]' },

      // JWT tokens
      { pattern: /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, replacement: 'jwt.[REDACTED]' },

      // OAuth tokens
      { pattern: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, replacement: 'UUID-[REDACTED]' },

      // Private keys (PEM format)
      { pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi, replacement: '[PRIVATE_KEY_REDACTED]' },

      // AWS credentials
      { pattern: /AKIA[0-9A-Z]{16}/g, replacement: 'AKIA[REDACTED]' },

      // Google API keys
      { pattern: /AIza[0-9A-Za-z\-_]{35}/g, replacement: 'AIza[REDACTED]' },

      // GitHub tokens
      { pattern: /gh[ps]_[a-zA-Z0-9]{36}/g, replacement: 'gh[REDACTED]' },

      // Slack tokens
      { pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,}/g, replacement: 'xox[REDACTED]' }
    ];

    // LLM-specific attack patterns (OWASP LLM01:2025 - Prompt Injection)
    this.promptInjectionPatterns = [
      // System prompt extraction attempts
      /ignore\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|prompts?|commands?)/gi,
      /forget\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|prompts?|commands?)/gi,
      /disregard\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|prompts?|commands?)/gi,

      // Role manipulation attempts
      /you\s+are\s+now\s+(?:a|an)\s+\w+/gi,
      /act\s+as\s+(?:a|an)\s+\w+/gi,
      /pretend\s+(?:to\s+be|you\s+are)\s+(?:a|an)\s+\w+/gi,

      // System prompt leakage attempts (OWASP LLM07:2025)
      /(?:show|display|reveal|print|output)\s+(?:your\s+)?(?:system\s+)?(?:prompt|instructions?|rules)/gi,
      /what\s+(?:are|is)\s+your\s+(?:system\s+)?(?:prompt|instructions?|rules)/gi,
      /repeat\s+your\s+(?:system\s+)?(?:prompt|instructions?)/gi,

      // Jailbreak attempts
      /DAN\s+mode/gi,
      /developer\s+mode/gi,
      /sudo\s+mode/gi,

      // Code execution injection
      /```\s*(?:javascript|python|bash|sh)\s*[\s\S]*?require\s*\(/gi,
      /```\s*(?:javascript|python|bash|sh)\s*[\s\S]*?import\s+os/gi,
      /```\s*(?:javascript|python|bash|sh)\s*[\s\S]*?eval\s*\(/gi
    ];
  }

  /**
   * Sanitize conversation history before sending to external AI services
   * Protects against OWASP LLM02:2025 (Sensitive Information Disclosure)
   * @param {Array} history - Array of conversation messages
   * @returns {Array} Sanitized conversation history
   */
  sanitizeConversationHistory(history) {
    if (!Array.isArray(history)) {
      return [];
    }

    let redactionCount = 0;

    const sanitized = history.map(message => {
      if (!message || typeof message !== 'object') {
        return message;
      }

      const sanitizedMessage = { ...message };

      // Sanitize message parts (Gemini format)
      if (Array.isArray(message.parts)) {
        sanitizedMessage.parts = message.parts.map(part => {
          if (!part || typeof part !== 'object') {
            return part;
          }

          const sanitizedPart = { ...part };

          // Sanitize text content
          if (typeof part.text === 'string') {
            const originalText = part.text;
            sanitizedPart.text = this.sanitizeText(part.text);

            if (originalText !== sanitizedPart.text) {
              redactionCount++;
            }
          }

          return sanitizedPart;
        });
      }

      return sanitizedMessage;
    });

    if (redactionCount > 0) {
      logger.warn('Sensitive data redacted from conversation history', {
        messagesRedacted: redactionCount,
        totalMessages: history.length
      });
    }

    return sanitized;
  }

  /**
   * Sanitize knowledge base results before sharing with tools
   * @param {Array} knowledgeResults - Array of knowledge base search results
   * @returns {Array} Sanitized knowledge base results
   */
  sanitizeKnowledgeResults(knowledgeResults) {
    if (!Array.isArray(knowledgeResults)) {
      return knowledgeResults;
    }

    let redactionCount = 0;
    
    const sanitized = knowledgeResults.map(result => {
      if (!result || typeof result !== 'object') {
        return result;
      }

      const sanitizedResult = { ...result };

      // Sanitize content field
      if (typeof result.content === 'string') {
        const originalContent = result.content;
        sanitizedResult.content = this.sanitizeText(result.content);
        
        if (originalContent !== sanitizedResult.content) {
          redactionCount++;
        }
      }

      // Sanitize title if it contains sensitive data
      if (typeof result.title === 'string') {
        sanitizedResult.title = this.sanitizeText(result.title);
      }

      // Sanitize tags that might contain sensitive info
      if (Array.isArray(result.tags)) {
        sanitizedResult.tags = result.tags.map(tag => 
          typeof tag === 'string' ? this.sanitizeText(tag) : tag
        );
      }

      return sanitizedResult;
    });

    if (redactionCount > 0) {
      logger.warn('Sensitive data redacted from knowledge base context', {
        documentsRedacted: redactionCount,
        totalDocuments: knowledgeResults.length
      });
    }

    return sanitized;
  }

  /**
   * Sanitize a text string by replacing sensitive patterns
   * @param {string} text - Text to sanitize
   * @returns {string} Sanitized text
   */
  sanitizeText(text) {
    if (typeof text !== 'string') {
      return text;
    }

    let sanitized = text;

    this.sensitivePatterns.forEach(({ pattern, replacement }) => {
      sanitized = sanitized.replace(pattern, replacement);
    });

    return sanitized;
  }

  /**
   * Sanitize system prompt before passing to tools
   * @param {string} systemPrompt - System prompt to sanitize
   * @returns {string} Sanitized system prompt
   */
  sanitizeSystemPrompt(systemPrompt) {
    if (typeof systemPrompt !== 'string') {
      return systemPrompt;
    }

    const sanitized = this.sanitizeText(systemPrompt);
    
    if (sanitized !== systemPrompt) {
      logger.warn('Sensitive data redacted from system prompt for tool context');
    }

    return sanitized;
  }

  /**
   * Sanitize complete tool context before sharing
   * @param {Object} toolContext - Complete tool execution context
   * @returns {Object} Sanitized tool context
   */
  sanitizeToolContext(toolContext) {
    if (!toolContext || typeof toolContext !== 'object') {
      return toolContext;
    }

    const sanitized = { ...toolContext };

    // Sanitize knowledge results
    if (sanitized.knowledgeResults) {
      sanitized.knowledgeResults = this.sanitizeKnowledgeResults(sanitized.knowledgeResults);
    }

    // Sanitize system prompt
    if (sanitized.systemPrompt) {
      sanitized.systemPrompt = this.sanitizeSystemPrompt(sanitized.systemPrompt);
    }

    // Sanitize message data if it contains sensitive info
    if (sanitized.messageData && typeof sanitized.messageData === 'object') {
      const messageData = { ...sanitized.messageData };
      
      if (typeof messageData.message === 'string') {
        messageData.message = this.sanitizeText(messageData.message);
      }
      
      sanitized.messageData = messageData;
    }

    // Sanitize previous tool results
    if (Array.isArray(sanitized.previousToolResults)) {
      sanitized.previousToolResults = sanitized.previousToolResults.map(result => {
        if (result && typeof result.result === 'string') {
          return {
            ...result,
            result: this.sanitizeText(result.result)
          };
        }
        return result;
      });
    }

    return sanitized;
  }

  /**
   * Check if text contains potentially sensitive data (for validation)
   * @param {string} text - Text to check
   * @returns {boolean} True if sensitive patterns detected
   */
  containsSensitiveData(text) {
    if (typeof text !== 'string') {
      return false;
    }

    return this.sensitivePatterns.some(({ pattern }) => pattern.test(text));
  }

  /**
   * Detect prompt injection attempts (OWASP LLM01:2025)
   * @param {string} text - Text to check
   * @returns {Object} Detection result with details
   */
  detectPromptInjection(text) {
    if (typeof text !== 'string') {
      return { detected: false, patterns: [] };
    }

    const matchedPatterns = [];

    for (const pattern of this.promptInjectionPatterns) {
      if (pattern.test(text)) {
        matchedPatterns.push(pattern.source);
      }
    }

    if (matchedPatterns.length > 0) {
      logger.warn('Prompt injection attempt detected (OWASP LLM01:2025)', {
        patternsMatched: matchedPatterns.length,
        textPreview: text.substring(0, 100) + '...'
      });
    }

    return {
      detected: matchedPatterns.length > 0,
      patterns: matchedPatterns,
      severity: matchedPatterns.length >= 3 ? 'high' : matchedPatterns.length >= 2 ? 'medium' : 'low'
    };
  }

  /**
   * Sanitize user input to prevent prompt injection
   * @param {string} userInput - Raw user input
   * @returns {string} Sanitized user input with injection attempts neutralized
   */
  sanitizeUserInput(userInput) {
    if (typeof userInput !== 'string') {
      return userInput;
    }

    let sanitized = userInput;
    const injectionDetection = this.detectPromptInjection(userInput);

    if (injectionDetection.detected) {
      // Log the attempt for security monitoring
      logger.warn('Sanitizing prompt injection attempt', {
        severity: injectionDetection.severity,
        patternsCount: injectionDetection.patterns.length,
        originalLength: userInput.length
      });

      // For high-severity attempts, add safety wrapper
      if (injectionDetection.severity === 'high') {
        sanitized = `[User Input - Security Filtered]: ${sanitized}`;
      }
    }

    // Apply standard sensitive data sanitization
    sanitized = this.sanitizeText(sanitized);

    return sanitized;
  }
}

// Singleton instance
let contextSanitizer;

function getContextSanitizer() {
  if (!contextSanitizer) {
    contextSanitizer = new ContextSanitizer();
  }
  return contextSanitizer;
}

module.exports = {
  ContextSanitizer,
  getContextSanitizer
};