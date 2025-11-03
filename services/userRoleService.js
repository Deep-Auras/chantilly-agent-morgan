const { getFirestore, getFieldValue } = require('../config/firestore');
const { logger } = require('../utils/logger');

/**
 * UserRoleService
 *
 * Purpose: Manages user role retrieval and caching for RBAC (Role-Based Access Control).
 * Maps Bitrix24 user IDs to internal user roles with in-memory caching to minimize Firestore reads.
 *
 * Features:
 * - Role retrieval from bitrix_users collection
 * - In-memory caching with configurable TTL (5 minutes default)
 * - Automatic cache invalidation on role updates
 * - Fail-safe defaults (unknown users → 'user' role)
 * - LRU cache eviction (max 1000 entries)
 * - Cache statistics and monitoring
 *
 * Dependencies:
 * - Firestore (bitrix_users collection)
 * - Logger (utils/logger)
 *
 * Security:
 * - OWASP LLM06 (Excessive Agency): Enforces least privilege with default 'user' role
 * - Cache prevents DoS via excessive Firestore reads
 * - Role changes immediately invalidate cache
 */
class UserRoleService {
  constructor() {
    // Firestore reference
    this.db = null;

    // In-memory cache: Map<bitrixUserId, { role, timestamp }>
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes TTL
    this.maxCacheSize = 1000; // Maximum cache entries (LRU eviction)

    // Performance metrics
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      firestoreReads: 0,
      unknownUsers: 0,
      lastClearTime: Date.now()
    };

    logger.info('UserRoleService constructor initialized');
  }

  /**
   * Initialize the service
   * Sets up Firestore connection
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      this.db = getFirestore();

      logger.info('UserRoleService initialized successfully', {
        cacheTimeout: `${this.cacheTimeout / 1000}s`,
        maxCacheSize: this.maxCacheSize
      });
    } catch (error) {
      logger.error('UserRoleService initialization failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get user role from cache or Firestore
   * Returns 'user' role for unknown users (fail-safe)
   *
   * @param {string} bitrixUserId - Bitrix24 user ID (FROM_USER_ID)
   * @returns {Promise<string>} - User role ('admin' or 'user')
   */
  async getUserRole(bitrixUserId) {
    try {
      // Validate input
      if (!bitrixUserId) {
        logger.warn('getUserRole called with empty bitrixUserId, defaulting to user role');
        return 'user';
      }

      const bitrixUserIdStr = String(bitrixUserId);

      // Check cache first
      const cached = this.cache.get(bitrixUserIdStr);
      const now = Date.now();

      if (cached && (now - cached.timestamp) < this.cacheTimeout) {
        this.metrics.cacheHits++;
        logger.debug('User role retrieved from cache', {
          bitrixUserId: bitrixUserIdStr,
          role: cached.role,
          cacheAge: `${((now - cached.timestamp) / 1000).toFixed(1)}s`
        });
        return cached.role;
      }

      // Cache miss - fetch from Firestore
      this.metrics.cacheMisses++;
      this.metrics.firestoreReads++;

      const doc = await this.db
        .collection('bitrix_users')
        .doc(bitrixUserIdStr)
        .get();

      if (!doc.exists) {
        this.metrics.unknownUsers++;
        logger.warn('Unknown Bitrix user accessing system (defaulting to user role)', {
          bitrixUserId: bitrixUserIdStr,
          recommendation: 'Create mapping with: node scripts/createBitrixUserMapping.js'
        });
        return 'user'; // Fail-safe: unknown users get minimal privileges
      }

      const userData = doc.data();
      const role = userData.role || 'user';

      // Update cache with LRU eviction
      this.setCacheEntry(bitrixUserIdStr, role);

      // Update lastSeen timestamp in Firestore (non-blocking)
      this.updateLastSeen(bitrixUserIdStr).catch(err => {
        logger.error('Failed to update lastSeen timestamp', {
          bitrixUserId: bitrixUserIdStr,
          error: err.message
        });
      });

      logger.info('User role retrieved from Firestore', {
        bitrixUserId: bitrixUserIdStr,
        role,
        internalUserId: userData.internalUserId
      });

      return role;

    } catch (error) {
      logger.error('getUserRole failed, defaulting to user role', {
        bitrixUserId,
        error: error.message,
        stack: error.stack
      });
      // Fail-safe: return 'user' role on errors
      return 'user';
    }
  }

  /**
   * Set cache entry with LRU eviction
   * If cache is full, evict oldest entry
   *
   * @param {string} bitrixUserId - Bitrix user ID
   * @param {string} role - User role
   */
  setCacheEntry(bitrixUserId, role) {
    // LRU eviction: if cache full, remove oldest entry
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      logger.debug('Cache eviction (LRU)', {
        evictedKey: oldestKey,
        cacheSize: this.cache.size
      });
    }

    this.cache.set(bitrixUserId, {
      role,
      timestamp: Date.now()
    });
  }

  /**
   * Update lastSeen timestamp for user
   * Non-blocking operation
   *
   * @param {string} bitrixUserId - Bitrix user ID
   * @returns {Promise<void>}
   */
  async updateLastSeen(bitrixUserId) {
    try {
      await this.db
        .collection('bitrix_users')
        .doc(bitrixUserId)
        .update({
          lastSeen: getFieldValue().serverTimestamp()
        });
    } catch (error) {
      // Silently fail - lastSeen is informational only
      logger.debug('updateLastSeen failed', {
        bitrixUserId,
        error: error.message
      });
    }
  }

  /**
   * Invalidate cache for a specific user
   * Call this after role updates
   *
   * @param {string} bitrixUserId - Bitrix user ID
   */
  invalidateCache(bitrixUserId) {
    if (!bitrixUserId) {
      logger.warn('invalidateCache called with empty bitrixUserId');
      return;
    }

    const bitrixUserIdStr = String(bitrixUserId);
    const hadEntry = this.cache.has(bitrixUserIdStr);

    this.cache.delete(bitrixUserIdStr);

    logger.info('User role cache invalidated', {
      bitrixUserId: bitrixUserIdStr,
      hadCachedEntry: hadEntry
    });
  }

  /**
   * Clear entire cache
   * Use for testing or forced refresh
   */
  clearCache() {
    const previousSize = this.cache.size;
    this.cache.clear();
    this.metrics.lastClearTime = Date.now();

    logger.info('UserRoleService cache cleared', {
      previousSize
    });
  }

  /**
   * Get all Bitrix users from Firestore
   *
   * @returns {Promise<Array>} - Array of user objects
   */
  async getAllBitrixUsers() {
    try {
      const snapshot = await this.db
        .collection('bitrix_users')
        .orderBy('lastSeen', 'desc')
        .get();

      const users = [];
      snapshot.forEach(doc => {
        users.push({
          bitrixUserId: doc.id,
          ...doc.data()
        });
      });

      logger.info('All Bitrix users retrieved', {
        count: users.length
      });

      return users;

    } catch (error) {
      logger.error('getAllBitrixUsers failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update user role in Firestore and invalidate cache
   *
   * @param {string} bitrixUserId - Bitrix user ID
   * @param {string} newRole - New role ('admin' or 'user')
   * @returns {Promise<Object>} - Result object
   */
  async updateUserRole(bitrixUserId, newRole) {
    try {
      // Validate inputs
      const validatedBitrixUserId = this.validateString(bitrixUserId, 'bitrixUserId', 100);
      const validatedRole = this.validateRole(newRole);

      // Check if user exists
      const doc = await this.db
        .collection('bitrix_users')
        .doc(validatedBitrixUserId)
        .get();

      if (!doc.exists) {
        throw new Error(`Bitrix user ${validatedBitrixUserId} not found`);
      }

      const userData = doc.data();
      const oldRole = userData.role;

      // Update role in bitrix_users collection
      await this.db
        .collection('bitrix_users')
        .doc(validatedBitrixUserId)
        .update({
          role: validatedRole,
          lastUpdatedAt: getFieldValue().serverTimestamp()
        });

      // Also update in users collection (if internalUserId exists)
      if (userData.internalUserId) {
        try {
          await this.db
            .collection('users')
            .doc(userData.internalUserId)
            .update({
              role: validatedRole
            });
        } catch (userUpdateError) {
          logger.error('Failed to update role in users collection', {
            internalUserId: userData.internalUserId,
            error: userUpdateError.message
          });
          // Continue - bitrix_users update succeeded
        }
      }

      // Invalidate cache immediately
      this.invalidateCache(validatedBitrixUserId);

      logger.info('User role updated successfully', {
        bitrixUserId: validatedBitrixUserId,
        internalUserId: userData.internalUserId,
        oldRole,
        newRole: validatedRole
      });

      return {
        success: true,
        bitrixUserId: validatedBitrixUserId,
        internalUserId: userData.internalUserId,
        oldRole,
        newRole: validatedRole,
        message: 'Role updated successfully'
      };

    } catch (error) {
      logger.error('updateUserRole failed', {
        bitrixUserId,
        newRole,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate string input
   * SECURITY: Prevents injection and ensures data integrity
   *
   * @param {string} value - Value to validate
   * @param {string} fieldName - Field name for error messages
   * @param {number} maxLength - Maximum allowed length
   * @returns {string} - Validated and trimmed string
   */
  validateString(value, fieldName, maxLength = 1000) {
    if (!value) {
      throw new Error(`${fieldName} is required`);
    }

    if (typeof value !== 'string') {
      throw new Error(`${fieldName} must be a string`);
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new Error(`${fieldName} cannot be empty`);
    }

    if (trimmed.length > maxLength) {
      throw new Error(`${fieldName} exceeds maximum length of ${maxLength} characters`);
    }

    return trimmed;
  }

  /**
   * Validate role value
   *
   * @param {string} role - Role to validate
   * @returns {string} - Validated role
   */
  validateRole(role) {
    const validRoles = ['admin', 'user'];

    if (!role || typeof role !== 'string') {
      throw new Error('Role must be a string');
    }

    const normalizedRole = role.toLowerCase().trim();

    if (!validRoles.includes(normalizedRole)) {
      throw new Error(`Role must be one of: ${validRoles.join(', ')}`);
    }

    return normalizedRole;
  }

  /**
   * Get cache statistics
   *
   * @returns {Object} - Cache statistics
   */
  getCacheStats() {
    const totalRequests = this.metrics.cacheHits + this.metrics.cacheMisses;
    const hitRate = totalRequests > 0
      ? ((this.metrics.cacheHits / totalRequests) * 100).toFixed(2)
      : '0.00';

    return {
      cacheSize: this.cache.size,
      maxCacheSize: this.maxCacheSize,
      cacheHits: this.metrics.cacheHits,
      cacheMisses: this.metrics.cacheMisses,
      hitRate: `${hitRate}%`,
      firestoreReads: this.metrics.firestoreReads,
      unknownUsers: this.metrics.unknownUsers,
      cacheTTL: `${this.cacheTimeout / 1000}s`,
      lastClearTime: this.metrics.lastClearTime
    };
  }

  /**
   * Cleanup method for graceful shutdown
   */
  async cleanup() {
    this.cache.clear();
    logger.info('UserRoleService cleanup completed', {
      finalStats: this.getCacheStats()
    });
  }
}

// Singleton pattern export
let serviceInstance;

/**
 * Initialize UserRoleService singleton
 *
 * @returns {Promise<UserRoleService>} - Initialized service instance
 */
async function initializeUserRoleService() {
  if (!serviceInstance) {
    serviceInstance = new UserRoleService();
    await serviceInstance.initialize();
  }
  return serviceInstance;
}

/**
 * Get UserRoleService singleton instance
 * Throws error if not initialized
 *
 * @returns {UserRoleService} - Service instance
 */
function getUserRoleService() {
  if (!serviceInstance) {
    throw new Error('UserRoleService not initialized. Call initializeUserRoleService() first.');
  }
  return serviceInstance;
}

module.exports = {
  UserRoleService,
  initializeUserRoleService,
  getUserRoleService
};
