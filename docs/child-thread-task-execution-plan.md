# Chantilly Agent: Child Thread Task Execution Implementation Plan

## Executive Summary

This plan outlines the implementation of a comprehensive child thread task execution system for Chantilly Agent, enabling complex multi-step operations like automated invoice reporting with client context analysis. The system leverages Firestore for task queue management, Node.js worker threads for parallel processing, and Google Gemini API for AI-powered analysis.

## Current Architecture Analysis

### Existing Chantilly Strengths
✅ **Proven Tool System**: Priority-based tool execution with 100+ tools working successfully  
✅ **Gemini 2.5 Pro Integration**: Function calling and complex AI interactions fully operational  
✅ **Firestore Infrastructure**: Robust database schema for settings, queue state, and knowledge base  
✅ **Security Architecture**: OWASP-compliant with comprehensive input validation and sanitization  
✅ **Rate Limiting**: Battle-tested Bitrix24 API queue system with fail-fast approach  

### Current Limitations for Complex Tasks
❌ **Synchronous Processing**: Tools execute sequentially, blocking main thread for complex operations  
❌ **No Task Persistence**: Complex operations cannot be paused, resumed, or tracked long-term  
❌ **Memory Constraints**: Large datasets risk memory exhaustion in main process  
❌ **No Progress Tracking**: Users have no visibility into multi-step operation progress  
❌ **Limited Scalability**: Cannot handle multiple complex operations simultaneously  

## Technical Feasibility Assessment

### ✅ CONFIRMED FEASIBLE

Based on research of 2025 patterns and current Chantilly architecture:

1. **Google Gemini API Compatibility**:
   - Stateless API perfect for worker threads
   - Each child process can maintain independent Gemini client
   - Function calling works identically in isolated processes
   - No shared state issues

2. **Node.js Worker Thread Maturity**:
   - Worker threads stable since Node.js v12, mature in v18+
   - Memory isolation prevents crashes from affecting main process
   - Message passing enables real-time progress updates
   - SharedArrayBuffer for efficient data transfer when needed

3. **Firestore Task Queue Capabilities**:
   - Real-time listeners for task status monitoring
   - Atomic operations for race condition prevention
   - TTL (Time To Live) for automatic cleanup
   - Efficient querying with compound indexes

4. **Chantilly Tool Ecosystem Compatibility**:
   - Tools extend BaseTool class - can be loaded in child processes
   - Dynamic tool loading already implemented
   - Context sanitization system ready for cross-process use
   - Rate limiting per child process prevents API abuse

## Dynamic Task Template System

### Task Creation Flow and Logic Storage

This system uses **dynamic task templates** stored in Firestore that contain both configuration and executable JavaScript code, enabling flexible task creation without hardcoded worker logic.

#### Task Creation Methods:

1. **Natural Language Auto-Detection**:
   ```
   User: "Generate comprehensive invoice report for 2024"
   Chantilly: [Detects pattern] → [Finds template] → [Extracts parameters with AI] → [Creates task]
   ```

2. **Direct Template Usage**:
   ```javascript
   const result = await orchestrator.createTaskFromTemplate(
     'invoice_report_v2', 
     parameters, 
     userId
   );
   ```

3. **API Integration**:
   ```javascript
   POST /api/tasks
   {
     "templateId": "invoice_report_v2",
     "parameters": { "dateRange": {...} }
   }
   ```

### 1. Task Template Storage Schema (Firestore)

```javascript
// Collection: task-templates
{
  templateId: "invoice_report_v2",
  name: "Comprehensive Invoice Report",
  description: "Generates detailed invoice analysis with client context",
  version: "2.1.0",
  category: "financial_reporting",
  
  // Task definition template
  definition: {
    estimatedSteps: 8,
    estimatedDuration: 600000, // 10 minutes base
    requiredTools: ["KnowledgeManagement", "WebSearch"],
    memoryRequirement: "512MB",
    cpuIntensive: true,
    
    // Dynamic parameter schema (JSON Schema)
    parameterSchema: {
      type: "object",
      properties: {
        dateRange: {
          type: "object",
          required: true,
          properties: {
            start: { type: "string", format: "date" },
            end: { type: "string", format: "date" }
          }
        },
        clientFilters: {
          type: "array",
          items: { type: "string" },
          default: ["active"]
        },
        includeServices: { type: "boolean", default: true },
        outputFormat: { 
          type: "string", 
          enum: ["summary", "detailed", "executive"], 
          default: "detailed" 
        }
      }
    }
  },
  
  // Execution workflow as JavaScript code
  executionScript: `
    class InvoiceReportExecutor extends BaseTaskExecutor {
      async execute() {
        // Step 1: Validate parameters
        await this.validateParameters();
        this.updateProgress(5, 'Parameters validated');
        
        // Step 2: Fetch invoices with streaming
        const invoices = await this.fetchInvoicesWithStreaming(this.parameters.dateRange);
        this.updateProgress(25, \`Fetched \${invoices.length} invoices\`);
        
        // Step 3: Enrich with client data
        const enrichedData = await this.enrichWithClientData(invoices);
        this.updateProgress(50, 'Client data enriched');
        
        // Step 4: AI analysis with knowledge context
        const analysis = await this.performAIAnalysis(enrichedData);
        this.updateProgress(75, 'AI analysis completed');
        
        // Step 5: Generate reports and attachments
        const results = await this.generateReports(analysis);
        this.updateProgress(100, 'Report generation completed');
        
        return results;
      }
      
      async fetchInvoicesWithStreaming(dateRange) {
        // Custom logic for this template
        const query = {
          start_date: dateRange.start,
          end_date: dateRange.end,
          status: this.parameters.clientFilters
        };
        
        return await this.streamingFetch('crm.invoice.list', query, {
          batchSize: 50,
          progressCallback: (processed, total) => {
            const percent = 5 + (processed / total) * 20;
            this.updateProgress(percent, \`Fetched \${processed}/\${total} invoices\`);
          }
        });
      }
      
      async performAIAnalysis(data) {
        const prompt = this.buildAnalysisPrompt(data);
        return await this.callGemini(prompt, {
          model: 'gemini-2.0-flash-exp',
          temperature: 0.1,
          maxTokens: 8192
        });
      }
      
      buildAnalysisPrompt(data) {
        return \`Analyze these \${data.length} invoices for patterns and insights:
        
        Focus on:
        1. Revenue trends and patterns
        2. Client payment behavior  
        3. Service utilization analysis
        4. Risk factors and opportunities
        
        Data: \${JSON.stringify(data, null, 2)}\`;
      }
    }
  `,
  
  // Trigger patterns for auto-detection
  triggers: {
    patterns: [
      /generate.*invoice.*report/i,
      /revenue.*analysis.*report/i,
      /financial.*summary.*\d{4}/i,
      /invoice.*analytics/i
    ],
    keywords: ["invoice", "revenue", "financial", "billing", "payment"],
    contexts: ["financial_reporting", "business_analysis"]
  },
  
  // Output configuration
  outputs: {
    attachments: [
      {
        type: "pdf",
        template: "invoice_report_template.pdf",
        filename: "invoice_report_{date}.pdf"
      },
      {
        type: "json", 
        filename: "invoice_data_{date}.json"
      },
      {
        type: "csv",
        filename: "overdue_accounts_{date}.csv"
      }
    ],
    notifications: {
      onComplete: true,
      channels: ["originating_chat", "email"],
      template: "invoice_report_completion"
    }
  },
  
  // Metadata
  createdBy: "admin@company.com",
  createdAt: "2025-10-08T10:00:00Z",
  updatedAt: "2025-10-08T10:00:00Z",
  tags: ["finance", "reporting", "automation"],
  enabled: true,
  tested: true
}
```

### 2. Dynamic Task Template Loader

```javascript
// services/taskTemplateLoader.js
class TaskTemplateLoader {
  constructor() {
    this.db = admin.firestore();
    this.templateCache = new Map();
    this.executorCache = new Map();
  }

  async loadTemplate(templateId) {
    // Check cache first
    if (this.templateCache.has(templateId)) {
      return this.templateCache.get(templateId);
    }

    // Load from Firestore
    const doc = await this.db.collection('task-templates').doc(templateId).get();
    if (!doc.exists) {
      throw new Error(`Task template not found: ${templateId}`);
    }

    const template = doc.data();
    
    // Validate template structure
    await this.validateTemplate(template);
    
    // Cache it
    this.templateCache.set(templateId, template);
    
    return template;
  }

  async createExecutor(templateId, taskData) {
    const template = await this.loadTemplate(templateId);
    
    // Check if executor is already compiled and cached
    if (this.executorCache.has(templateId)) {
      const ExecutorClass = this.executorCache.get(templateId);
      return new ExecutorClass(taskData, template);
    }

    // Compile the execution script
    const ExecutorClass = await this.compileExecutorScript(template.executionScript, template);
    
    // Cache the compiled class
    this.executorCache.set(templateId, ExecutorClass);
    
    return new ExecutorClass(taskData, template);
  }

  async compileExecutorScript(scriptCode, template) {
    // Security: Validate script before execution
    await this.validateExecutionScript(scriptCode);
    
    // Create a secure execution context
    const context = this.createSecureContext(template);
    
    // Compile the script
    const compiledScript = new vm.Script(`
      ${scriptCode}
      
      // Return the executor class
      return InvoiceReportExecutor; // Or extract class name dynamically
    `);
    
    // Execute in secure context to get the class
    const ExecutorClass = compiledScript.runInContext(context);
    
    return ExecutorClass;
  }

  createSecureContext(template) {
    // Create a sandbox with limited access
    const sandbox = {
      // Safe globals
      console: console,
      setTimeout: setTimeout,
      setInterval: setInterval,
      clearTimeout: clearTimeout,
      clearInterval: clearInterval,
      
      // Chantilly-specific utilities
      BaseTaskExecutor: require('./baseTaskExecutor'),
      admin: admin, // Firestore access
      
      // Utility functions
      JSON: JSON,
      Math: Math,
      Date: Date,
      
      // Required modules (limited set)
      require: (module) => {
        const allowedModules = [
          'axios',
          'lodash',
          'moment',
          './utils/dataProcessor',
          './utils/reportGenerator'
        ];
        
        if (allowedModules.includes(module)) {
          return require(module);
        }
        
        throw new Error(`Module not allowed: ${module}`);
      }
    };
    
    return vm.createContext(sandbox);
  }

  async findTemplateByTrigger(message, context) {
    // Load all active templates (cached)
    const templates = await this.loadActiveTemplates();
    
    // Score templates by relevance
    const scored = templates.map(template => ({
      template,
      score: this.calculateRelevanceScore(template, message, context)
    }));
    
    // Sort by score and return best match
    scored.sort((a, b) => b.score - a.score);
    
    if (scored[0]?.score > 0.7) { // Minimum confidence threshold
      return scored[0].template;
    }
    
    return null;
  }

  calculateRelevanceScore(template, message, context) {
    let score = 0;
    
    // Pattern matching
    for (const pattern of template.triggers.patterns) {
      if (pattern.test(message)) {
        score += 0.4;
        break;
      }
    }
    
    // Keyword matching
    const messageWords = message.toLowerCase().split(/\s+/);
    const keywordMatches = template.triggers.keywords.filter(keyword => 
      messageWords.some(word => word.includes(keyword.toLowerCase()))
    );
    score += (keywordMatches.length / template.triggers.keywords.length) * 0.3;
    
    // Context matching
    if (template.triggers.contexts.includes(context.category)) {
      score += 0.3;
    }
    
    return Math.min(score, 1.0);
  }
}
```

### 3. Enhanced Task Orchestrator with Template Support

```javascript
// Enhanced TaskOrchestrator with template support
class TaskOrchestrator {
  constructor() {
    this.templateLoader = new TaskTemplateLoader();
    this.db = admin.firestore();
    this.workerPool = new WorkerPool({
      maxWorkers: 4,
      workerScript: './workers/complexTaskWorker.js'
    });
    this.taskQueue = new PriorityQueue();
    this.monitoringInterval = null;
  }

  async createTaskFromTemplate(templateId, parameters, userId, options = {}) {
    // Load template
    const template = await this.templateLoader.loadTemplate(templateId);
    
    // Validate parameters against schema
    await this.validateParameters(parameters, template.definition.parameterSchema);
    
    // Create task with template reference
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const task = {
      taskId,
      templateId,
      templateVersion: template.version,
      type: template.category,
      status: 'pending',
      priority: options.priority || 50,
      
      definition: {
        ...template.definition,
        parameters,
        executionScript: template.executionScript // Store script with task
      },
      
      createdBy: userId,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + (options.ttlDays || 7) * 24 * 60 * 60 * 1000)
    };

    await this.db.collection('task-queue').doc(taskId).set(task);
    
    return {
      taskId,
      template,
      message: `✅ Task created using template: ${template.name}`,
      estimation: template.definition
    };
  }

  async autoCreateFromMessage(message, context, userId) {
    // Find matching template
    const template = await this.templateLoader.findTemplateByTrigger(message, context);
    
    if (!template) {
      return null; // No matching template found
    }
    
    // Extract parameters from message using AI
    const parameters = await this.extractParametersWithAI(message, template);
    
    // Create task
    return await this.createTaskFromTemplate(template.templateId, parameters, userId);
  }

  async extractParametersWithAI(message, template) {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    
    const prompt = `Extract task parameters from this user message for the "${template.name}" template.

User Message: "${message}"

Parameter Schema:
${JSON.stringify(template.definition.parameterSchema, null, 2)}

Return valid JSON object with extracted parameters. Use reasonable defaults for missing values.
Today's date: ${new Date().toISOString().split('T')[0]}

Example output:
{
  "dateRange": {
    "start": "2024-01-01",
    "end": "2024-12-31"
  },
  "clientFilters": ["active"],
  "includeServices": true,
  "outputFormat": "detailed"
}`;

    const result = await model.generateContent(prompt);
    const extractedParams = JSON.parse(result.response.text());
    
    return extractedParams;
  }

  // ... rest of existing TaskOrchestrator methods
}
```

### 4. Enhanced Worker with Template Execution

```javascript
// Enhanced worker that uses templates
class ComplexTaskWorker {
  constructor() {
    this.templateLoader = new TaskTemplateLoader();
    // ... existing constructor code
  }

  async executeTask(task) {
    try {
      // Load and create executor from template
      const executor = await this.templateLoader.createExecutor(
        task.templateId, 
        {
          taskId: task.taskId,
          parameters: task.definition.parameters,
          context: this.createExecutionContext()
        }
      );
      
      // Execute the templated logic
      const result = await executor.execute();
      
      this.sendMessage('TASK_COMPLETED', {
        taskId: task.taskId,
        workerId: this.workerId,
        ...result
      });
      
    } catch (error) {
      this.sendMessage('TASK_FAILED', {
        taskId: task.taskId,
        workerId: this.workerId,
        error: error.message,
        stack: error.stack
      });
    }
  }

  createExecutionContext() {
    return {
      workerId: this.workerId,
      db: this.db,
      genAI: this.genAI,
      tools: this.tools,
      rateLimiters: this.rateLimiters,
      updateProgress: this.updateProgress.bind(this),
      sendMessage: this.sendMessage.bind(this)
    };
  }

  // ... rest of existing worker methods
}
```

## Task Logic and Template Storage Summary

### **Where Task Logic is Stored:**

1. **Task Templates**: Firestore collection `task-templates`
   - Contains JavaScript execution code as strings
   - Parameter schemas (JSON Schema format)
   - Trigger patterns and metadata
   - Version control and rollback support

2. **Compiled Executors**: Memory cache
   - Compiled JavaScript classes from templates
   - VM sandbox contexts for security
   - Hot-reload when templates change

3. **Base Classes**: File system
   - `lib/baseTaskExecutor.js` - Common functionality
   - `utils/` directory - Shared utilities
   - Security and validation helpers

4. **Active Tasks**: Firestore collection `task-queue`
   - Running task instances with template references
   - Progress tracking and result storage
   - Worker assignments and status

### **Task Creation Flow:**

```
1. User Message → Template Detection (AI-powered pattern matching)
2. Template Loading → Parameter Extraction (Gemini AI)
3. Task Creation → Queue Assignment → Worker Allocation
4. Template Compilation → Executor Creation → Task Execution
5. Progress Tracking → Result Generation → Completion Notification
```

### **Security Features:**

- **Sandboxed Execution**: VM contexts with limited module access
- **Input Validation**: JSON Schema validation for all parameters
- **Code Validation**: Static analysis of execution scripts
- **Access Control**: Whitelisted modules and APIs only
- **Resource Limits**: Memory and CPU constraints per worker

This dynamic template system enables **CLAUDE** to create and manage complex tasks without hardcoded worker logic, providing flexibility while maintaining security and performance.

## Architecture Design

### 5. Task Queue Schema (Firestore)

```javascript
// Collection: task-queue
{
  taskId: "task_67f8a9b2_2025_10_08",
  type: "invoice_report", // invoice_report, client_analysis, bulk_translation, kml_generation
  status: "pending", // pending, running, paused, completed, failed, cancelled
  priority: 70, // 0-100, higher = more urgent
  
  // Task definition with template reference
  templateId: "invoice_report_v2",
  templateVersion: "2.1.0",
  definition: {
    action: "generate_invoice_report",
    parameters: {
      dateRange: { start: "2024-01-01", end: "2024-12-31" },
      clientFilters: ["active", "overdue"],
      includeServices: true,
      outputFormat: "detailed_summary",
      notifyChannels: ["chat594", "user@company.com"]
    },
    toolChain: ["KnowledgeManagement", "WebSearch", "BitrixChatSummary"], // From template
    estimatedSteps: 8, // From template
    estimatedDuration: 600000, // 10 minutes - calculated from template
    executionScript: "class InvoiceReportExecutor extends BaseTaskExecutor {...}" // From template
  },
  
  // Execution tracking
  execution: {
    workerId: "worker_abc123_2025_10_08",
    startedAt: "2025-10-08T10:00:00Z",
    lastHeartbeat: "2025-10-08T10:05:30Z",
    currentStep: "enriching_client_data",
    stepsCompleted: 3,
    stepsTotal: 8,
    memoryUsage: "45MB",
    processingRate: "25 invoices/minute"
  },
  
  // Progress tracking
  progress: {
    percentage: 37.5,
    message: "Processing invoices: 150/400 completed",
    data: {
      invoicesProcessed: 150,
      clientsAnalyzed: 45,
      totalRevenue: "$245,890",
      errorCount: 2,
      warningCount: 7
    },
    checkpoints: [
      { step: "fetch_invoices", completedAt: "2025-10-08T10:02:00Z", duration: 120000 },
      { step: "enrich_client_data", completedAt: "2025-10-08T10:04:30Z", duration: 150000 }
    ]
  },
  
  // Results and attachments
  result: {
    success: true,
    summary: "Processed 400 invoices across 120 clients. Revenue: $245,890. 15 overdue accounts requiring attention.",
    attachments: [
      { type: "pdf", filename: "invoice_report_2025_10_08.pdf", storageUrl: "gs://chantilly-reports/...", size: "2.4MB" },
      { type: "json", filename: "client_analysis.json", storageUrl: "gs://chantilly-reports/...", size: "890KB" },
      { type: "csv", filename: "overdue_accounts.csv", storageUrl: "gs://chantilly-reports/...", size: "45KB" }
    ],
    executionTime: 587000, // 9m 47s
    resourceUsage: { peakMemory: "67MB", totalApiCalls: 1247, geminiTokens: 89432 }
  },
  
  // Error handling
  errors: [
    {
      timestamp: "2025-10-08T10:03:15Z",
      step: "enrich_client_data",
      type: "rate_limit_exceeded",
      message: "Bitrix24 rate limit hit, retrying with backoff",
      resolved: true,
      retryCount: 2
    }
  ],
  
  // Metadata
  createdBy: "user@company.com",
  createdAt: "2025-10-08T10:00:00Z",
  updatedAt: "2025-10-08T10:05:30Z",
  expiresAt: "2025-10-15T10:00:00Z", // Auto-cleanup after 7 days
  tags: ["finance", "reporting", "Q4_2024"]
}
```

### 6. Worker Process Management Schema

```javascript
// Collection: worker-processes
{
  workerId: "worker_abc123_2025_10_08",
  type: "complex_task_worker",
  status: "running", // starting, running, idle, stopping, stopped, crashed
  
  // Worker configuration
  config: {
    maxConcurrentTasks: 2,
    specializations: ["invoice_analysis", "client_reporting"], // What types of tasks this worker handles
    toolsLoaded: ["KnowledgeManagement", "WebSearch", "GoogleMapsPlaces"],
    geminiModel: "gemini-2.0-flash-exp",
    rateLimits: {
      bitrix24: { requestsPerSecond: 1.5, burstLimit: 10 },
      gemini: { requestsPerMinute: 15, tokensPerMinute: 100000 }
    }
  },
  
  // Resource monitoring
  resources: {
    memoryUsage: "45MB",
    memoryLimit: "512MB",
    cpuUsage: "12%",
    uptime: 287000,
    lastHealthCheck: "2025-10-08T10:05:30Z",
    taskQueueSize: 2,
    completedTasks: 23,
    failedTasks: 1
  },
  
  // Current workload
  currentTasks: [
    { taskId: "task_67f8a9b2", startedAt: "2025-10-08T10:00:00Z", progress: 37.5 },
    { taskId: "task_91d4e5f6", startedAt: "2025-10-08T10:03:00Z", progress: 15.2 }
  ],
  
  // Performance metrics
  performance: {
    avgTaskDuration: 425000, // 7m 5s average
    tasksPerHour: 8.4,
    successRate: 95.7,
    apiCallsPerTask: 31.2,
    memoryEfficiency: 87.3 // Percentage of optimal memory usage
  },
  
  // Error tracking
  errors: [
    {
      timestamp: "2025-10-08T09:45:22Z",
      taskId: "task_45h7i8j9",
      error: "Memory limit exceeded",
      action: "task_terminated",
      recovery: "worker_restarted"
    }
  ],
  
  startedAt: "2025-10-08T09:30:00Z",
  lastUpdate: "2025-10-08T10:05:30Z"
}
```

### 7. Legacy Task Orchestration Service (Pre-Template)

*Note: This section shows the original hardcoded approach. The enhanced template-based orchestrator is shown in section 3 above.*

```javascript
// services/taskOrchestrator.js
class TaskOrchestrator {
  constructor() {
    this.db = admin.firestore();
    this.workerPool = new WorkerPool({
      maxWorkers: 4,
      workerScript: './workers/complexTaskWorker.js'
    });
    this.taskQueue = new PriorityQueue();
    this.monitoringInterval = null;
  }

  async initialize() {
    // Start task queue monitoring
    this.monitoringInterval = setInterval(() => {
      this.processTaskQueue();
      this.monitorWorkerHealth();
      this.cleanupExpiredTasks();
    }, 5000); // Check every 5 seconds

    // Listen for real-time task updates
    this.db.collection('task-queue')
      .where('status', 'in', ['pending', 'running'])
      .onSnapshot(this.handleTaskQueueUpdates.bind(this));
  }

  async createTask(type, parameters, userId, options = {}) {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Estimate task complexity and duration
    const estimation = await this.estimateTask(type, parameters);
    
    const task = {
      taskId,
      type,
      status: 'pending',
      priority: options.priority || this.calculatePriority(type, parameters),
      definition: {
        action: this.mapTypeToAction(type),
        parameters,
        toolChain: estimation.requiredTools,
        estimatedSteps: estimation.steps,
        estimatedDuration: estimation.duration
      },
      createdBy: userId,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + (options.ttlDays || 7) * 24 * 60 * 60 * 1000),
      tags: options.tags || []
    };

    await this.db.collection('task-queue').doc(taskId).set(task);
    
    // Add to priority queue for immediate processing
    this.taskQueue.enqueue(task, task.priority);

    return {
      taskId,
      message: `✅ **Complex Task Created!**\n\n🆔 **Task ID**: ${taskId}\n⏱️ **Estimated Time**: ${this.formatDuration(estimation.duration)}\n📊 **Steps**: ${estimation.steps}\n🔄 **Status**: Use \`/task-status ${taskId}\` to monitor progress`,
      estimation
    };
  }

  async processTaskQueue() {
    while (!this.taskQueue.isEmpty() && this.workerPool.hasAvailableWorker()) {
      const task = this.taskQueue.dequeue();
      
      try {
        // Find best worker for this task type
        const worker = await this.workerPool.getOptimalWorker(task.type);
        
        // Assign task to worker
        await this.assignTaskToWorker(task, worker);
        
      } catch (error) {
        logger.error('Failed to assign task to worker', { taskId: task.taskId, error: error.message });
        
        // Requeue with lower priority for retry
        task.priority = Math.max(0, task.priority - 10);
        this.taskQueue.enqueue(task, task.priority);
      }
    }
  }

  async assignTaskToWorker(task, worker) {
    // Update task status to running
    await this.db.collection('task-queue').doc(task.taskId).update({
      status: 'running',
      'execution.workerId': worker.id,
      'execution.startedAt': FieldValue.serverTimestamp(),
      'execution.lastHeartbeat': FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    // Send task to worker
    worker.postMessage({
      type: 'EXECUTE_TASK',
      task: task
    });

    // Set up message handling for this task
    worker.on('message', (message) => {
      this.handleWorkerMessage(task.taskId, message);
    });

    worker.on('error', (error) => {
      this.handleWorkerError(task.taskId, error);
    });

    worker.on('exit', (code) => {
      this.handleWorkerExit(task.taskId, code);
    });
  }

  async handleWorkerMessage(taskId, message) {
    switch (message.type) {
      case 'PROGRESS_UPDATE':
        await this.updateTaskProgress(taskId, message.data);
        break;
      
      case 'STEP_COMPLETED':
        await this.recordStepCompletion(taskId, message.data);
        break;
      
      case 'TASK_COMPLETED':
        await this.completeTask(taskId, message.data);
        break;
      
      case 'TASK_FAILED':
        await this.failTask(taskId, message.data);
        break;
      
      case 'HEARTBEAT':
        await this.updateHeartbeat(taskId);
        break;
    }
  }

  async updateTaskProgress(taskId, progressData) {
    const updateData = {
      'progress.percentage': progressData.percentage,
      'progress.message': progressData.message,
      'progress.data': progressData.data || {},
      'execution.currentStep': progressData.currentStep,
      'execution.stepsCompleted': progressData.stepsCompleted,
      'execution.lastHeartbeat': FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    await this.db.collection('task-queue').doc(taskId).update(updateData);

    // Notify interested parties (optional real-time updates)
    await this.notifyProgress(taskId, progressData);
  }

  async completeTask(taskId, resultData) {
    const completionData = {
      status: 'completed',
      result: {
        success: true,
        summary: resultData.summary,
        attachments: resultData.attachments || [],
        executionTime: resultData.executionTime,
        resourceUsage: resultData.resourceUsage
      },
      'execution.lastHeartbeat': FieldValue.serverTimestamp(),
      'progress.percentage': 100,
      'progress.message': 'Task completed successfully',
      updatedAt: FieldValue.serverTimestamp()
    };

    await this.db.collection('task-queue').doc(taskId).update(completionData);

    // Notify completion
    await this.notifyCompletion(taskId, resultData);

    // Cleanup worker assignment
    await this.workerPool.releaseWorker(resultData.workerId);
  }

  // Task estimation based on type and parameters
  async estimateTask(type, parameters) {
    switch (type) {
      case 'invoice_report':
        const invoiceCount = await this.estimateInvoiceCount(parameters.dateRange);
        return {
          steps: 8,
          duration: Math.max(300000, invoiceCount * 1500), // 1.5s per invoice, min 5 minutes
          requiredTools: ['KnowledgeManagement', 'WebSearch'],
          complexity: invoiceCount > 1000 ? 'high' : invoiceCount > 100 ? 'medium' : 'low'
        };
      
      case 'client_analysis':
        const clientCount = await this.estimateClientCount(parameters.filters);
        return {
          steps: 6,
          duration: Math.max(180000, clientCount * 2000), // 2s per client, min 3 minutes
          requiredTools: ['KnowledgeManagement', 'BitrixChatSummary'],
          complexity: clientCount > 500 ? 'high' : clientCount > 50 ? 'medium' : 'low'
        };
      
      case 'bulk_translation':
        const messageCount = parameters.messageCount || 50;
        const languageCount = parameters.languages?.length || 8;
        return {
          steps: 4,
          duration: Math.max(120000, messageCount * languageCount * 3000), // 3s per translation
          requiredTools: ['BitrixTranslationChannels'],
          complexity: (messageCount * languageCount) > 400 ? 'high' : 'medium'
        };
      
      default:
        return {
          steps: 5,
          duration: 300000, // 5 minutes default
          requiredTools: [],
          complexity: 'medium'
        };
    }
  }
}
```

### 8. Legacy Complex Task Worker Implementation (Pre-Template)

*Note: This section shows the original hardcoded approach. The enhanced template-based worker is shown in section 4 above.*

```javascript
// workers/complexTaskWorker.js
const { parentPort, workerData } = require('worker_threads');
const { GoogleGenAI } = require('@google/genai');
const admin = require('firebase-admin');

class ComplexTaskWorker {
  constructor() {
    this.workerId = `worker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.db = admin.firestore();
    this.genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    this.tools = null; // Loaded dynamically
    this.rateLimiters = this.initializeRateLimiters();
    this.currentTask = null;
    
    // Resource monitoring
    this.memoryMonitor = setInterval(() => {
      this.reportResourceUsage();
    }, 30000); // Every 30 seconds

    // Heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 10000); // Every 10 seconds
  }

  async initialize() {
    // Register worker in Firestore
    await this.registerWorker();
    
    // Load tools dynamically
    this.tools = await this.loadTools();
    
    // Set up message handling
    parentPort.on('message', this.handleMessage.bind(this));
    
    this.log('info', 'Complex Task Worker initialized', { workerId: this.workerId });
  }

  async handleMessage(message) {
    switch (message.type) {
      case 'EXECUTE_TASK':
        await this.executeTask(message.task);
        break;
      
      case 'PAUSE_TASK':
        await this.pauseTask();
        break;
      
      case 'RESUME_TASK':
        await this.resumeTask();
        break;
      
      case 'CANCEL_TASK':
        await this.cancelTask();
        break;
      
      case 'SHUTDOWN':
        await this.shutdown();
        break;
    }
  }

  async executeTask(task) {
    this.currentTask = task;
    
    try {
      this.log('info', 'Starting task execution', { taskId: task.taskId, type: task.type });
      
      // Update worker status
      await this.updateWorkerStatus('running', { currentTaskId: task.taskId });
      
      // Execute task based on type
      let result;
      switch (task.type) {
        case 'invoice_report':
          result = await this.executeInvoiceReport(task);
          break;
        case 'client_analysis':
          result = await this.executeClientAnalysis(task);
          break;
        case 'bulk_translation':
          result = await this.executeBulkTranslation(task);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }
      
      // Report completion
      this.sendMessage('TASK_COMPLETED', {
        taskId: task.taskId,
        workerId: this.workerId,
        ...result
      });
      
    } catch (error) {
      this.log('error', 'Task execution failed', { 
        taskId: task.taskId, 
        error: error.message,
        stack: error.stack 
      });
      
      this.sendMessage('TASK_FAILED', {
        taskId: task.taskId,
        workerId: this.workerId,
        error: error.message,
        stack: error.stack
      });
    } finally {
      this.currentTask = null;
      await this.updateWorkerStatus('idle');
    }
  }

  async executeInvoiceReport(task) {
    const { parameters } = task.definition;
    const startTime = Date.now();
    
    // Step 1: Initialize and validate parameters
    this.updateProgress(0, 'Initializing invoice report generation...', 'validate_parameters');
    await this.validateReportParameters(parameters);
    
    // Step 2: Fetch all invoices with streaming
    this.updateProgress(10, 'Fetching invoices from Bitrix24...', 'fetch_invoices');
    const invoices = await this.fetchInvoicesWithStreaming(parameters.dateRange);
    
    // Step 3: Enrich with client data
    this.updateProgress(30, 'Enriching with client information...', 'enrich_client_data');
    const enrichedInvoices = await this.enrichWithClientData(invoices);
    
    // Step 4: Search knowledge base for relevant context
    this.updateProgress(50, 'Searching knowledge base for context...', 'knowledge_search');
    const knowledgeContext = await this.searchKnowledgeContext(parameters);
    
    // Step 5: Analyze with Gemini in chunks
    this.updateProgress(60, 'Analyzing patterns with AI...', 'ai_analysis');
    const analysis = await this.analyzeWithGeminiChunked(enrichedInvoices, knowledgeContext);
    
    // Step 6: Generate insights and recommendations
    this.updateProgress(80, 'Generating insights and recommendations...', 'generate_insights');
    const insights = await this.generateInsights(analysis, enrichedInvoices);
    
    // Step 7: Create report attachments
    this.updateProgress(90, 'Creating report files...', 'create_attachments');
    const attachments = await this.createReportAttachments(insights, enrichedInvoices);
    
    // Step 8: Finalize and cleanup
    this.updateProgress(95, 'Finalizing report...', 'finalize');
    const summary = this.generateReportSummary(insights, enrichedInvoices);
    
    const executionTime = Date.now() - startTime;
    
    return {
      summary,
      attachments,
      executionTime,
      resourceUsage: {
        peakMemory: process.memoryUsage().heapUsed,
        invoicesProcessed: invoices.length,
        clientsAnalyzed: enrichedInvoices.filter(i => i.client).length,
        geminiTokensUsed: this.geminiTokensUsed || 0
      }
    };
  }

  async fetchInvoicesWithStreaming(dateRange) {
    const invoices = [];
    let hasMore = true;
    let start = 0;
    let processed = 0;
    
    while (hasMore) {
      // Rate limiting
      await this.rateLimiters.bitrix24.wait();
      
      try {
        const batch = await this.callBitrix24API('crm.invoice.list', {
          start,
          filter: {
            '>=DATE_CREATE': dateRange.start,
            '<=DATE_CREATE': dateRange.end
          },
          select: ['ID', 'ACCOUNT_NUMBER', 'PRICE', 'CURRENCY', 'UF_COMPANY_ID', 'STATUS_ID']
        });
        
        invoices.push(...batch.result);
        processed += batch.result.length;
        hasMore = batch.result.length === 50; // Bitrix24 page size
        start += 50;
        
        // Update progress
        const estimatedTotal = Math.max(processed * 2, 100); // Rough estimate
        const progressPercent = Math.min(25, (processed / estimatedTotal) * 25);
        this.updateProgress(
          10 + progressPercent, 
          `Fetched ${processed} invoices...`,
          'fetch_invoices',
          { invoicesProcessed: processed }
        );
        
        // Memory management - process in chunks if getting large
        if (invoices.length > 5000) {
          this.log('warn', 'Large invoice dataset detected, consider chunked processing', {
            invoiceCount: invoices.length
          });
        }
        
      } catch (error) {
        this.log('error', 'Failed to fetch invoice batch', { start, error: error.message });
        
        // Exponential backoff for rate limits
        if (error.message.includes('rate limit') || error.message.includes('429')) {
          await this.exponentialBackoff(start);
          continue; // Retry same batch
        }
        
        throw error;
      }
    }
    
    this.log('info', 'Invoice fetching completed', { totalInvoices: invoices.length });
    return invoices;
  }

  async analyzeWithGeminiChunked(enrichedInvoices, knowledgeContext) {
    const chunkSize = 50; // Process 50 invoices at a time
    const chunks = this.chunkArray(enrichedInvoices, chunkSize);
    const analyses = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Rate limiting for Gemini
      await this.rateLimiters.gemini.wait();
      
      const model = this.genAI.getGenerativeModel({ 
        model: 'gemini-2.0-flash-exp',
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.1 // Lower temperature for analytical consistency
        }
      });
      
      const prompt = this.buildAnalysisPrompt(chunk, knowledgeContext, i + 1, chunks.length);
      
      try {
        const result = await model.generateContent(prompt);
        const analysisText = result.response.text();
        const analysis = JSON.parse(analysisText);
        
        analyses.push({
          chunkIndex: i,
          analysis,
          invoiceCount: chunk.length
        });
        
        // Update progress
        const progressPercent = ((i + 1) / chunks.length) * 20; // 20% of total progress
        this.updateProgress(
          60 + progressPercent,
          `Analyzed chunk ${i + 1}/${chunks.length} (${chunk.length} invoices)...`,
          'ai_analysis',
          { chunksProcessed: i + 1, totalChunks: chunks.length }
        );
        
        // Track token usage
        this.geminiTokensUsed = (this.geminiTokensUsed || 0) + (result.response.usageMetadata?.totalTokenCount || 0);
        
      } catch (error) {
        this.log('error', 'Gemini analysis failed for chunk', { chunkIndex: i, error: error.message });
        
        // Continue with other chunks, but note the failure
        analyses.push({
          chunkIndex: i,
          analysis: null,
          error: error.message,
          invoiceCount: chunk.length
        });
      }
    }
    
    return analyses;
  }

  buildAnalysisPrompt(invoiceChunk, knowledgeContext, chunkNumber, totalChunks) {
    return `Analyze this batch of invoice and client data (Chunk ${chunkNumber}/${totalChunks}) for business insights:

KNOWLEDGE CONTEXT:
${knowledgeContext ? JSON.stringify(knowledgeContext, null, 2) : 'No relevant knowledge base context found'}

INVOICE DATA:
${JSON.stringify(invoiceChunk, null, 2)}

Provide analysis as valid JSON with this structure:
{
  "revenuePatterns": {
    "totalRevenue": number,
    "averageInvoiceValue": number,
    "topClients": [{"clientId": string, "revenue": number, "invoiceCount": number}],
    "monthlyTrends": [{"month": string, "revenue": number, "count": number}]
  },
  "clientInsights": {
    "newClients": number,
    "repeatClients": number,
    "riskFactors": [{"clientId": string, "risk": string, "severity": "low|medium|high"}]
  },
  "serviceAnalysis": {
    "topServices": [{"service": string, "revenue": number, "frequency": number}],
    "serviceGrowth": [{"service": string, "growthRate": number}]
  },
  "recommendations": [
    {"priority": "high|medium|low", "action": string, "reasoning": string, "expectedImpact": string}
  ],
  "anomalies": [
    {"type": string, "description": string, "affectedInvoices": [string]}
  ]
}

Focus on actionable insights and data-driven recommendations. Ensure all numbers are accurate based on the provided data.`;
  }

  updateProgress(percentage, message, currentStep, data = {}) {
    this.sendMessage('PROGRESS_UPDATE', {
      taskId: this.currentTask?.taskId,
      percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
      message,
      currentStep,
      data,
      timestamp: new Date().toISOString()
    });
  }

  sendMessage(type, data) {
    if (parentPort) {
      parentPort.postMessage({ type, data });
    }
  }

  async reportResourceUsage() {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    await this.updateWorkerStatus('running', {
      memoryUsage: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      memoryLimit: process.env.WORKER_MEMORY_LIMIT || '512MB',
      uptime: process.uptime() * 1000,
      lastHealthCheck: new Date().toISOString()
    });
  }

  async shutdown() {
    this.log('info', 'Worker shutting down', { workerId: this.workerId });
    
    // Clear intervals
    clearInterval(this.memoryMonitor);
    clearInterval(this.heartbeatInterval);
    
    // Update worker status
    await this.updateWorkerStatus('stopped');
    
    // Exit process
    process.exit(0);
  }
}

// Initialize worker
const worker = new ComplexTaskWorker();
worker.initialize().catch(error => {
  console.error('Failed to initialize worker:', error);
  process.exit(1);
});
```

### 9. Enhanced Task Management Tool Integration

```javascript
// tools/complexTaskManager.js
class ComplexTaskManagerTool extends BaseTool {
  constructor(context) {
    super(context);
    this.name = 'ComplexTaskManager';
    this.description = 'Create and manage complex multi-step background tasks with progress tracking';
    this.priority = 95; // Very high priority for task management
    this.orchestrator = new TaskOrchestrator();
    this.templateLoader = new TaskTemplateLoader();
  }
  
  shouldTrigger(message) {
    const triggers = [
      // Task creation patterns
      /generate.*comprehensive.*report/i,
      /create.*detailed.*analysis/i,
      /bulk.*process.*invoices/i,
      /analyze.*all.*clients/i,
      /generate.*invoice.*report/i,
      /create.*client.*analysis/i,
      /bulk.*translate.*messages/i,
      /process.*large.*dataset/i,
      
      // Task management patterns
      /check.*task.*status/i,
      /task.*progress/i,
      /cancel.*task/i,
      /pause.*task/i,
      /resume.*task/i,
      /list.*running.*tasks/i,
      /task.*queue.*status/i,
      
      // Report requests that need complex processing
      /revenue.*analysis.*report/i,
      /overdue.*accounts.*analysis/i,
      /client.*portfolio.*review/i,
      /service.*utilization.*report/i
    ];
    
    return triggers.some(trigger => trigger.test(message));
  }
  
  async execute(params, toolContext) {
    const { action, taskType, ...taskParams } = params;
    
    switch (action) {
      case 'create_task':
        return await this.createComplexTask(taskType, taskParams, toolContext);
      case 'check_status':
        return await this.checkTaskStatus(taskParams.taskId);
      case 'list_tasks':
        return await this.listUserTasks(toolContext.messageData.userId);
      case 'cancel_task':
        return await this.cancelTask(taskParams.taskId, toolContext.messageData.userId);
      case 'pause_task':
        return await this.pauseTask(taskParams.taskId);
      case 'resume_task':
        return await this.resumeTask(taskParams.taskId);
      default:
        // Auto-detect task type from message content
        return await this.autoCreateTask(toolContext);
    }
  }
  
  async createComplexTask(taskType, parameters, toolContext) {
    try {
      // Validate user permissions for complex tasks
      if (!await this.validateTaskPermissions(toolContext.messageData.userId, taskType)) {
        return `❌ **Permission Denied**\n\nYou don't have permission to create '${taskType}' tasks. Contact your administrator for access.`;
      }
      
      // Find appropriate template for task type
      const template = await this.findTemplateForTaskType(taskType);
      if (!template) {
        return `❌ **Template Not Found**\n\nNo template available for task type '${taskType}'. Contact your administrator.`;
      }
      
      // Create the task using template
      const result = await this.orchestrator.createTaskFromTemplate(
        template.templateId,
        parameters,
        toolContext.messageData.userId,
        {
          priority: parameters.priority || 50,
          ttlDays: parameters.ttlDays || 7,
          tags: parameters.tags || []
        }
      );
      
      return `🚀 **Complex Task Created Successfully!**

${result.message}

📋 **Task Details:**
• **Template**: ${result.template.name} (v${result.template.version})
• **Type**: ${taskType}
• **Estimated Complexity**: ${this.estimateComplexity(result.estimation)}
• **Required Tools**: ${result.estimation.requiredTools.join(', ')}
• **Memory Requirement**: ${result.estimation.memoryRequirement}

🔧 **Management Commands:**
• \`Check status\`: Ask "What's the status of task ${result.taskId}?"
• \`Cancel task\`: Say "Cancel task ${result.taskId}"
• \`List my tasks\`: Ask "Show my running tasks"

The task will run in the background using the **${result.template.name}** template. You can continue using Chantilly normally while it processes.`;
      
    } catch (error) {
      this.log('error', 'Failed to create complex task', { 
        taskType, 
        parameters, 
        error: error.message 
      });
      
      return `❌ **Task Creation Failed**\n\nError: ${error.message}\n\nPlease check your parameters and try again.`;
    }
  }
  
  async checkTaskStatus(taskId) {
    try {
      const taskDoc = await this.db.collection('task-queue').doc(taskId).get();
      
      if (!taskDoc.exists) {
        return `❌ **Task Not Found**\n\nTask ID: \`${taskId}\`\n\nThe task may have been completed and cleaned up, or the ID is incorrect.`;
      }
      
      const task = taskDoc.data();
      const progress = task.progress || {};
      const execution = task.execution || {};
      
      let statusEmoji = '🔄';
      let statusColor = '🟡';
      
      switch (task.status) {
        case 'completed':
          statusEmoji = '✅';
          statusColor = '🟢';
          break;
        case 'failed':
          statusEmoji = '❌';
          statusColor = '🔴';
          break;
        case 'cancelled':
          statusEmoji = '🚫';
          statusColor = '⚫';
          break;
        case 'paused':
          statusEmoji = '⏸️';
          statusColor = '🟠';
          break;
      }
      
      let response = `${statusEmoji} **Task Status Report**

📋 **Task Information:**
• **ID**: \`${taskId}\`
• **Type**: ${task.type}
• **Status**: ${statusColor} ${task.status.toUpperCase()}
• **Created**: ${this.formatDate(task.createdAt)}

📊 **Progress:**
• **Completion**: ${progress.percentage || 0}%
• **Current Step**: ${execution.currentStep || 'Initializing'}
• **Steps**: ${execution.stepsCompleted || 0}/${execution.stepsTotal || '?'}
• **Message**: ${progress.message || 'Starting...'}
`;

      if (task.status === 'running') {
        const elapsed = Date.now() - (execution.startedAt?.toDate()?.getTime() || Date.now());
        const estimated = task.definition?.estimatedDuration || 0;
        const remaining = Math.max(0, estimated - elapsed);
        
        response += `
⏱️ **Timing:**
• **Elapsed**: ${this.formatDuration(elapsed)}
• **Estimated Remaining**: ${this.formatDuration(remaining)}
• **Worker**: ${execution.workerId || 'Unknown'}
`;

        if (progress.data) {
          response += `
📈 **Current Data:**
${Object.entries(progress.data).map(([key, value]) => `• **${this.formatKey(key)}**: ${value}`).join('\n')}
`;
        }
      }
      
      if (task.status === 'completed' && task.result) {
        response += `
✅ **Results:**
• **Summary**: ${task.result.summary}
• **Execution Time**: ${this.formatDuration(task.result.executionTime)}
`;

        if (task.result.attachments && task.result.attachments.length > 0) {
          response += `
📎 **Attachments:**
${task.result.attachments.map(att => `• **${att.filename}** (${att.size})`).join('\n')}
`;
        }
      }
      
      if (task.status === 'failed' && task.errors && task.errors.length > 0) {
        const lastError = task.errors[task.errors.length - 1];
        response += `
❌ **Error Information:**
• **Type**: ${lastError.type || 'Unknown'}
• **Message**: ${lastError.message}
• **Time**: ${this.formatDate(lastError.timestamp)}
`;
      }
      
      return response;
      
    } catch (error) {
      this.log('error', 'Failed to check task status', { taskId, error: error.message });
      return `❌ **Status Check Failed**\n\nError retrieving status for task \`${taskId}\`: ${error.message}`;
    }
  }
  
  async autoCreateTask(toolContext) {
    const message = toolContext.messageData.message;
    
    // Use template system for auto-detection
    const result = await this.orchestrator.autoCreateFromMessage(
      message,
      {
        userId: toolContext.messageData.userId,
        category: this.detectMessageCategory(message),
        chatId: toolContext.messageData.dialogId
      },
      toolContext.messageData.userId
    );
    
    if (!result) {
      return `❌ **No Matching Template Found**\n\nI couldn't find a suitable template for your request. Try being more specific or use one of these supported task types:\n\n• **Invoice Reports**: "Generate invoice report for 2024"\n• **Client Analysis**: "Analyze all active clients"\n• **Bulk Translation**: "Translate messages to all languages"\n\nOr contact your administrator to create a custom template.`;
    }
    
    return `🚀 **Task Auto-Created!**\n\n${result.message}\n\n🤖 **AI Detection Results:**\n• **Template**: ${result.template.name}\n• **Confidence**: ${Math.round(result.confidence * 100)}%\n• **Parameters**: Auto-extracted from your message\n\nThe task will start processing immediately.`;
  }
  
  detectMessageCategory(message) {
    if (/invoice|revenue|financial|billing/i.test(message)) return 'financial_reporting';
    if (/client|customer|account/i.test(message)) return 'client_management';
    if (/translat|language/i.test(message)) return 'translation';
    if (/report|analysis|summary/i.test(message)) return 'business_analysis';
    return 'general';
  }
  
  async findTemplateForTaskType(taskType) {
    // Map legacy task types to template IDs
    const typeMapping = {
      'invoice_report': 'invoice_report_v2',
      'client_analysis': 'client_analysis_v1',
      'bulk_translation': 'bulk_translation_v1',
      'kml_generation': 'kml_generator_v1'
    };
    
    const templateId = typeMapping[taskType];
    if (!templateId) return null;
    
    return await this.templateLoader.loadTemplate(templateId);
  }
  
  estimateComplexity(estimation) {
    const duration = estimation.estimatedDuration || 0;
    const steps = estimation.estimatedSteps || 0;
    const memoryReq = estimation.memoryRequirement || '256MB';
    
    if (duration > 600000 || steps > 8 || memoryReq.includes('1GB')) return 'High';
    if (duration > 300000 || steps > 5 || memoryReq.includes('512MB')) return 'Medium';
    return 'Low';
  }
  
  extractDateRange(message) {
    // Extract date ranges from natural language
    const currentYear = new Date().getFullYear();
    
    if (/this year|current year/i.test(message)) {
      return {
        start: `${currentYear}-01-01`,
        end: `${currentYear}-12-31`
      };
    }
    
    if (/last year|previous year/i.test(message)) {
      return {
        start: `${currentYear - 1}-01-01`,
        end: `${currentYear - 1}-12-31`
      };
    }
    
    if (/ytd|year to date/i.test(message)) {
      return {
        start: `${currentYear}-01-01`,
        end: new Date().toISOString().split('T')[0]
      };
    }
    
    // Add more sophisticated date parsing as needed
    return null;
  }
  
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
  
  formatKey(key) {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  }
}
```

## Implementation Benefits

### For Chantilly System
✅ **Scalability**: Handle multiple complex operations simultaneously without blocking main process  
✅ **Reliability**: Child process failures don't crash main Chantilly service  
✅ **Monitoring**: Real-time progress tracking and resource usage monitoring  
✅ **Flexibility**: Dynamic task types and tool chain configurations  
✅ **Performance**: Memory isolation and efficient resource management  

### For Users
✅ **Transparency**: Real-time progress updates and detailed status reports  
✅ **Convenience**: Long-running tasks don't block normal Chantilly usage  
✅ **Control**: Pause, resume, cancel operations as needed  
✅ **Results**: Downloadable reports and comprehensive analysis  

### For Operations Team  
✅ **Monitoring**: Comprehensive logging and performance metrics  
✅ **Debugging**: Isolated error handling and detailed error reporting  
✅ **Maintenance**: Auto-cleanup and resource management  
✅ **Scaling**: Worker pool management and load balancing  

## Implementation Timeline

### ✅ Phase 1: Foundation (COMPLETED)
- [x] Implement basic task queue schema in Firestore
- [x] Create TaskOrchestrator service with basic functionality  
- [x] Develop simple worker process template
- [x] Add ComplexTaskManager tool to Chantilly

**Status: COMPLETE** - All Phase 1 components implemented and ready for testing

### Phase 2: Core Workers (3 weeks)  
- [ ] Implement InvoiceReportWorker with full functionality
- [ ] Add ClientAnalysisWorker
- [ ] Create BulkTranslationWorker
- [ ] Implement progress tracking and heartbeat systems

### Phase 3: Management & Monitoring (2 weeks)
- [ ] Add task status checking and management commands
- [ ] Implement worker health monitoring
- [ ] Create resource usage tracking and alerts
- [ ] Add task prioritization and queue management

### Phase 4: Production Features (2 weeks)
- [ ] Implement file attachment generation and storage
- [ ] Add notification systems for task completion
- [ ] Create admin dashboard for task monitoring
- [ ] Add performance optimization and caching

### Phase 5: Testing & Documentation (1 week)
- [ ] Comprehensive testing with large datasets
- [ ] Performance benchmarking and optimization
- [ ] Update CLAUDE.md documentation
- [ ] Team training and deployment

## Risk Mitigation

### Technical Risks
- **Memory Leaks**: Comprehensive monitoring and automatic worker restart
- **Rate Limiting**: Per-worker rate limiters and intelligent backoff
- **Task Failures**: Checkpoint system and partial result recovery
- **Database Load**: Efficient querying and batch operations

### Operational Risks  
- **Resource Exhaustion**: Worker pool limits and resource monitoring
- **Infinite Tasks**: Maximum execution time limits and health checks
- **Data Loss**: Firestore backup and task result persistence
- **Security**: Input validation and sandboxed worker execution

## Success Metrics

### Performance Targets
- **Task Completion Rate**: >95% success rate for complex tasks
- **Response Time**: <30 seconds for task creation and status checks  
- **Throughput**: Support 10+ concurrent complex tasks
- **Resource Efficiency**: <512MB memory per worker, <30% CPU usage

### User Experience Goals
- **Transparency**: Real-time progress updates within 10 seconds
- **Reliability**: Zero main process crashes due to complex tasks
- **Usability**: Natural language task creation and management
- **Flexibility**: Support for 5+ different complex task types

## Conclusion

This comprehensive child thread task execution system will transform Chantilly from a reactive chat agent into a proactive business automation platform. The system leverages existing strengths while adding enterprise-grade task management capabilities.

**RECOMMENDATION**: ✅ **APPROVE FOR IMPLEMENTATION**

The architecture is technically sound, builds on proven patterns, and addresses all identified requirements. The phased implementation approach minimizes risk while delivering incremental value.