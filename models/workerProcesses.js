const { getFirestore, getFieldValue } = require('../config/firestore');
const { logger } = require('../utils/logger');

/**
 * WorkerProcessesModel - Manages worker processes in Firestore
 * Follows established Chantilly model patterns for consistency
 */
class WorkerProcessesModel {
  constructor() {
    this.db = null;
    this.cache = new Map();
    this.cacheTimeout = 30000; // 30 seconds (short for worker status)
    this.collectionName = 'worker-processes';
  }

  async initialize() {
    this.db = getFirestore();
  }

  /**
   * Register a new worker process
   * @param {Object} workerData - Worker configuration
   * @returns {string|null} - Worker ID or null if failed
   */
  async registerWorker(workerData) {
    if (!this.db) {
      await this.initialize();
    }

    try {
      const workerId = workerData.workerId || this.generateWorkerId();
      
      const worker = {
        ...workerData,
        workerId,
        status: 'starting',
        startedAt: getFieldValue().serverTimestamp(),
        lastUpdate: getFieldValue().serverTimestamp(),
        currentTasks: [],
        performance: {
          avgTaskDuration: 0,
          tasksPerHour: 0,
          successRate: 100,
          apiCallsPerTask: 0,
          memoryEfficiency: 0
        },
        resources: {
          memoryUsage: '0MB',
          memoryLimit: workerData.config?.memoryLimit || '512MB',
          cpuUsage: '0%',
          uptime: 0,
          lastHealthCheck: getFieldValue().serverTimestamp(),
          taskQueueSize: 0,
          completedTasks: 0,
          failedTasks: 0
        },
        errors: []
      };

      await this.db.collection(this.collectionName).doc(workerId).set(worker);
      
      logger.info('Worker registered', { workerId, type: workerData.type });
      return workerId;
    } catch (error) {
      logger.error('Failed to register worker', { error: error.message });
      return null;
    }
  }

  /**
   * Get a worker by ID
   * @param {string} workerId - Worker identifier
   * @returns {Object|null} - Worker data or null if not found
   */
  async getWorker(workerId) {
    if (!this.db) {
      await this.initialize();
    }

    // Check cache first
    const cacheKey = `worker:${workerId}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.value;
    }

    try {
      const doc = await this.db.collection(this.collectionName).doc(workerId).get();
      
      if (!doc.exists) {
        return null;
      }

      const worker = doc.data();
      
      // Update cache
      this.cache.set(cacheKey, {
        value: worker,
        timestamp: Date.now()
      });

      return worker;
    } catch (error) {
      logger.error('Failed to get worker', { workerId, error: error.message });
      return null;
    }
  }

  /**
   * Update worker status and metrics
   * @param {string} workerId - Worker identifier
   * @param {Object} updates - Fields to update
   * @returns {boolean} - Success status
   */
  async updateWorker(workerId, updates) {
    if (!this.db) {
      await this.initialize();
    }

    try {
      const updateData = {
        ...updates,
        lastUpdate: getFieldValue().serverTimestamp()
      };

      await this.db.collection(this.collectionName).doc(workerId).update(updateData);
      
      // Clear cache for this worker
      this.cache.delete(`worker:${workerId}`);
      
      logger.debug('Worker updated', { workerId, updates: Object.keys(updates) });
      return true;
    } catch (error) {
      logger.error('Failed to update worker', { workerId, error: error.message });
      return false;
    }
  }

  /**
   * Update worker status
   * @param {string} workerId - Worker identifier
   * @param {string} status - New status
   * @param {Object} additionalData - Additional data to update
   * @returns {boolean} - Success status
   */
  async updateWorkerStatus(workerId, status, additionalData = {}) {
    const updates = {
      status,
      ...additionalData
    };

    return await this.updateWorker(workerId, updates);
  }

  /**
   * Update worker resource usage
   * @param {string} workerId - Worker identifier
   * @param {Object} resources - Resource usage data
   * @returns {boolean} - Success status
   */
  async updateWorkerResources(workerId, resources) {
    const updates = {
      'resources.memoryUsage': resources.memoryUsage,
      'resources.cpuUsage': resources.cpuUsage,
      'resources.uptime': resources.uptime,
      'resources.lastHealthCheck': getFieldValue().serverTimestamp()
    };

    return await this.updateWorker(workerId, updates);
  }

  /**
   * Add task to worker
   * @param {string} workerId - Worker identifier
   * @param {string} taskId - Task identifier
   * @returns {boolean} - Success status
   */
  async addTaskToWorker(workerId, taskId) {
    try {
      const taskData = {
        taskId,
        startedAt: getFieldValue().serverTimestamp(),
        progress: 0
      };

      const updates = {
        currentTasks: getFieldValue().arrayUnion(taskData),
        'resources.taskQueueSize': getFieldValue().increment(1)
      };

      return await this.updateWorker(workerId, updates);
    } catch (error) {
      logger.error('Failed to add task to worker', { workerId, taskId, error: error.message });
      return false;
    }
  }

  /**
   * Remove task from worker
   * @param {string} workerId - Worker identifier
   * @param {string} taskId - Task identifier
   * @param {boolean} success - Whether task completed successfully
   * @returns {boolean} - Success status
   */
  async removeTaskFromWorker(workerId, taskId, success = true) {
    try {
      const worker = await this.getWorker(workerId);
      if (!worker) {return false;}

      // Remove task from currentTasks array
      const updatedTasks = worker.currentTasks.filter(task => task.taskId !== taskId);

      const updates = {
        currentTasks: updatedTasks,
        'resources.taskQueueSize': Math.max(0, (worker.resources.taskQueueSize || 1) - 1)
      };

      // Update completion counters
      if (success) {
        updates['resources.completedTasks'] = getFieldValue().increment(1);
      } else {
        updates['resources.failedTasks'] = getFieldValue().increment(1);
      }

      return await this.updateWorker(workerId, updates);
    } catch (error) {
      logger.error('Failed to remove task from worker', { workerId, taskId, error: error.message });
      return false;
    }
  }

  /**
   * Get available workers
   * @param {string} taskType - Optional task type filter
   * @returns {Array} - Array of available workers
   */
  async getAvailableWorkers(taskType = null) {
    if (!this.db) {
      await this.initialize();
    }

    try {
      const query = this.db.collection(this.collectionName)
        .where('status', 'in', ['running', 'idle']);

      const snapshot = await query.get();
      const workers = [];

      snapshot.forEach(doc => {
        const worker = doc.data();
        
        // Check if worker can handle this task type
        if (taskType && worker.config?.specializations) {
          if (!worker.config.specializations.includes(taskType)) {
            return; // Skip this worker
          }
        }

        // Check if worker has capacity
        const maxTasks = worker.config?.maxConcurrentTasks || 2;
        const currentTasks = worker.currentTasks?.length || 0;
        
        if (currentTasks < maxTasks) {
          workers.push({
            ...worker,
            availableSlots: maxTasks - currentTasks
          });
        }
      });

      // Sort by availability and performance
      workers.sort((a, b) => {
        // First by available slots (more available = higher priority)
        if (a.availableSlots !== b.availableSlots) {
          return b.availableSlots - a.availableSlots;
        }
        // Then by success rate
        return (b.performance?.successRate || 0) - (a.performance?.successRate || 0);
      });

      return workers;
    } catch (error) {
      logger.error('Failed to get available workers', { error: error.message });
      return [];
    }
  }

  /**
   * Get all active workers
   * @returns {Array} - Array of active workers
   */
  async getActiveWorkers() {
    if (!this.db) {
      await this.initialize();
    }

    try {
      const snapshot = await this.db.collection(this.collectionName)
        .where('status', 'in', ['starting', 'running', 'idle'])
        .get();

      const workers = [];
      snapshot.forEach(doc => {
        workers.push(doc.data());
      });

      return workers;
    } catch (error) {
      logger.error('Failed to get active workers', { error: error.message });
      return [];
    }
  }

  /**
   * Mark worker as crashed
   * @param {string} workerId - Worker identifier
   * @param {Object} errorInfo - Error information
   * @returns {boolean} - Success status
   */
  async markWorkerCrashed(workerId, errorInfo) {
    const updates = {
      status: 'crashed',
      errors: getFieldValue().arrayUnion({
        timestamp: new Date().toISOString(), // Fixed: Use regular Date instead of serverTimestamp() in array
        error: errorInfo.message,
        action: 'worker_crash',
        recovery: 'restart_required'
      })
    };

    return await this.updateWorker(workerId, updates);
  }

  /**
   * Cleanup inactive workers
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {number} - Number of workers cleaned up
   */
  async cleanupInactiveWorkers(timeoutMs = 600000) { // 10 minutes default
    if (!this.db) {
      await this.initialize();
    }

    try {
      const cutoffTime = new Date(Date.now() - timeoutMs);
      const snapshot = await this.db.collection(this.collectionName)
        .where('lastUpdate', '<', cutoffTime)
        .where('status', 'in', ['running', 'idle'])
        .get();

      const batch = this.db.batch();
      let count = 0;

      snapshot.forEach(doc => {
        // Mark as crashed instead of deleting
        batch.update(doc.ref, {
          status: 'crashed',
          lastUpdate: getFieldValue().serverTimestamp(),
          errors: getFieldValue().arrayUnion({
            timestamp: new Date().toISOString(), // Fixed: Use regular Date instead of serverTimestamp() in array
            error: 'Worker timeout - no heartbeat received',
            action: 'timeout_crash',
            recovery: 'restart_required'
          })
        });
        count++;
      });

      if (count > 0) {
        await batch.commit();
        logger.info('Inactive workers marked as crashed', { count, timeoutMs });
      }

      return count;
    } catch (error) {
      logger.error('Failed to cleanup inactive workers', { error: error.message });
      return 0;
    }
  }

  /**
   * Generate unique worker ID
   * @returns {string} - Worker ID
   */
  generateWorkerId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `worker_${timestamp}_${random}`;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    logger.debug('Worker processes cache cleared');
  }

  /**
   * Get worker pool statistics
   * @returns {Object} - Worker pool stats
   */
  async getWorkerPoolStats() {
    if (!this.db) {
      await this.initialize();
    }

    try {
      const snapshot = await this.db.collection(this.collectionName).get();
      
      const stats = {
        total: 0,
        starting: 0,
        running: 0,
        idle: 0,
        stopping: 0,
        stopped: 0,
        crashed: 0,
        totalTasks: 0,
        avgMemoryUsage: 0,
        avgCpuUsage: 0
      };

      snapshot.forEach(doc => {
        const worker = doc.data();
        stats.total++;
        stats[worker.status] = (stats[worker.status] || 0) + 1;
        stats.totalTasks += worker.currentTasks?.length || 0;
      });

      return stats;
    } catch (error) {
      logger.error('Failed to get worker pool stats', { error: error.message });
      return { total: 0, running: 0, idle: 0, crashed: 0, totalTasks: 0 };
    }
  }
}

// Singleton instance
let instance = null;

function getWorkerProcessesModel() {
  if (!instance) {
    instance = new WorkerProcessesModel();
  }
  return instance;
}

module.exports = {
  WorkerProcessesModel,
  getWorkerProcessesModel
};