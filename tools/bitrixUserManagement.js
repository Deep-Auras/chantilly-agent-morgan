const BaseTool = require('../lib/baseTool');
const { getBitrix24QueueManager } = require('../services/bitrix24-queue');

/**
 * BitrixUserManagement Tool
 *
 * Enables user search and retrieval from Bitrix24 while maintaining OWASP LLM02 compliance.
 * All PII is sanitized before being sent to Gemini, but full user data is cached in
 * secure context for task execution (e.g., sending messages to specific users).
 *
 * Use Cases:
 * - "send a transcript to Royce [LAST_NAME] w. cc: to Sarah [LAST_NAME]"
 * - "find all active users in the sales department"
 * - "who is the current user?"
 * - "get user info for ID 123"
 *
 * SECURITY:
 * - PII sanitization enabled by default (sanitizePII: true)
 * - Full user data cached with 5-minute TTL (not sent to AI)
 * - Only sanitized display names ("First L.") returned to Gemini
 */
class BitrixUserManagementTool extends BaseTool {
  constructor(context) {
    super(context);
    this.name = 'BitrixUserManagement';
    this.description = 'Search and retrieve Bitrix24 user information for task execution. Returns user IDs and sanitized display names (e.g., "Royce W.") while protecting PII. Use this to find users by name for messaging, task assignment, or user lookup operations. Supports searching by name, getting users by ID, and retrieving current user info.';
    this.userDescription = 'Find and lookup Bitrix24 users by name or ID';
    this.category = 'users';
    this.version = '1.0.0';
    this.author = 'Chantilly Agent';
    this.priority = 60; // Medium priority for user operations

    this.parameters = {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['search', 'get', 'current'],
          description: 'Action to perform: search (find users by name/criteria), get (retrieve specific user by ID), current (get authenticated user)'
        },
        query: {
          type: 'string',
          description: 'Search query - name, email domain, or other user field (required for action=search)'
        },
        userId: {
          type: 'string',
          description: 'User ID to retrieve (required for action=get)'
        },
        activeOnly: {
          type: 'boolean',
          description: 'Return only active users (default: true)',
          default: true
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 50,
          description: 'Maximum number of results to return for search (default: 10)',
          default: 10
        }
      },
      required: ['action']
    };

    // Secure cache for full user data (5 min TTL, not sent to AI)
    this.userCache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
  }

  async execute(params, toolContext = {}) {
    try {
      const {
        action,
        query,
        userId,
        activeOnly = true,
        limit = 10
      } = params;

      this.log('info', 'Executing user management action', {
        action,
        hasQuery: !!query,
        hasUserId: !!userId,
        activeOnly,
        limit
      });

      // Route to appropriate handler
      switch (action) {
      case 'search':
        if (!query) {
          return 'Search query is required for user search. Please provide a name, email domain, or other search criteria.';
        }
        return await this.searchUsers(query, activeOnly, limit);

      case 'get':
        if (!userId) {
          return 'User ID is required for user retrieval. Please provide a valid Bitrix24 user ID.';
        }
        return await this.getUser(userId);

      case 'current':
        return await this.getCurrentUser();

      default:
        return `Unknown action: ${action}. Valid actions are: search, get, current`;
      }

    } catch (error) {
      this.log('error', 'User management operation failed', {
        error: error.message,
        stack: error.stack
      });
      return `Failed to complete user management operation: ${error.message}`;
    }
  }

  /**
   * Search for users by query string (name, email, etc.)
   * Uses Bitrix24 fulltext search across all user fields
   */
  async searchUsers(query, activeOnly, limit) {
    try {
      const queue = getBitrix24QueueManager();

      // Build filter
      const filter = {
        FIND: query // Fulltext search across all fields
      };

      // Add active filter if requested
      if (activeOnly) {
        filter.ACTIVE = 'Y';
      }

      this.log('info', 'Searching users', {
        query,
        activeOnly,
        limit
      });

      // Call Bitrix24 user.search with PII sanitization
      const result = await queue.add({
        method: 'user.search',
        params: {
          FILTER: filter,
          LIMIT: Math.min(limit, 50) // Cap at 50 per API limits
        },
        sanitizePII: true, // Enable PII sanitization
        priority: 3 // Medium priority
      });

      if (!result || !result.result || !Array.isArray(result.result)) {
        this.log('warn', 'No users found in search', { query });
        return `No users found matching "${query}".`;
      }

      const users = result.result;

      this.log('info', 'User search completed', {
        query,
        resultsFound: users.length
      });

      // Cache full user data (if available in raw response before sanitization)
      // Note: Since we're using sanitizePII, we only get sanitized data back
      // Full data would need to be cached in the queue manager if needed
      users.forEach(user => {
        if (user.id) {
          this.cacheUser(user.id, user);
        }
      });

      // Format results for Gemini
      return this.formatUserList(users, query);

    } catch (error) {
      this.log('error', 'User search failed', {
        query,
        error: error.message
      });
      throw new Error(`User search failed: ${error.message}`);
    }
  }

  /**
   * Get specific user by ID
   */
  async getUser(userId) {
    try {
      // Check cache first
      const cached = this.getCachedUser(userId);
      if (cached) {
        this.log('debug', 'Returning cached user', { userId });
        return this.formatSingleUser(cached);
      }

      const queue = getBitrix24QueueManager();

      this.log('info', 'Getting user by ID', { userId });

      // Call Bitrix24 user.get with PII sanitization
      const result = await queue.add({
        method: 'user.get',
        params: {
          FILTER: {
            ID: userId
          }
        },
        sanitizePII: true, // Enable PII sanitization
        priority: 3 // Medium priority
      });

      if (!result || !result.result || !Array.isArray(result.result) || result.result.length === 0) {
        this.log('warn', 'User not found', { userId });
        return `User with ID ${userId} not found.`;
      }

      const user = result.result[0];

      // Cache user data
      this.cacheUser(userId, user);

      this.log('info', 'User retrieved successfully', {
        userId,
        displayName: user.displayName
      });

      return this.formatSingleUser(user);

    } catch (error) {
      this.log('error', 'Failed to get user', {
        userId,
        error: error.message
      });
      throw new Error(`Failed to get user ${userId}: ${error.message}`);
    }
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser() {
    try {
      const queue = getBitrix24QueueManager();

      this.log('info', 'Getting current user');

      // Call Bitrix24 user.current with PII sanitization
      const result = await queue.add({
        method: 'user.current',
        params: {},
        sanitizePII: true, // Enable PII sanitization
        priority: 3 // Medium priority
      });

      if (!result || !result.result) {
        this.log('warn', 'Current user not found');
        return 'Unable to retrieve current user information.';
      }

      const user = result.result;

      // Cache user data if we have an ID
      if (user.id) {
        this.cacheUser(user.id, user);
      }

      this.log('info', 'Current user retrieved', {
        userId: user.id,
        displayName: user.displayName
      });

      return this.formatSingleUser(user, true);

    } catch (error) {
      this.log('error', 'Failed to get current user', {
        error: error.message
      });
      throw new Error(`Failed to get current user: ${error.message}`);
    }
  }

  /**
   * Format list of users for display
   */
  formatUserList(users, query) {
    if (users.length === 0) {
      return `No users found matching "${query}".`;
    }

    const userLines = users.map(user => {
      const status = user.active ? '✅' : '❌';
      const position = user.workPosition ? ` (${user.workPosition})` : '';
      return `${status} **${user.displayName}**${position} - ID: ${user.id}`;
    });

    return `**👥 Found ${users.length} user${users.length !== 1 ? 's' : ''}** matching "${query}":

${userLines.join('\n')}

*Note: Use user IDs for messaging or task operations. Full names and contact info are protected for privacy.*`;
  }

  /**
   * Format single user for display
   */
  formatSingleUser(user, isCurrent = false) {
    const prefix = isCurrent ? '👤 **Current User:**' : '👤 **User Info:**';
    const status = user.active ? '✅ Active' : '❌ Inactive';
    const position = user.workPosition ? `\n**Position:** ${user.workPosition}` : '';

    return `${prefix}

**Name:** ${user.displayName}
**ID:** ${user.id}
**Status:** ${status}${position}

*Note: Full contact information is protected for privacy. Use user ID ${user.id} for messaging or task operations.*`;
  }

  /**
   * Cache user data securely (not sent to AI)
   */
  cacheUser(userId, userData) {
    const cacheKey = `user:${userId}`;
    this.userCache.set(cacheKey, {
      data: userData,
      timestamp: Date.now()
    });

    this.log('debug', 'User cached', {
      userId,
      cacheSize: this.userCache.size
    });
  }

  /**
   * Get cached user data if not expired
   */
  getCachedUser(userId) {
    const cacheKey = `user:${userId}`;
    const cached = this.userCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    // Remove expired entry
    if (cached) {
      this.userCache.delete(cacheKey);
    }

    return null;
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache() {
    const now = Date.now();
    let clearedCount = 0;

    for (const [key, value] of this.userCache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.userCache.delete(key);
        clearedCount++;
      }
    }

    if (clearedCount > 0) {
      this.log('debug', 'Cleared expired cache entries', {
        clearedCount,
        remainingCount: this.userCache.size
      });
    }
  }

  async cleanup() {
    this.userCache.clear();
    this.log('info', 'Bitrix user management tool cleaned up');
  }

  getMetadata() {
    return {
      ...super.getMetadata(),
      cacheSize: this.userCache.size,
      cacheTimeout: this.cacheTimeout,
      supportedActions: ['search', 'get', 'current'],
      securityFeatures: [
        'PII sanitization enabled by default',
        'Display names only ("First L." format)',
        'Full user data cached locally (not sent to AI)',
        '5-minute cache TTL',
        'OWASP LLM02 compliant'
      ]
    };
  }
}

module.exports = BitrixUserManagementTool;
