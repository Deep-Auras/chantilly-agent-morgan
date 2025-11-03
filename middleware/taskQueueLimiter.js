const { logger } = require('../utils/logger');
const { getFirestore } = require('../config/firestore');

/**
 * TaskQueueLimiter - DoS protection for task queue
 *
 * Provides:
 * - Global queue size limit (1000 tasks)
 * - Per-user active task limit (50 tasks)
 * - Hourly rate limit (100 tasks/hour)
 * - Parameter size validation (100KB max)
 * - Priority abuse prevention
 */
class TaskQueueLimiter {
  constructor() {
    this.userTaskCounts = new Map();
    this.maxTasksPerUser = 50;
    this.maxTasksPerHour = 100;
    this.maxParameterSize = 1024 * 100; // 100KB
    this.maxQueueSize = 1000;
  }

  /**
   * Check if task creation is allowed
   * @param {string} userId - User identifier
   * @param {Object} taskData - Task data to validate
   * @returns {Promise<Object>} - { allowed: boolean, reason?: string }
   */
  async canCreateTask(userId, taskData) {
    // Check global queue size
    const db = getFirestore();
    const queueSize = await db.collection('task-queue')
      .where('status', 'in', ['pending', 'running'])
      .count()
      .get();

    if (queueSize.data().count >= this.maxQueueSize) {
      return {
        allowed: false,
        reason: 'Queue at capacity (1000 tasks max)'
      };
    }

    // Check user task limit
    const userTasks = await db.collection('task-queue')
      .where('userId', '==', userId)
      .where('status', 'in', ['pending', 'running'])
      .count()
      .get();

    if (userTasks.data().count >= this.maxTasksPerUser) {
      return {
        allowed: false,
        reason: `User has ${this.maxTasksPerUser} active tasks (max)`
      };
    }

    // Check hourly rate limit
    const oneHourAgo = new Date(Date.now() - 3600000);
    const recentTasks = await db.collection('task-queue')
      .where('userId', '==', userId)
      .where('createdAt', '>', oneHourAgo)
      .count()
      .get();

    if (recentTasks.data().count >= this.maxTasksPerHour) {
      return {
        allowed: false,
        reason: 'Rate limit: 100 tasks per hour'
      };
    }

    // Validate parameter size
    const paramSize = JSON.stringify(taskData.definition?.parameters || {}).length;
    if (paramSize > this.maxParameterSize) {
      return {
        allowed: false,
        reason: 'Parameters too large (100KB max)'
      };
    }

    // Validate priority
    if (taskData.priority > 80) {
      logger.warn('High priority task requested', {
        userId,
        priority: taskData.priority
      });
      // Only admins can set priority > 80
      taskData.priority = Math.min(taskData.priority, 80);
    }

    return { allowed: true };
  }
}

module.exports = { TaskQueueLimiter };
