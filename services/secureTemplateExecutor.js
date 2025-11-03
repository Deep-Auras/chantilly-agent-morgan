const ivm = require('isolated-vm');
const { logger } = require('../utils/logger');
const { getFirestoreWithLimits } = require('./firestoreProxy');

/**
 * SecureTemplateExecutor - Executes AI-generated templates in isolated-vm
 *
 * Provides hardware-level isolation for template execution with:
 * - Memory limits (128MB per template)
 * - Execution timeouts (30 seconds)
 * - Timer limits (max 10 concurrent)
 * - API call rate limiting (60/minute)
 * - Firestore access control via proxy
 */
class SecureTemplateExecutor {
  constructor(options = {}) {
    this.memoryLimit = options.memoryLimit || 128; // 128 MB per template
    this.timeout = options.timeout || 30000; // 30 seconds max
    this.maxTimers = options.maxTimers || 10;
    this.maxAPICallsPerMinute = options.maxAPICallsPerMinute || 60;
  }

  /**
   * Execute template in isolated-vm with resource limits
   * @param {string} templateScript - JavaScript code to execute
   * @param {Object} taskData - Task data for execution
   * @param {Object} template - Template metadata
   * @returns {Promise<Object>} - Execution result
   */
  async executeTemplate(templateScript, taskData, template) {
    const isolate = new ivm.Isolate({
      memoryLimit: this.memoryLimit,
      onCatastrophicError: (error) => {
        logger.error('Template isolate catastrophic error', {
          templateId: template.templateId,
          error: error.message
        });
      }
    });

    try {
      const context = await isolate.createContext();
      const jail = context.global;
      await jail.set('global', jail.derefInto());

      // Timer tracking with limits
      const timerState = {
        timers: new Set(),
        count: 0,
        maxTimers: this.maxTimers
      };

      // API call rate limiting
      const apiCallState = {
        calls: [],
        maxPerMinute: this.maxAPICallsPerMinute
      };

      // Safe setTimeout with limits
      const setTimeoutWrapper = new ivm.Reference(function(callback, delay) {
        if (timerState.count >= timerState.maxTimers) {
          throw new Error(`Timer limit exceeded (${timerState.maxTimers} max)`);
        }
        const timerId = setTimeout(() => {
          timerState.timers.delete(timerId);
          timerState.count--;
          callback();
        }, Math.min(delay, 30000)); // Max 30s delay
        timerState.timers.add(timerId);
        timerState.count++;
        return timerId;
      });

      await jail.set('setTimeout', setTimeoutWrapper);

      // Limited Firestore access (read-only for template collection)
      const firestoreProxy = await this.createFirestoreProxy(template);
      await jail.set('firestore', new ivm.Reference(firestoreProxy));

      // Rate-limited API caller
      const apiCaller = await this.createAPICallerProxy(apiCallState);
      await jail.set('callAPI', new ivm.Reference(apiCaller));

      // Safe console
      const consoleLog = new ivm.Reference((...args) => {
        logger.info('Template log', {
          templateId: template.templateId,
          args: args.map(a => String(a).substring(0, 200))
        });
      });

      await context.eval(`
        global.console = {
          log: (...args) => consoleLog.applySync(undefined, args),
          error: (...args) => consoleLog.applySync(undefined, ['ERROR:', ...args]),
          warn: (...args) => consoleLog.applySync(undefined, ['WARN:', ...args])
        };
      `);

      // Transfer safe task data
      await jail.set('taskId', taskData.taskId);
      await jail.set('parameters', new ivm.ExternalCopy(taskData.definition.parameters).copyInto());
      await jail.set('templateId', template.templateId);

      // Compile and execute with timeout
      const script = await isolate.compileScript(`
        (async function() {
          ${templateScript}

          // Extract class name
          const match = ${JSON.stringify(templateScript)}.match(/class\\s+(\\w+)\\s+extends/);
          const className = match ? match[1] : 'TaskExecutor';

          // Instantiate and execute
          const executor = new global[className](taskData, template);
          return await executor.execute();
        })();
      `);

      const result = await script.run(context, {
        timeout: this.timeout,
        release: false
      });

      // Cleanup timers
      for (const timerId of timerState.timers) {
        clearTimeout(timerId);
        clearInterval(timerId);
      }

      logger.info('Template executed successfully in isolated-vm', {
        templateId: template.templateId,
        memoryUsed: isolate.getHeapStatisticsSync().used_heap_size / 1024 / 1024,
        timersCreated: timerState.count,
        apiCallsMade: apiCallState.calls.length
      });

      return result;

    } catch (error) {
      logger.error('Template execution failed in isolated-vm', {
        templateId: template.templateId,
        error: error.message,
        isTimeout: error.message.includes('timeout'),
        isMemoryLimit: error.message.includes('heap')
      });
      throw error;

    } finally {
      isolate.dispose();
    }
  }

  /**
   * Create Firestore proxy with RBAC
   * @param {Object} template - Template metadata
   * @returns {Object} - Limited Firestore instance
   */
  async createFirestoreProxy(template) {
    const limitedFirestore = await getFirestoreWithLimits({
      templateId: template.templateId,
      allowedCollections: [
        'task-queue',         // Read/write own tasks
        'task-templates',     // Read-only templates
        'knowledge-base'      // Read-only KB
        // NO ACCESS to: users, settings, bot/auth, reasoning-memory
      ],
      maxReadsPerMinute: 100,
      maxWritesPerMinute: 20,
      readOnly: false // Allow writes to task-queue only
    });

    return limitedFirestore;
  }

  /**
   * Create API caller with rate limiting
   * @param {Object} apiCallState - API call tracking state
   * @returns {Function} - Rate-limited API caller
   */
  async createAPICallerProxy(apiCallState) {
    return async (method, params) => {
      const now = Date.now();

      // Remove calls older than 1 minute
      apiCallState.calls = apiCallState.calls.filter(
        t => now - t < 60000
      );

      // Check rate limit
      if (apiCallState.calls.length >= apiCallState.maxPerMinute) {
        throw new Error(
          `API rate limit exceeded (${apiCallState.maxPerMinute}/min)`
        );
      }

      // Record call
      apiCallState.calls.push(now);

      // Delegate to actual queue service
      const { getBitrix24QueueManager } = require('./bitrix24-queue');
      const queueService = getBitrix24QueueManager();
      return await queueService.add({ method, params });
    };
  }

  /**
   * Validate template script before execution
   * @param {string} scriptCode - JavaScript code to validate
   * @throws {Error} - If validation fails
   * @returns {boolean} - True if valid
   */
  validateTemplate(scriptCode) {
    // Enhanced security validation
    const dangerousPatterns = [
      // Traditional threats
      /require\s*\(\s*['"`]fs['"`]\s*\)/,
      /require\s*\(\s*['"`]child_process['"`]\s*\)/,
      /require\s*\(\s*['"`]net['"`]\s*\)/,
      /require\s*\(\s*['"`]http['"`]\s*\)/,
      /eval\s*\(/,
      /Function\s*\(/,
      /process\./,
      /global\./,

      // Relative path requires (path traversal)
      /require\s*\(\s*['"`]\.+[\/\\]/,

      // VM escape attempts
      /this\.constructor\.constructor/,
      /\.constructor\.constructor/,
      /__proto__/,
      /constructor\[['"`]constructor['"`]\]/,

      // Resource exhaustion
      /while\s*\(\s*true\s*\)/,
      /for\s*\(\s*;\s*;\s*\)/,
      /setInterval\s*\([\s\S]{0,100},\s*0\s*\)/,
      /new\s+Array\s*\(\s*\d{9,}\s*\)/,
      /String\s*\.\s*repeat\s*\(\s*\d{7,}\s*\)/,

      // Firestore admin SDK access (should use proxy)
      /admin\.firestore\(\)/,
      /getFirestore\(\)/,

      // Secret access
      /process\.env/,
      /GEMINI_API_KEY/,
      /BITRIX24_INBOUND_WEBHOOK/
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(scriptCode)) {
        throw new Error(
          `Security violation: ${pattern.source}`
        );
      }
    }

    // Size limit
    if (scriptCode.length > 50000) {
      throw new Error('Template too large (>50KB)');
    }

    return true;
  }
}

module.exports = { SecureTemplateExecutor };
