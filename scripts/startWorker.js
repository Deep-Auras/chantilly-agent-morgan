#!/usr/bin/env node

/**
 * Script to start a BasicTaskWorker process
 * Usage: node scripts/startWorker.js [worker-id]
 * Example: node scripts/startWorker.js worker_dev_001
 */

const { Worker } = require('worker_threads');
const path = require('path');
const { logger } = require('../utils/logger');

class WorkerManager {
  constructor() {
    this.workers = new Map();
    this.workerCount = 0;
    this.maxWorkers = 3; // Maximum concurrent workers
  }

  /**
   * Start a new worker process
   * @param {string} workerId - Optional worker ID
   */
  async startWorker(workerId = null) {
    try {
      const id = workerId || this.generateWorkerId();
      
      if (this.workers.has(id)) {
        console.log(`⚠️  Worker ${id} already exists`);
        return false;
      }

      if (this.workers.size >= this.maxWorkers) {
        console.log(`⚠️  Maximum workers (${this.maxWorkers}) already running`);
        return false;
      }

      console.log(`🚀 Starting worker: ${id}`);

      // Create worker thread
      const workerPath = path.resolve(__dirname, '../workers/basicTaskWorker.js');
      const worker = new Worker(workerPath, {
        workerData: { workerId: id }
      });

      // Set up worker event handlers
      this.setupWorkerEventHandlers(worker, id);

      // Store worker reference
      this.workers.set(id, {
        worker,
        id,
        status: 'starting',
        startTime: Date.now(),
        tasks: new Set()
      });

      this.workerCount++;
      
      console.log(`✅ Worker ${id} started successfully`);
      console.log(`📊 Active workers: ${this.workers.size}/${this.maxWorkers}`);
      
      return true;
    } catch (error) {
      console.error(`❌ Failed to start worker: ${error.message}`);
      return false;
    }
  }

  /**
   * Set up event handlers for a worker
   * @param {Worker} worker - Worker thread instance
   * @param {string} workerId - Worker ID
   */
  setupWorkerEventHandlers(worker, workerId) {
    // Worker messages
    worker.on('message', (message) => {
      this.handleWorkerMessage(workerId, message);
    });

    // Worker errors
    worker.on('error', (error) => {
      console.error(`❌ Worker ${workerId} error:`, error.message);
      this.removeWorker(workerId);
    });

    // Worker exit
    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`❌ Worker ${workerId} exited with code ${code}`);
      } else {
        console.log(`✅ Worker ${workerId} exited gracefully`);
      }
      this.removeWorker(workerId);
    });
  }

  /**
   * Handle messages from workers
   * @param {string} workerId - Worker ID
   * @param {Object} message - Message from worker
   */
  handleWorkerMessage(workerId, message) {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) {return;}

    const { type, data } = message;

    switch (type) {
    case 'WORKER_READY':
      console.log(`🟢 Worker ${workerId} is ready for tasks`);
      workerInfo.status = 'idle';
      break;

    case 'HEARTBEAT':
      console.log(`💓 Worker ${workerId} heartbeat - Status: ${data.status}, Tasks: ${data.currentTasks}`);
      workerInfo.status = data.status;
      break;

    case 'TASK_STARTED':
      console.log(`🔄 Worker ${workerId} started task: ${data.taskId}`);
      workerInfo.tasks.add(data.taskId);
      break;

    case 'TASK_COMPLETED':
      console.log(`✅ Worker ${workerId} completed task: ${data.taskId} (${data.executionTime}ms)`);
      workerInfo.tasks.delete(data.taskId);
      break;

    case 'TASK_FAILED':
      console.log(`❌ Worker ${workerId} failed task: ${data.taskId} - ${data.error.message}`);
      workerInfo.tasks.delete(data.taskId);
      break;

    case 'TASK_AUTO_REPAIRED':
      console.log(`🔧 Worker ${workerId} auto-repaired task: ${data.taskId} - ${data.repairResult.message}`);
      console.log(`   Original Error: ${data.originalError.type} - ${data.originalError.message}`);
      console.log(`   Repair Attempt: ${data.repairResult.repairAttempt || 1}`);
      // Task continues running with repaired template, don't remove from tasks
      break;

    case 'WORKER_STATUS':
      this.displayWorkerStatus(workerId, data);
      break;

    case 'WORKER_SHUTDOWN':
      console.log(`🛑 Worker ${workerId} is shutting down`);
      this.removeWorker(workerId);
      break;

    default:
      console.log(`📩 Worker ${workerId} message:`, type, data);
    }
  }

  /**
   * Display detailed worker status
   * @param {string} workerId - Worker ID
   * @param {Object} status - Status data
   */
  displayWorkerStatus(workerId, status) {
    console.log(`\n📊 Worker ${workerId} Status:`);
    console.log(`   Status: ${status.status}`);
    console.log(`   Current Tasks: ${status.currentTasks.length}`);
    console.log(`   Uptime: ${Math.round(status.uptime / 1000)}s`);
    console.log(`   Tasks Completed: ${status.resourceUsage.tasksCompleted}`);
    console.log(`   Tasks Failed: ${status.resourceUsage.tasksFailed}`);
    console.log(`   Peak Memory: ${Math.round(status.resourceUsage.peakMemory / 1024 / 1024)}MB`);
    if (status.currentTasks.length > 0) {
      console.log(`   Active Tasks: ${status.currentTasks.join(', ')}`);
    }
    console.log('');
  }

  /**
   * Remove worker from tracking
   * @param {string} workerId - Worker ID
   */
  removeWorker(workerId) {
    if (this.workers.has(workerId)) {
      this.workers.delete(workerId);
      console.log(`🗑️  Removed worker ${workerId} from tracking`);
      console.log(`📊 Active workers: ${this.workers.size}/${this.maxWorkers}`);
    }
  }

  /**
   * Stop a specific worker
   * @param {string} workerId - Worker ID
   */
  async stopWorker(workerId) {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) {
      console.log(`❌ Worker ${workerId} not found`);
      return false;
    }

    console.log(`🛑 Stopping worker ${workerId}...`);
    workerInfo.worker.postMessage({ type: 'SHUTDOWN' });
    
    return true;
  }

  /**
   * Stop all workers
   */
  async stopAllWorkers() {
    console.log(`🛑 Stopping all workers (${this.workers.size})...`);
    
    const stopPromises = [];
    for (const [workerId] of this.workers) {
      stopPromises.push(this.stopWorker(workerId));
    }
    
    await Promise.all(stopPromises);
    
    // Wait a bit for graceful shutdown
    setTimeout(() => {
      if (this.workers.size > 0) {
        console.log('⚠️  Force terminating remaining workers...');
        for (const [workerId, workerInfo] of this.workers) {
          workerInfo.worker.terminate();
        }
      }
    }, 5000);
  }

  /**
   * List all active workers
   */
  listWorkers() {
    console.log(`\n📋 Active Workers (${this.workers.size}/${this.maxWorkers}):`);
    
    if (this.workers.size === 0) {
      console.log('   No active workers');
      return;
    }

    for (const [workerId, workerInfo] of this.workers) {
      const uptime = Math.round((Date.now() - workerInfo.startTime) / 1000);
      console.log(`   🔹 ${workerId}`);
      console.log(`      Status: ${workerInfo.status}`);
      console.log(`      Uptime: ${uptime}s`);
      console.log(`      Tasks: ${workerInfo.tasks.size}`);
    }
    console.log('');
  }

  /**
   * Generate a unique worker ID
   * @returns {string} - Worker ID
   */
  generateWorkerId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 6);
    return `worker_${timestamp}_${random}`;
  }

  /**
   * Request status from all workers
   */
  requestWorkerStatus() {
    console.log('📊 Requesting status from all workers...\n');
    for (const [workerId, workerInfo] of this.workers) {
      workerInfo.worker.postMessage({ type: 'STATUS_REQUEST' });
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const workerId = args[1];

  const manager = new WorkerManager();

  console.log('🚀 Chantilly Task Worker Manager\n');

  // Handle different commands
  switch (command) {
  case 'start':
    await manager.startWorker(workerId);
    break;
    
  case 'stop':
    if (workerId) {
      await manager.stopWorker(workerId);
    } else {
      await manager.stopAllWorkers();
    }
    process.exit(0);
    break;
    
  case 'list':
    manager.listWorkers();
    process.exit(0);
    break;
    
  case 'status':
    manager.requestWorkerStatus();
    setTimeout(() => process.exit(0), 2000);
    break;
    
  default:
    // Default: start a single worker
    console.log('Usage:');
    console.log('  node scripts/startWorker.js [start] [worker-id]  # Start worker');
    console.log('  node scripts/startWorker.js stop [worker-id]     # Stop specific worker');
    console.log('  node scripts/startWorker.js stop                # Stop all workers');
    console.log('  node scripts/startWorker.js list                # List active workers');
    console.log('  node scripts/startWorker.js status              # Get worker status');
    console.log('');
    console.log('Starting default worker...');
    await manager.startWorker();
  }

  // Keep the process alive to monitor workers
  if (!['stop', 'list', 'status'].includes(command)) {
    console.log('\n💡 Worker manager is running. Press Ctrl+C to stop all workers and exit.\n');
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Received SIGINT, shutting down workers...');
      await manager.stopAllWorkers();
      setTimeout(() => process.exit(0), 6000);
    });

    process.on('SIGTERM', async () => {
      console.log('\n🛑 Received SIGTERM, shutting down workers...');
      await manager.stopAllWorkers();
      setTimeout(() => process.exit(0), 6000);
    });

    // Periodic status updates
    setInterval(() => {
      manager.listWorkers();
    }, 30000); // Every 30 seconds
  }
}

// Error handling
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled Rejection:', reason);
  process.exit(1);
});

main().catch(console.error);