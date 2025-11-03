const { getFirestore, getFieldValue } = require('../config/firestore');
const { logger } = require('../utils/logger');

/**
 * TaskQueueModel - Manages task queue in Firestore
 * Follows established Chantilly model patterns for consistency
 */
class TaskQueueModel {
  constructor() {
    this.db = null;
    this.cache = new Map();
    this.cacheTimeout = 60000; // 1 minute (shorter for active tasks)
    this.collectionName = 'task-queue';
  }

  async initialize() {
    this.db = getFirestore();
  }

  /**
   * Create a new task
   * @param {Object} taskData - Task configuration
   * @returns {string|null} - Task ID or null if failed
   */
  async createTask(taskData) {
    if (!this.db) {
      await this.initialize();
    }

    try {
      const taskId = taskData.taskId || this.generateTaskId();
      
      const task = {
        ...taskData,
        taskId,
        createdAt: getFieldValue().serverTimestamp(),
        updatedAt: getFieldValue().serverTimestamp(),
        status: taskData.status || 'pending',
        priority: taskData.priority || 50
      };

      await this.db.collection(this.collectionName).doc(taskId).set(task);
      
      logger.info('Task created', { taskId, type: taskData.type });
      return taskId;
    } catch (error) {
      logger.error('Failed to create task', { error: error.message });
      return null;
    }
  }

  /**
   * Get a task by ID
   * @param {string} taskId - Task identifier
   * @returns {Object|null} - Task data or null if not found
   */
  async getTask(taskId) {
    if (!this.db) {
      await this.initialize();
    }

    // Check cache first for recent tasks
    const cacheKey = `task:${taskId}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.value;
    }

    try {
      const doc = await this.db.collection(this.collectionName).doc(taskId).get();
      
      if (!doc.exists) {
        return null;
      }

      const task = doc.data();
      
      // Update cache for active tasks
      if (['pending', 'running'].includes(task.status)) {
        this.cache.set(cacheKey, {
          value: task,
          timestamp: Date.now()
        });
      }

      return task;
    } catch (error) {
      logger.error('Failed to get task', { taskId, error: error.message });
      return null;
    }
  }

  /**
   * Get tasks by field value
   * @param {string} field - Field name to query
   * @param {any} value - Field value to match
   * @returns {Array} - Array of matching tasks
   */
  async getTasksByField(field, value) {
    if (!this.db) {
      await this.initialize();
    }

    try {
      const snapshot = await this.db.collection(this.collectionName)
        .where(field, '==', value)
        .get();
      
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      logger.error('Failed to get tasks by field', { field, value, error: error.message });
      return [];
    }
  }

  /**
   * Update task status and progress
   * @param {string} taskId - Task identifier
   * @param {Object} updates - Fields to update
   * @returns {boolean} - Success status
   */
  async updateTask(taskId, updates) {
    if (!this.db) {
      await this.initialize();
    }

    try {
      const updateData = {
        ...updates,
        updatedAt: getFieldValue().serverTimestamp()
      };

      await this.db.collection(this.collectionName).doc(taskId).update(updateData);
      
      // Clear cache for this task
      this.cache.delete(`task:${taskId}`);
      
      logger.debug('Task updated', { taskId, updates: Object.keys(updates) });
      return true;
    } catch (error) {
      logger.error('Failed to update task', { taskId, error: error.message });
      return false;
    }
  }

  /**
   * Update task progress
   * @param {string} taskId - Task identifier
   * @param {number} percentage - Progress percentage (0-100)
   * @param {string} message - Progress message
   * @param {Object} data - Additional progress data
   * @returns {boolean} - Success status
   */
  async updateProgress(taskId, percentage, message, data = {}) {
    const updates = {
      'progress.percentage': percentage,
      'progress.message': message,
      'progress.data': data,
      'execution.lastHeartbeat': getFieldValue().serverTimestamp()
    };

    return await this.updateTask(taskId, updates);
  }

  /**
   * Complete a task
   * @param {string} taskId - Task identifier
   * @param {Object} result - Task result data
   * @returns {boolean} - Success status
   */
  async completeTask(taskId, result) {
    const updates = {
      status: 'completed',
      result: {
        success: true,
        summary: result.summary,
        attachments: result.attachments || [],
        executionTime: result.executionTime,
        resourceUsage: result.resourceUsage
      },
      'progress.percentage': 100,
      'progress.message': 'Task completed successfully'
    };

    return await this.updateTask(taskId, updates);
  }

  /**
   * Fail a task
   * @param {string} taskId - Task identifier
   * @param {Object} error - Error information
   * @returns {boolean} - Success status
   */
  async failTask(taskId, error) {
    const updates = {
      status: 'failed',
      errors: getFieldValue().arrayUnion({
        timestamp: new Date().toISOString(), // Fixed: Use regular Date instead of serverTimestamp() in array
        type: error.type || 'execution_error',
        message: error.message,
        step: error.step,
        resolved: false
      })
    };

    return await this.updateTask(taskId, updates);
  }

  /**
   * Get pending tasks
   * @param {number} limit - Maximum number of tasks to return
   * @returns {Array} - Array of pending tasks
   */
  async getPendingTasks(limit = 10) {
    if (!this.db) {
      await this.initialize();
    }

    try {
      const snapshot = await this.db.collection(this.collectionName)
        .where('status', '==', 'pending')
        .orderBy('priority', 'desc')
        .orderBy('createdAt', 'asc')
        .limit(limit)
        .get();

      const tasks = [];
      snapshot.forEach(doc => {
        tasks.push(doc.data());
      });

      return tasks;
    } catch (error) {
      logger.error('Failed to get pending tasks', { error: error.message });
      return [];
    }
  }

  /**
   * Get running tasks
   * @returns {Array} - Array of running tasks
   */
  async getRunningTasks() {
    if (!this.db) {
      await this.initialize();
    }

    try {
      const snapshot = await this.db.collection(this.collectionName)
        .where('status', '==', 'running')
        .get();

      const tasks = [];
      snapshot.forEach(doc => {
        tasks.push(doc.data());
      });

      return tasks;
    } catch (error) {
      logger.error('Failed to get running tasks', { error: error.message });
      return [];
    }
  }

  /**
   * Get tasks by user
   * @param {string} userId - User identifier
   * @param {Array} statuses - Task statuses to filter by
   * @param {number} limit - Maximum number of tasks
   * @returns {Array} - Array of user tasks
   */
  async getUserTasks(userId, statuses = ['pending', 'running'], limit = 20) {
    if (!this.db) {
      await this.initialize();
    }

    try {
      const snapshot = await this.db.collection(this.collectionName)
        .where('createdBy', '==', userId)
        .where('status', 'in', statuses)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const tasks = [];
      snapshot.forEach(doc => {
        tasks.push(doc.data());
      });

      return tasks;
    } catch (error) {
      logger.error('Failed to get user tasks', { userId, error: error.message });
      return [];
    }
  }

  /**
   * Cancel a task
   * @param {string} taskId - Task identifier
   * @returns {boolean} - Success status
   */
  async cancelTask(taskId) {
    try {
      // Get task to retrieve Cloud Task name before updating status
      const task = await this.getTask(taskId);
      const cloudTaskName = task?.execution?.cloudTaskName;

      // Update database status first
      const updates = {
        status: 'cancelled',
        'progress.message': 'Task cancelled by user',
        cancelledAt: new Date().toISOString()
      };

      const dbResult = await this.updateTask(taskId, updates);

      // Cancel the Cloud Task if it exists
      if (cloudTaskName) {
        try {
          const { getCloudTasksQueue } = require('../services/cloudTasksQueue');
          const cloudTasksQueue = getCloudTasksQueue();
          const cancelled = await cloudTasksQueue.cancelTask(cloudTaskName);
          
          // Update task with Cloud Task cancellation status
          await this.updateTask(taskId, {
            'execution.cloudTaskCancelled': cancelled,
            'execution.cloudTaskCancelledAt': new Date().toISOString()
          });

          const { logger } = require('../utils/logger');
          logger.info('Task and Cloud Task cancelled', {
            taskId,
            cloudTaskName,
            cloudTaskCancelled: cancelled
          });
        } catch (cloudError) {
          const { logger } = require('../utils/logger');
          logger.error('Failed to cancel Cloud Task during task cancellation', {
            taskId,
            cloudTaskName,
            error: cloudError.message
          });
          // Don't fail the entire cancellation if Cloud Task cancellation fails
        }
      }

      return dbResult;
    } catch (error) {
      const { logger } = require('../utils/logger');
      logger.error('Failed to cancel task', {
        taskId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Clean up expired tasks
   * @returns {number} - Number of tasks cleaned up
   */
  async cleanupExpiredTasks() {
    if (!this.db) {
      await this.initialize();
    }

    try {
      const now = new Date();
      const snapshot = await this.db.collection(this.collectionName)
        .where('expiresAt', '<', now)
        .get();

      const batch = this.db.batch();
      let count = 0;

      snapshot.forEach(doc => {
        batch.delete(doc.ref);
        count++;
      });

      if (count > 0) {
        await batch.commit();
        logger.info('Expired tasks cleaned up', { count });
      }

      return count;
    } catch (error) {
      logger.error('Failed to cleanup expired tasks', { error: error.message });
      return 0;
    }
  }

  /**
   * Generate unique task ID
   * @returns {string} - Task ID
   */
  generateTaskId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `task_${timestamp}_${random}`;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    logger.debug('Task queue cache cleared');
  }

  /**
   * Get queue statistics
   * @returns {Object} - Queue stats
   */
  async getQueueStats() {
    if (!this.db) {
      await this.initialize();
    }

    try {
      const [pendingSnapshot, runningSnapshot, completedSnapshot] = await Promise.all([
        this.db.collection(this.collectionName).where('status', '==', 'pending').get(),
        this.db.collection(this.collectionName).where('status', '==', 'running').get(),
        this.db.collection(this.collectionName).where('status', '==', 'completed').get()
      ]);

      return {
        pending: pendingSnapshot.size,
        running: runningSnapshot.size,
        completed: completedSnapshot.size,
        cacheSize: this.cache.size
      };
    } catch (error) {
      logger.error('Failed to get queue stats', { error: error.message });
      return { pending: 0, running: 0, completed: 0, cacheSize: this.cache.size };
    }
  }
}

// Singleton instance
let instance = null;

function getTaskQueueModel() {
  if (!instance) {
    instance = new TaskQueueModel();
  }
  return instance;
}

module.exports = {
  TaskQueueModel,
  getTaskQueueModel
};