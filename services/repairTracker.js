const { logger } = require('../utils/logger');

/**
 * RepairTracker - Tracks auto-repair attempts and costs
 *
 * Provides:
 * - Max repair attempts per task (3)
 * - Cost tracking per template ($30/day limit)
 * - Cooldown periods (6 minutes between repairs)
 * - Daily cleanup
 */
class RepairTracker {
  constructor() {
    this.repairs = new Map(); // taskId → repair attempts
    this.costs = new Map();   // templateId → token costs

    this.maxRepairsPerTask = 3;
    this.maxCostPerTemplate = 1000000; // 1M tokens (~$30)
    this.cooldownPeriod = 3600000; // 1 hour
  }

  /**
   * Check if repair is allowed
   * @param {string} taskId - Task identifier
   * @param {string} templateId - Template identifier
   * @returns {Object} - { allowed: boolean, reason?: string }
   */
  canRepair(taskId, templateId) {
    // Check task-level repair limit
    const taskRepairs = this.repairs.get(taskId) || [];
    if (taskRepairs.length >= this.maxRepairsPerTask) {
      logger.warn('Max repairs exceeded for task', {
        taskId,
        attempts: taskRepairs.length
      });
      return {
        allowed: false,
        reason: `Maximum ${this.maxRepairsPerTask} repair attempts reached`
      };
    }

    // Check template-level cost limit
    const templateCosts = this.costs.get(templateId) || 0;
    if (templateCosts >= this.maxCostPerTemplate) {
      logger.warn('Cost limit exceeded for template', {
        templateId,
        tokenCost: templateCosts
      });
      return {
        allowed: false,
        reason: 'Template repair cost limit exceeded ($30/day)'
      };
    }

    // Check cooldown (prevent rapid retry storms)
    const lastRepair = taskRepairs[taskRepairs.length - 1];
    if (lastRepair && (Date.now() - lastRepair.timestamp < this.cooldownPeriod / 10)) {
      return {
        allowed: false,
        reason: 'Repair cooldown active (wait 6 minutes)'
      };
    }

    return { allowed: true };
  }

  /**
   * Record repair attempt
   * @param {string} taskId - Task identifier
   * @param {string} templateId - Template identifier
   * @param {number} tokenCost - Token cost of repair
   */
  recordRepair(taskId, templateId, tokenCost) {
    // Record task repair
    if (!this.repairs.has(taskId)) {
      this.repairs.set(taskId, []);
    }
    this.repairs.get(taskId).push({
      timestamp: Date.now(),
      templateId,
      tokenCost
    });

    // Record template cost
    const currentCost = this.costs.get(templateId) || 0;
    this.costs.set(templateId, currentCost + tokenCost);

    logger.info('Repair recorded', {
      taskId,
      templateId,
      tokenCost,
      totalCost: this.costs.get(templateId),
      attempts: this.repairs.get(taskId).length
    });
  }

  /**
   * Get statistics
   * @param {string} templateId - Optional template filter
   * @returns {Object} - Repair statistics
   */
  getStats(templateId = null) {
    if (templateId) {
      return {
        totalCost: this.costs.get(templateId) || 0,
        repairCount: Array.from(this.repairs.values())
          .flat()
          .filter(r => r.templateId === templateId).length
      };
    }

    return {
      totalTemplates: this.costs.size,
      totalRepairs: Array.from(this.repairs.values())
        .reduce((sum, repairs) => sum + repairs.length, 0),
      totalCost: Array.from(this.costs.values())
        .reduce((sum, cost) => sum + cost, 0)
    };
  }

  /**
   * Cleanup old repairs (>24 hours)
   */
  cleanup() {
    const now = Date.now();

    // Remove old task repairs (>24 hours)
    for (const [taskId, repairs] of this.repairs.entries()) {
      const filtered = repairs.filter(
        r => now - r.timestamp < 86400000
      );
      if (filtered.length === 0) {
        this.repairs.delete(taskId);
      } else {
        this.repairs.set(taskId, filtered);
      }
    }

    // Reset daily costs
    this.costs.clear();

    logger.info('Repair tracker cleanup completed', {
      activeRepairs: this.repairs.size
    });
  }
}

// Singleton
let instance = null;

/**
 * Get repair tracker singleton
 * @returns {RepairTracker} - Repair tracker instance
 */
function getRepairTracker() {
  if (!instance) {
    instance = new RepairTracker();
    // Cleanup daily
    setInterval(() => instance.cleanup(), 86400000);
  }
  return instance;
}

module.exports = { RepairTracker, getRepairTracker };
