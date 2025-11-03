const BaseTool = require('../lib/baseTool');
const { getTaskQueueModel } = require('../models/taskQueue');
const { getWorkerProcessesModel } = require('../models/workerProcesses');
const { logger } = require('../utils/logger');

/**
 * TaskManagementTool - Manage existing tasks (status, cancel, list)
 * 
 * This tool provides task management capabilities separate from task creation:
 * - Check task status and progress
 * - Cancel running tasks
 * - List user's tasks
 * - View task history
 * 
 * This is separate from ComplexTaskManagerTool to avoid action confusion
 */
class TaskManagementTool extends BaseTool {
  constructor(context) {
    super(context);

    this.name = 'TaskManagement';
    this.description = 'Check status, cancel, or list existing tasks. Use for "task status", "cancel task", "my tasks", or "task history". NOT for creating new tasks.';
    this.userDescription = 'Manage and monitor existing tasks';
    this.category = 'productivity';
    this.version = '1.0.0';
    this.author = 'Chantilly Agent System';
    this.priority = 30;

    // Define parameters for the tool
    this.parameters = {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'cancel', 'list', 'history'],
          description: 'CONCEPTUAL: What does user want to KNOW or DO about existing tasks? Use STATUS when user wants to CHECK progress/state of specific task. Use CANCEL when user wants to STOP a running task. Use LIST when user wants to SEE current/active tasks. Use HISTORY when user wants to REVIEW past/completed tasks. Concept: STATUS=check one, CANCEL=stop one, LIST=view active, HISTORY=view completed.'
        },
        taskId: {
          type: 'string',
          description: 'Task identifier for status/cancel operations'
        },
        includeCompleted: {
          type: 'boolean',
          description: 'Include completed tasks in list',
          default: false
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 50,
          description: 'Maximum number of tasks to show',
          default: 10
        }
      },
      required: ['action']
    };

    // Initialize services
    this.taskQueueModel = null;
    this.workerProcessesModel = null;
    this.initialized = false;
  }

  /**
   * Initialize the tool with required services
   */
  async initialize() {
    if (this.initialized) {return;}

    try {
      this.taskQueueModel = getTaskQueueModel();
      this.workerProcessesModel = getWorkerProcessesModel();
      
      this.initialized = true;
      this.log('info', 'TaskManagement tool initialized');
    } catch (error) {
      this.log('error', 'Failed to initialize TaskManagement tool', { error: error.message });
      throw error;
    }
  }

  /**
   * Determine if this tool should trigger for the given message
   * @param {string} message - User message
   * @param {Object} messageData - Message context
   * @returns {boolean} - Whether tool should trigger
   */
  shouldTrigger(message, messageData) {
    if (!message || typeof message !== 'string') {return false;}

    const taskManagementPatterns = [
      // Task status patterns
      /task\s+status/i,
      /check\s+task/i,
      /how.*is.*task/i,
      /task.*progress/i,
      /status.*of.*task/i,
      
      // Task cancellation patterns
      /cancel\s+task/i,
      /stop\s+task/i,
      /abort\s+task/i,
      /kill\s+task/i,
      
      // Task listing patterns
      /list.*tasks/i,
      /my.*tasks/i,
      /show.*tasks/i,
      /what.*tasks/i,
      /running.*tasks/i,
      
      // Task history patterns
      /task.*history/i,
      /completed.*tasks/i,
      /task.*log/i,
      /past.*tasks/i,
      
      // Task ID patterns (when user provides task ID)
      /task[_\-\s]+[a-z0-9]+/i
    ];

    const isTaskManagement = taskManagementPatterns.some(pattern => pattern.test(message));
    
    // Exclude task creation patterns
    const creationPatterns = [
      /create.*task/i,
      /start.*task/i,
      /new.*task/i,
      /generate.*report/i,
      /make.*task/i
    ];
    
    const isTaskCreation = creationPatterns.some(pattern => pattern.test(message));

    this.log('debug', 'TaskManagement trigger evaluation', {
      message: message.substring(0, 100),
      isTaskManagement,
      isTaskCreation,
      shouldTrigger: isTaskManagement && !isTaskCreation
    });

    return isTaskManagement && !isTaskCreation;
  }

  /**
   * Execute the tool with given parameters
   * @param {Object} args - Tool arguments
   * @param {Object} toolContext - Tool execution context
   * @returns {Object} - Execution result
   */
  async execute(args, toolContext) {
    try {
      await this.initialize();

      const { action } = args;
      const userId = toolContext?.messageData?.userId || 'unknown';

      this.log('info', 'TaskManagement executing', { action, userId });

      switch (action) {
      case 'status':
        return await this.getTaskStatus(args, userId, toolContext);
        
      case 'cancel':
        return await this.cancelTask(args, userId);
        
      case 'list':
        return await this.listUserTasks(args, userId);
        
      case 'history':
        return await this.getTaskHistory(args, userId);
        
      default:
        throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      this.log('error', 'TaskManagement execution failed', {
        action: args.action,
        error: error.message
      });
      
      return {
        success: false,
        error: error.message,
        message: `❌ Task management failed: ${error.message}`
      };
    }
  }

  /**
   * Get detailed task status with progress and worker info
   * @param {Object} args - Status arguments
   * @param {string} userId - User identifier
   * @param {Object} toolContext - Tool context for extracting task ID
   * @returns {Object} - Status result
   */
  async getTaskStatus(args, userId, toolContext) {
    try {
      let { taskId } = args;
      
      // Try to extract task ID from user message if not provided
      if (!taskId && toolContext?.messageData?.message) {
        const message = toolContext.messageData.message;
        const taskIdMatch = message.match(/task[_\-\s]+([a-z0-9_\-]+)/i);
        if (taskIdMatch) {
          taskId = taskIdMatch[1];
        }
      }
      
      if (!taskId) {
        // List recent tasks if no ID provided
        return await this.listUserTasks({ limit: 5 }, userId);
      }

      const task = await this.taskQueueModel.getTask(taskId);
      
      if (!task) {
        return {
          success: false,
          message: `❌ Task not found: \`${taskId}\`\n\n*Use "my tasks" to see your active tasks.*`
        };
      }

      // Check if user owns this task
      if (task.createdBy !== userId) {
        return {
          success: false,
          message: '❌ Access denied: You can only view your own tasks'
        };
      }

      const statusEmoji = {
        'pending': '⏳',
        'running': '🔄',
        'completed': '✅',
        'failed': '❌',
        'cancelled': '🚫'
      };

      let statusMessage = `${statusEmoji[task.status] || '❓'} **Task Status: ${task.status.toUpperCase()}**\n\n`;
      statusMessage += `**Task ID:** \`${task.taskId}\`\n`;
      statusMessage += `**Template:** ${task.templateId}\n`;
      statusMessage += `**Created:** ${this.formatTimestamp(task.createdAt)}\n`;

      if (task.progress) {
        statusMessage += `**Progress:** ${task.progress.percentage || 0}%\n`;
        if (task.progress.message) {
          statusMessage += `**Current Step:** ${task.progress.message}\n`;
        }
        if (task.progress.data?.currentStep) {
          statusMessage += `**Step:** ${task.progress.data.stepsCompleted || 0}/${task.progress.data.stepsTotal || 1}\n`;
        }
      }

      if (task.execution?.workerId) {
        statusMessage += `**Worker:** ${task.execution.workerId}\n`;
      }

      if (task.status === 'completed' && task.result) {
        statusMessage += '\n**📄 Results:**\n';
        statusMessage += `- Execution Time: ${this.formatDuration(task.result.executionTime || 0)}\n`;
        if (task.result.summary) {
          statusMessage += `- Summary: ${task.result.summary}\n`;
        }
        if (task.result.attachments?.length > 0) {
          statusMessage += `- Attachments: ${task.result.attachments.length} files\n`;
          // Show download links for attachments
          task.result.attachments.forEach((attachment, index) => {
            statusMessage += `  ${index + 1}. **${attachment.name}** (${this.formatFileSize(attachment.size)})\n`;
            if (attachment.publicUrl) {
              statusMessage += `     Download: ${attachment.publicUrl}\n`;
            }
          });
        }
      }

      if (task.status === 'failed' && task.errors?.length > 0) {
        statusMessage += '\n**⚠️ Errors:**\n';
        const latestError = task.errors[task.errors.length - 1];
        statusMessage += `- ${latestError.type}: ${latestError.message}\n`;
        if (latestError.step) {
          statusMessage += `- Failed at step: ${latestError.step}\n`;
        }
      }

      // Add management options
      if (['pending', 'running'].includes(task.status)) {
        statusMessage += `\n*Use \`cancel task ${taskId}\` to stop this task.*`;
      }

      return {
        success: true,
        task,
        message: statusMessage
      };
    } catch (error) {
      this.log('error', 'Task status check failed', { taskId: args.taskId, error: error.message });
      throw error;
    }
  }

  /**
   * Cancel a running task
   * @param {Object} args - Cancel arguments
   * @param {string} userId - User identifier
   * @returns {Object} - Cancel result
   */
  async cancelTask(args, userId) {
    try {
      const { taskId } = args;
      
      if (!taskId) {
        throw new Error('Task ID is required for cancellation');
      }

      const task = await this.taskQueueModel.getTask(taskId);
      
      if (!task) {
        return {
          success: false,
          message: `❌ Task not found: \`${taskId}\``
        };
      }

      // Check if user owns this task
      if (task.createdBy !== userId) {
        return {
          success: false,
          message: '❌ Access denied: You can only cancel your own tasks'
        };
      }

      // Check if task can be cancelled
      if (['completed', 'failed', 'cancelled'].includes(task.status)) {
        return {
          success: false,
          message: `❌ Cannot cancel task in **${task.status}** state\n\n*Only pending or running tasks can be cancelled.*`
        };
      }

      // Cancel the task
      const success = await this.taskQueueModel.cancelTask(taskId);
      
      if (success) {
        this.log('info', 'Task cancelled by user', { taskId, userId });
        return {
          success: true,
          message: '🚫 **Task Cancelled**\n\n' +
                  `Task \`${taskId}\` has been cancelled and will stop execution.\n\n` +
                  `*The task was working on: ${task.templateId}*`
        };
      } else {
        throw new Error('Failed to cancel task in database');
      }
    } catch (error) {
      this.log('error', 'Task cancellation failed', { taskId: args.taskId, error: error.message });
      throw error;
    }
  }

  /**
   * List user tasks with filters
   * @param {Object} args - List arguments
   * @param {string} userId - User identifier
   * @returns {Object} - List result
   */
  async listUserTasks(args, userId) {
    try {
      const { includeCompleted = false, limit = 10 } = args;
      
      const statuses = includeCompleted 
        ? ['pending', 'running', 'completed', 'failed', 'cancelled']
        : ['pending', 'running'];
      
      const tasks = await this.taskQueueModel.getUserTasks(userId, statuses, limit);
      
      if (tasks.length === 0) {
        const statusText = includeCompleted ? 'any status' : 'pending/running';
        return {
          success: true,
          tasks: [],
          message: `📝 **No Tasks Found**\n\nYou don't have any tasks with ${statusText}.\n\n*Use "generate report" or similar commands to create new tasks.*`
        };
      }

      let message = `📝 **Your Tasks** (${tasks.length} found)\n\n`;
      
      tasks.forEach((task, index) => {
        const statusEmoji = {
          'pending': '⏳',
          'running': '🔄',
          'completed': '✅',
          'failed': '❌',
          'cancelled': '🚫'
        };

        message += `**${index + 1}. ${statusEmoji[task.status]} ${task.templateId}**\n`;
        message += `   ID: \`${task.taskId}\`\n`;
        message += `   Status: ${task.status}`;
        
        if (task.progress?.percentage) {
          message += ` (${task.progress.percentage}%)`;
        }
        
        message += `\n   Created: ${this.formatTimestamp(task.createdAt)}\n\n`;
      });

      message += '*Use `task status <task-id>` for detailed information.*';

      return {
        success: true,
        tasks,
        message
      };
    } catch (error) {
      this.log('error', 'Task listing failed', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Get task history (completed/failed tasks)
   * @param {Object} args - History arguments
   * @param {string} userId - User identifier
   * @returns {Object} - History result
   */
  async getTaskHistory(args, userId) {
    try {
      const { limit = 10 } = args;
      
      const tasks = await this.taskQueueModel.getUserTasks(
        userId, 
        ['completed', 'failed', 'cancelled'], 
        limit
      );
      
      if (tasks.length === 0) {
        return {
          success: true,
          tasks: [],
          message: '📜 **No Task History**\n\nYou don\'t have any completed tasks yet.'
        };
      }

      let message = `📜 **Task History** (${tasks.length} recent)\n\n`;
      
      tasks.forEach((task, index) => {
        const statusEmoji = {
          'completed': '✅',
          'failed': '❌',
          'cancelled': '🚫'
        };

        message += `**${index + 1}. ${statusEmoji[task.status]} ${task.templateId}**\n`;
        message += `   ID: \`${task.taskId}\`\n`;
        message += `   Completed: ${this.formatTimestamp(task.updatedAt)}\n`;
        
        if (task.result?.executionTime) {
          message += `   Duration: ${this.formatDuration(task.result.executionTime)}\n`;
        }
        
        if (task.result?.attachments?.length > 0) {
          message += `   Files: ${task.result.attachments.length} attachments\n`;
        }
        
        message += '\n';
      });

      message += '*Use `task status <task-id>` to view details and download files.*';

      return {
        success: true,
        tasks,
        message
      };
    } catch (error) {
      this.log('error', 'Task history retrieval failed', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Format file size for display
   * @param {number} bytes - File size in bytes
   * @returns {string} - Formatted file size
   */
  formatFileSize(bytes) {
    if (!bytes) {return '0 B';}
    
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${Math.round(size * 10) / 10} ${units[unitIndex]}`;
  }

  /**
   * Format duration in human-readable format
   * @param {number} ms - Duration in milliseconds
   * @returns {string} - Formatted duration
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Format timestamp for display
   * @param {*} timestamp - Firestore timestamp
   * @returns {string} - Formatted timestamp
   */
  formatTimestamp(timestamp) {
    if (!timestamp) {return 'Unknown';}
    
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleString();
    } catch (error) {
      return 'Invalid date';
    }
  }
}

module.exports = TaskManagementTool;