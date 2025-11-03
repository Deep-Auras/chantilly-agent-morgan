const { Worker } = require('worker_threads');
const { logger } = require('../utils/logger');
const os = require('os');

/**
 * IsolatedTaskWorker - Executes tasks in isolated worker threads
 *
 * Provides:
 * - Worker thread isolation
 * - Memory limits per worker (512MB)
 * - Task timeouts (5 minutes)
 * - Resource monitoring
 * - Worker pool management
 */
class IsolatedTaskWorker {
  constructor(options = {}) {
    this.maxMemoryMB = options.maxMemoryMB || 512;
    this.maxCPUPercent = options.maxCPUPercent || 80;
    this.taskTimeout = options.taskTimeout || 300000; // 5 minutes
    this.maxConcurrentTasks = options.maxConcurrentTasks || os.cpus().length;

    this.activeWorkers = new Map();
  }

  /**
   * Execute task in isolated worker thread
   * @param {string} taskId - Task identifier
   * @param {Object} taskData - Task data
   * @returns {Promise<Object>} - Execution result
   */
  async executeTaskIsolated(taskId, taskData) {
    // Check worker pool capacity
    if (this.activeWorkers.size >= this.maxConcurrentTasks) {
      throw new Error('Worker pool at capacity');
    }

    return new Promise((resolve, reject) => {
      const worker = new Worker('./workers/taskExecutorWorker.js', {
        workerData: {
          taskId,
          taskData,
          maxMemoryMB: this.maxMemoryMB
        },
        resourceLimits: {
          maxOldGenerationSizeMb: this.maxMemoryMB,
          maxYoungGenerationSizeMb: this.maxMemoryMB / 4
        }
      });

      const workerId = `worker-${taskId}-${Date.now()}`;
      this.activeWorkers.set(workerId, {
        worker,
        taskId,
        startTime: Date.now()
      });

      // Timeout enforcement
      const timeout = setTimeout(() => {
        worker.terminate();
        this.activeWorkers.delete(workerId);
        reject(new Error(`Task timeout after ${this.taskTimeout}ms`));
      }, this.taskTimeout);

      // Resource monitoring
      const monitor = setInterval(() => {
        worker.getHeapSnapshot().then(snapshot => {
          const memoryMB = snapshot.total / 1024 / 1024;

          if (memoryMB > this.maxMemoryMB) {
            logger.warn('Task exceeding memory limit', {
              taskId,
              memoryMB,
              limit: this.maxMemoryMB
            });
            worker.terminate();
            clearInterval(monitor);
            clearTimeout(timeout);
            this.activeWorkers.delete(workerId);
            reject(new Error('Memory limit exceeded'));
          }
        }).catch(() => {
          // Ignore monitoring errors
        });
      }, 5000);

      worker.on('message', (result) => {
        clearInterval(monitor);
        clearTimeout(timeout);
        this.activeWorkers.delete(workerId);
        resolve(result);
      });

      worker.on('error', (error) => {
        clearInterval(monitor);
        clearTimeout(timeout);
        this.activeWorkers.delete(workerId);
        logger.error('Worker error', { taskId, error: error.message });
        reject(error);
      });

      worker.on('exit', (code) => {
        clearInterval(monitor);
        clearTimeout(timeout);
        this.activeWorkers.delete(workerId);

        if (code !== 0) {
          reject(new Error(`Worker exited with code ${code}`));
        }
      });
    });
  }

  /**
   * Get worker statistics
   * @returns {Object} - Worker stats
   */
  getStats() {
    return {
      activeWorkers: this.activeWorkers.size,
      maxConcurrent: this.maxConcurrentTasks,
      tasks: Array.from(this.activeWorkers.values()).map(w => ({
        taskId: w.taskId,
        runningTime: Date.now() - w.startTime
      }))
    };
  }

  /**
   * Shutdown all workers
   */
  async shutdown() {
    for (const [workerId, { worker }] of this.activeWorkers.entries()) {
      await worker.terminate();
      this.activeWorkers.delete(workerId);
    }
  }
}

module.exports = { IsolatedTaskWorker };
