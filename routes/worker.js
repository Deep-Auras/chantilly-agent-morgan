const express = require('express');
const { logger } = require('../utils/logger');
const { getTaskQueueModel } = require('../models/taskQueue');
const { getTaskTemplatesModel } = require('../models/taskTemplates');
const { getTaskTemplateLoader } = require('../services/taskTemplateLoader');
const { convertForBitrixChat } = require('../utils/markdownToBB');

const router = express.Router();

/**
 * Worker execution endpoint for Google Cloud Tasks
 * 
 * This endpoint receives tasks from Cloud Tasks queue and executes them
 * using the template system. It runs in the same Cloud Run instance
 * but processes tasks asynchronously in the background.
 */

/**
 * Execute a task (called by Cloud Tasks)
 * POST /worker/execute
 */
router.post('/execute', async (req, res) => {
  const startTime = Date.now();
  let taskId = null;

  try {
    const { taskId: reqTaskId, templateId, parameters, userId, priority, enqueuedAt } = req.body;
    taskId = reqTaskId;

    logger.info('Worker received task execution request', {
      taskId,
      templateId,
      userId,
      priority,
      enqueuedAt,
      queueDelay: Date.now() - new Date(enqueuedAt).getTime()
    });

    // Validate required fields
    if (!taskId || !templateId || !userId) {
      throw new Error('Missing required fields: taskId, templateId, userId');
    }

    // Initialize services
    const taskQueueModel = getTaskQueueModel();
    const templateLoader = getTaskTemplateLoader();

    // Update task status to running
    await taskQueueModel.updateTask(taskId, {
      'status': 'running',
      'execution.startTime': new Date(),
      'execution.workerId': `cloudrun-${process.env.K_SERVICE || 'local'}`,
      'execution.lastHeartbeat': new Date()
    });

    logger.info('Task execution started', { taskId, templateId });

    // Send immediate response to Cloud Tasks
    res.status(200).json({
      success: true,
      taskId,
      status: 'started',
      message: 'Task execution started'
    });

    // Execute task asynchronously (don't await)
    executeTaskAsync(taskId, templateId, parameters, userId, taskQueueModel, templateLoader, startTime);

  } catch (error) {
    logger.error('Worker task execution failed', {
      taskId,
      error: error.message,
      stack: error.stack
    });

    // Try to update task status to failed
    if (taskId) {
      try {
        const taskQueueModel = getTaskQueueModel();
        await taskQueueModel.failTask(taskId, {
          type: 'worker_error',
          message: error.message,
          workerId: `cloudrun-${process.env.K_SERVICE || 'local'}`,
          executionTime: Date.now() - startTime
        });
      } catch (updateError) {
        logger.error('Failed to update task status to failed', {
          taskId,
          error: updateError.message
        });
      }
    }

    res.status(500).json({
      success: false,
      error: error.message,
      taskId
    });
  }
});

/**
 * Execute task asynchronously
 */
async function executeTaskAsync(taskId, templateId, parameters, userId, taskQueueModel, templateLoader, startTime) {
  let executor; // Declare executor outside try block for catch block access
  
  try {
    logger.info('Starting async task execution', { taskId, templateId });

    // Get full task data to access userMessage for AI date range detection
    const taskData = await taskQueueModel.getTask(taskId);

    // CRITICAL: If this is a retry task after auto-repair, clear the template cache
    // to ensure we load the latest repaired version, not the cached broken version
    if (taskData?.parentTaskId) {
      const templatesModel = getTaskTemplatesModel();
      templatesModel.clearCache();
      logger.info('Template cache cleared for retry task', {
        taskId,
        parentTaskId: taskData.parentTaskId,
        retryAttempt: taskData.retryAttempt,
        reason: 'ensure_latest_repaired_template'
      });
    }

    // Create execution context with user message
    const executionContext = createExecutionContext(taskId, userId, {
      userMessage: taskData?.userMessage,
      messageContext: taskData?.messageContext
    });

    // Create executor from template with original request context for auto-repair
    const originalRequest = {
      message: taskData?.userMessage || 'Task execution',
      context: taskData?.messageContext
    };

    executor = await templateLoader.createExecutor(templateId, {
      taskId,
      templateId,
      parameters,
      userId,
      context: executionContext
    }, originalRequest);

    logger.info('Task executor created successfully', { taskId, templateId });

    // Execute the task with timeout
    const timeoutMs = 3600000; // 1 hour max execution time
    const result = await Promise.race([
      executor.execute(),
      createExecutionTimeout(taskId, timeoutMs)
    ]);

    const executionTime = Date.now() - startTime;

    logger.info('Task execution completed successfully', {
      taskId,
      executionTime,
      hasAttachments: result.attachments?.length > 0
    });

    // Update task status to completed
    await taskQueueModel.completeTask(taskId, {
      ...result,
      executionTime,
      workerId: `cloudrun-${process.env.K_SERVICE || 'local'}`
    });

    // Send completion notification to user
    await sendTaskNotification(taskId, userId, 'completed', {
      executionTime,
      result
    });

    logger.info('Task completed and user notified', { taskId });

  } catch (error) {
    const executionTime = Date.now() - startTime;

    logger.error('Async task execution failed', {
      taskId,
      error: error.message,
      errorType: error.name,
      executionTime
    });

    // CRITICAL: Check if task was cancelled before attempting auto-repair
    // This prevents duplicate auto-repair attempts when cancel_all is invoked
    const currentTask = await taskQueueModel.getTask(taskId);
    if (currentTask && currentTask.status === 'cancelled') {
      logger.info('Task already cancelled before auto-repair, skipping', {
        taskId,
        cancelledAt: currentTask.cancelledAt,
        reason: 'prevent_auto_repair_on_cancelled_task'
      });
      return; // Exit early - don't attempt repair for cancelled tasks
    }

    // For testing mode tasks, attempt auto-repair through executor
    if (executor && executor.isTestingMode && executor.isTestingMode() && executor.handleError) {
      logger.info('Testing mode task failed, delegating to executor auto-repair', {
        taskId,
        errorType: error.name
      });
      
      try {
        await executor.handleError(error);
        return; // If handleError doesn't throw, it handled the error (retry, etc.)
      } catch (handleError) {
        // Check if the error is TaskCancelledError (ANY reason: auto_repair_retry, user_cancelled_during_repair, user_cancelled_before_repair)
        if (handleError.name === 'TaskCancelledError') {
          logger.info('Task was cancelled, skipping worker auto-repair', {
            taskId,
            retryTaskId: handleError.retryTaskId,
            reason: handleError.reason || 'unknown'
          });
          return; // Task cancelled - don't continue with worker error handling
        }

        logger.warn('Executor auto-repair failed, proceeding with normal error handling', {
          taskId,
          handleError: handleError.message
        });
      }
    }

    // Handle cancellation differently than failures
    if (error.name === 'TaskCancelledError') {
      logger.info('Task execution cancelled by user', {
        taskId,
        executionTime
      });
      
      // Task status is already set to cancelled, just send notification
      await sendTaskNotification(taskId, userId, 'cancelled', {
        executionTime
      });
      
      logger.info('Task cancellation confirmed and user notified', { taskId });
    } else {
      // Update task status to failed for actual errors
      await taskQueueModel.failTask(taskId, {
        type: 'execution_error',
        message: error.message,
        workerId: `cloudrun-${process.env.K_SERVICE || 'local'}`,
        executionTime
      });

      // Send failure notification to user
      await sendTaskNotification(taskId, userId, 'failed', {
        executionTime,
        error: {
          type: error.name,
          message: error.message
        }
      });

      logger.info('Task failed and user notified', { taskId });
    }
  }
}

/**
 * Create execution context for task
 */
function createExecutionContext(taskId, userId, additionalContext = {}) {
  return {
    taskId,
    userId,
    workerId: `cloudrun-${process.env.K_SERVICE || 'local'}`,
    sendMessage: async (type, data) => {
      logger.info('Task progress update', { taskId, type, data });

      // Send actual Bitrix24 messages for repair notifications
      try {
        const queueService = require('../services/bitrix24-queue').getQueueManager();
        if (queueService && (type === 'TASK_REPAIR_STARTED' || type === 'TASK_AUTO_REPAIRED')) {
          // Get task to access messageContext for proper routing
          const taskQueueModel = getTaskQueueModel();
          const task = await taskQueueModel.getTask(taskId);
          const messageContext = task?.messageContext;

          // Use same routing logic as completion notifications
          let repairTargetDialogId = userId.toString();
          let repairMentionUser = false;

          const repairChatId = messageContext?.chatId;
          const repairDialogId = messageContext?.dialogId;

          // Priority 1: Use chatId if available and different from userId
          if (repairChatId && repairChatId.toString() !== userId.toString()) {
            repairTargetDialogId = `chat${repairChatId}`;
            repairMentionUser = true;
          }
          // Priority 2: Use dialogId if it's different from userId
          else if (repairDialogId && repairDialogId.toString() !== userId.toString()) {
            repairTargetDialogId = repairDialogId.toString();
            repairMentionUser = true;
          }

          let message = '';
          const userPrefix = repairMentionUser ? `[USER=${userId}][/USER] ` : '';

          if (type === 'TASK_REPAIR_STARTED') {
            message = `${userPrefix}🔧 **Auto-Repair Started**\n\nYour task is experiencing issues and I'm attempting to fix it automatically. This may take ${data.estimatedRepairTime || '1-2 minutes'}.\n\n**Task:** ${data.templateName}\n**Issue:** ${data.errorType}\n**Repair Attempt:** ${data.repairAttempt}\n\nI'll notify you once the repair is complete.`;
          } else if (type === 'TASK_AUTO_REPAIRED') {
            message = `${userPrefix}✅ **Auto-Repair Successful**\n\nI've successfully fixed the issue and created a retry task. Your analysis should continue shortly.\n\n**Task:** ${data.taskId}\n**Repair Attempt:** ${data.repairResult?.repairAttempt || 'N/A'}\n\nThe task will restart automatically with the improved code.`;
          }

          if (message) {
            await queueService.add({
              method: 'imbot.message.add',
              params: {
                DIALOG_ID: repairTargetDialogId,
                MESSAGE: message
              }
            });

            logger.info('Repair notification routed', {
              taskId,
              type,
              targetDialogId: repairTargetDialogId,
              mentionUser: repairMentionUser,
              chatId: repairChatId,
              dialogId: repairDialogId
            });
          }
        }
      } catch (error) {
        logger.error('Failed to send repair notification message', {
          taskId,
          type,
          error: error.message
        });
      }
    },
    db: getTaskQueueModel().db,
    genAI: require('../config/gemini').getGeminiClient(),
    queueService: require('../services/bitrix24-queue').getQueueManager(), // Bitrix24 API queue
    fileStorage: require('../utils/fileStorage').fileStorageManager,
    rateLimiters: {
      bitrix24: createRateLimiter('bitrix24', 2000),
      gemini: createRateLimiter('gemini', 1000)
    },
    // Add user message context for AI date range detection in templates
    userMessage: additionalContext.userMessage,
    messageContext: additionalContext.messageContext
  };
}

/**
 * Create simple rate limiter
 */
function createRateLimiter(name, delay) {
  let lastCall = 0;
  
  return {
    async wait() {
      const now = Date.now();
      const timeSinceLastCall = now - lastCall;
      
      if (timeSinceLastCall < delay) {
        const waitTime = delay - timeSinceLastCall;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      lastCall = Date.now();
    }
  };
}

/**
 * Create execution timeout
 */
function createExecutionTimeout(taskId, timeoutMs) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Task execution timeout: ${taskId} (${timeoutMs}ms)`));
    }, timeoutMs);
  });
}

/**
 * Send task notification to user via Bitrix24
 */
async function sendTaskNotification(taskId, userId, status, details) {
  try {
    const { getQueueManager } = require('../services/bitrix24-queue');
    const queueService = getQueueManager();
    
    // Get task details
    const taskQueueModel = getTaskQueueModel();
    const task = await taskQueueModel.getTask(taskId);
    
    if (!task) {
      logger.warn('Task not found for notification', { taskId });
      return;
    }

    // Determine notification target: group chat vs direct user
    const messageContext = task.messageContext;
    let targetDialogId = userId.toString(); // Default to direct user
    let mentionUser = false;

    // Check both chatId and dialogId to determine if this was a group chat
    const chatId = messageContext?.chatId;
    const dialogId = messageContext?.dialogId;

    // Priority 1: Use chatId if available and different from userId
    if (chatId && chatId.toString() !== userId.toString()) {
      // Format as chat dialog ID for Bitrix24 API
      targetDialogId = `chat${chatId}`;
      mentionUser = true;

      logger.info('Task notification routing to group chat (via chatId)', {
        taskId,
        originalUser: userId,
        chatId,
        targetDialog: targetDialogId,
        mentionUser
      });
    }
    // Priority 2: Use dialogId if it's different from userId (fallback)
    else if (dialogId && dialogId.toString() !== userId.toString()) {
      targetDialogId = dialogId.toString();
      mentionUser = true;

      logger.info('Task notification routing to group chat (via dialogId)', {
        taskId,
        originalUser: userId,
        dialogId,
        targetDialog: targetDialogId,
        mentionUser
      });
    } else {
      logger.info('Task notification routing to direct user', {
        taskId,
        userId,
        chatId,
        dialogId
      });
    }

    let message = '';
    const templateName = task.templateId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    // Add user mention for group chats
    const userPrefix = mentionUser ? `[USER=${userId}][/USER] ` : '';
    
    switch (status) {
    case 'completed':
      message = '✅ **Task Completed!**\n\n';
      message += `${userPrefix}Your **${templateName}** task has finished successfully.\n\n`;
      message += `**Task ID:** \`${taskId}\`\n`;
      message += `**Duration:** ${formatDuration(details.executionTime)}\n`;
        
      if (details.result?.summary) {
        message += `**Summary:** ${details.result.summary}\n`;
      }
        
      if (details.result?.attachments?.length > 0) {
        message += `**Files Generated:** ${details.result.attachments.length}\n`;
        details.result.attachments.forEach((attachment, index) => {
          message += `${index + 1}. **${attachment.name}** (${formatFileSize(attachment.size)})\n`;
          if (attachment.publicUrl) {
            message += `   Download: ${attachment.publicUrl}\n`;
          }
        });
      }
      break;
        
    case 'failed':
      message = '❌ **Task Failed**\n\n';
      message += `${userPrefix}Your **${templateName}** task encountered an error and could not complete.\n\n`;
      message += `**Task ID:** \`${taskId}\`\n`;
      message += `**Duration:** ${formatDuration(details.executionTime)}\n`;
      message += `**Error:** ${details.error.message}\n\n`;
      message += '*Please try creating the task again or contact support if the issue persists.*';
      break;
        
    case 'cancelled':
      message = '🚫 **Task Cancelled**\n\n';
      message += `${userPrefix}Your **${templateName}** task was cancelled as requested.\n\n`;
      message += `**Task ID:** \`${taskId}\`\n`;
      message += `**Duration:** ${formatDuration(details.executionTime)}\n\n`;
      message += '*The task was stopped and no files were generated.*';
      break;
    }
    
    // Convert markdown to Bitrix24 BB code
    const bbMessage = convertForBitrixChat(message);
    
    // Send notification via queue (handles rate limiting)
    await queueService.add({
      method: 'imbot.message.add',
      params: {
        DIALOG_ID: targetDialogId,
        MESSAGE: bbMessage
      }
    });
    
    logger.info('Task notification sent', {
      taskId,
      userId,
      targetDialogId,
      mentionUser,
      status
    });
    
  } catch (error) {
    logger.error('Failed to send task notification', {
      taskId,
      status,
      error: error.message
    });
    // Don't throw - notification failure shouldn't affect task completion
  }
}

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
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
 */
function formatDuration(ms) {
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
 * Health check endpoint for worker
 */
router.get('/health', async (req, res) => {
  try {
    // Check if we can access the database
    const taskQueueModel = getTaskQueueModel();
    await taskQueueModel.initialize();
    
    res.json({
      status: 'healthy',
      service: 'worker',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

module.exports = router;