const { getFirestore } = require('../config/firestore');
const { logger } = require('../utils/logger');

/**
 * FirestoreProxy - RBAC proxy for template Firestore access
 *
 * Provides:
 * - Collection whitelisting (only allowed collections)
 * - Read-only enforcement
 * - Rate limiting (reads/writes per minute)
 * - Operation logging
 */
class FirestoreProxy {
  constructor(options = {}) {
    this.templateId = options.templateId;
    this.allowedCollections = new Set(options.allowedCollections || []);
    this.readOnly = options.readOnly || false;
    this.maxReadsPerMinute = options.maxReadsPerMinute || 100;
    this.maxWritesPerMinute = options.maxWritesPerMinute || 20;

    this.db = getFirestore();
    this.reads = [];
    this.writes = [];
  }

  /**
   * Validate collection access
   * @param {string} collectionName - Collection to access
   * @param {string} operation - Operation type (read/write)
   * @throws {Error} - If access denied
   * @returns {boolean} - True if allowed
   */
  validateAccess(collectionName, operation) {
    // Check if collection is allowed
    if (!this.allowedCollections.has(collectionName)) {
      throw new Error(
        `Access denied: Template cannot access collection '${collectionName}'`
      );
    }

    // Check read-only mode
    if (this.readOnly && operation === 'write') {
      throw new Error(
        `Access denied: Template is in read-only mode`
      );
    }

    // Check rate limits
    const now = Date.now();

    if (operation === 'read') {
      this.reads = this.reads.filter(t => now - t < 60000);
      if (this.reads.length >= this.maxReadsPerMinute) {
        throw new Error(
          `Read rate limit exceeded (${this.maxReadsPerMinute}/min)`
        );
      }
      this.reads.push(now);
    } else if (operation === 'write') {
      this.writes = this.writes.filter(t => now - t < 60000);
      if (this.writes.length >= this.maxWritesPerMinute) {
        throw new Error(
          `Write rate limit exceeded (${this.maxWritesPerMinute}/min)`
        );
      }
      this.writes.push(now);
    }

    logger.debug('Firestore access validated', {
      templateId: this.templateId,
      collection: collectionName,
      operation,
      reads: this.reads.length,
      writes: this.writes.length
    });

    return true;
  }

  /**
   * Proxied collection access
   * @param {string} collectionName - Collection name
   * @returns {Proxy} - Proxied collection reference
   */
  collection(collectionName) {
    this.validateAccess(collectionName, 'read');

    const originalCollection = this.db.collection(collectionName);

    // Return proxy that intercepts writes
    return new Proxy(originalCollection, {
      get: (target, prop) => {
        // Intercept write operations
        if (['add', 'set', 'update', 'delete'].includes(prop)) {
          return (...args) => {
            this.validateAccess(collectionName, 'write');

            logger.info('Template Firestore write', {
              templateId: this.templateId,
              collection: collectionName,
              operation: prop
            });

            return target[prop](...args);
          };
        }

        // Allow read operations
        return target[prop];
      }
    });
  }

  /**
   * Get statistics
   * @returns {Object} - Proxy statistics
   */
  getStats() {
    return {
      templateId: this.templateId,
      readCount: this.reads.length,
      writeCount: this.writes.length,
      allowedCollections: Array.from(this.allowedCollections),
      readOnly: this.readOnly
    };
  }
}

/**
 * Get Firestore proxy with limits
 * @param {Object} options - Proxy options
 * @returns {FirestoreProxy} - Proxied Firestore instance
 */
async function getFirestoreWithLimits(options) {
  return new FirestoreProxy(options);
}

module.exports = { FirestoreProxy, getFirestoreWithLimits };
