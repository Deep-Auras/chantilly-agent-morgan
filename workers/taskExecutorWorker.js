const { parentPort, workerData } = require('worker_threads');
const { getTaskTemplateLoader } = require('../services/taskTemplateLoader');
const { logger } = require('../utils/logger');

/**
 * Task Executor Worker - Runs in isolated worker thread
 *
 * Executes task template with resource limits enforced by parent
 * Returns both result and executor metadata for memory extraction
 */
(async () => {
  let executor = null;
  let executionSucceeded = false;

  try {
    const { taskId, taskData, maxMemoryMB } = workerData;

    // Load and execute template in isolated worker
    const loader = getTaskTemplateLoader();
    executor = await loader.createExecutor(
      taskData.templateId,
      taskData
    );

    const result = await executor.execute();
    executionSucceeded = true;

    // ===== Phase 2.3 & 3.1: Update memory statistics in isolated worker =====
    const config = require('../config/env');
    if (config.REASONING_MEMORY_ENABLED && executor.memoryContext) {
      try {
        // Update memory statistics for memories used in this execution
        const memoryIds = executor.memoryContext.memories.map(m => m.id);
        await executor.updateMemoryStatistics(memoryIds, true);

        // Track generation memory success
        await executor.trackGenerationMemorySuccess(true);

        logger.debug('Memory statistics updated in isolated worker', {
          taskId,
          memoriesUpdated: memoryIds.length
        });
      } catch (statsError) {
        logger.error('Failed to update memory statistics in isolated worker', {
          taskId,
          error: statsError.message
        });
      }
    }
    // ===== End Phase 2.3 & 3.1 =====

    // Return result with executor metadata for trajectory extraction
    parentPort.postMessage({
      success: true,
      result,
      executorMetadata: {
        template: {
          templateId: executor.template?.templateId || executor.template?.id,
          name: executor.template?.name,
          description: executor.template?.description
        },
        parameters: executor.parameters || {},
        progressSteps: executor.progressSteps || [],
        resourceUsage: executor.resourceUsage || 'N/A',
        memoryContext: executor.memoryContext ? {
          memories: executor.memoryContext.memories.map(m => ({ id: m.id }))
        } : null,
        hasGenerationMetadata: !!executor.template?.generationMetadata
      }
    });

  } catch (error) {
    // ===== Phase 2.3 & 3.1: Update memory statistics on failure =====
    const config = require('../config/env');
    if (config.REASONING_MEMORY_ENABLED && executor?.memoryContext) {
      try {
        const memoryIds = executor.memoryContext.memories.map(m => m.id);
        await executor.updateMemoryStatistics(memoryIds, false);
        await executor.trackGenerationMemorySuccess(false);

        logger.debug('Memory statistics updated for failed task in isolated worker', {
          taskId: workerData.taskId,
          memoriesUpdated: memoryIds.length
        });
      } catch (statsError) {
        logger.error('Failed to update memory statistics on failure', {
          taskId: workerData.taskId,
          error: statsError.message
        });
      }
    }
    // ===== End Phase 2.3 & 3.1 =====

    parentPort.postMessage({
      success: false,
      error: error.message,
      stack: error.stack,
      executorMetadata: executor ? {
        template: {
          templateId: executor.template?.templateId || executor.template?.id,
          name: executor.template?.name,
          description: executor.template?.description
        },
        parameters: executor.parameters || {},
        progressSteps: executor.progressSteps || [],
        currentStep: executor.currentStep || 'unknown',
        memoryContext: executor.memoryContext ? {
          memories: executor.memoryContext.memories.map(m => ({ id: m.id }))
        } : null,
        hasGenerationMetadata: !!executor.template?.generationMetadata
      } : null
    });
  }
})();
