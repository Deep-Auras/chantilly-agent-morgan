const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { logger } = require('./utils/logger');
const {
  securityHeaders,
  resourceLimiter,
  requestSizeLimit,
  auditLogger,
  apiVersioning,
  outputValidation
} = require('./middleware/security');
const { initializeFirestore } = require('./config/firestore');
const bitrixWebhook = require('./webhooks/bitrix');
const healthCheck = require('./utils/healthCheck');
const agentRoutes = require('./routes/agent');
const authRoutes = require('./routes/auth');
const knowledgeRoutes = require('./routes/knowledge');
const workerRoutes = require('./routes/worker');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 8080;

// Configure Express for Cloud Run proxy (trust exactly 1 proxy for security)
app.set('trust proxy', 1);

// Security middleware (OWASP compliant)
app.use(securityHeaders);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ['\'self\''],
      styleSrc: ['\'self\'', '\'unsafe-inline\''],
      scriptSrc: ['\'self\''],
      imgSrc: ['\'self\'', 'data:', 'https:']
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
app.use(compression());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || false,
  credentials: true,
  maxAge: 86400 // 24 hours
}));

// Rate limiting
app.use(resourceLimiter);

// Request size limiting
app.use(requestSizeLimit('10mb'));

// Body parsing with security
app.use(bodyParser.json({
  limit: '10mb',
  type: ['application/json'],
  verify: (req, res, buf) => {
    // Prevent JSON bomb attacks
    if (buf.length > 10 * 1024 * 1024) { // 10MB
      throw new Error('Request too large');
    }
  }
}));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// API inventory and audit logging
app.use(apiVersioning);
app.use(auditLogger);
app.use(outputValidation);

// Request ID for tracing and log ALL incoming requests
app.use((req, res, next) => {
  // SECURITY: Add error handling for UUID generation with timestamp fallback
  try {
    req.id = req.headers['x-cloud-trace-context'] || require('uuid').v4();
  } catch (error) {
    // Fallback to timestamp-based ID if UUID generation fails
    req.id = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    logger.warn('UUID generation failed, using timestamp-based ID', {
      error: error.message,
      fallbackId: req.id
    });
  }

  // Log EVERY request to catch Bitrix24 bot events
  if (req.path.includes('webhook') || req.path.includes('bitrix') || req.method === 'GET') {
    logger.info('INCOMING REQUEST', {
      method: req.method,
      fullUrl: req.originalUrl,
      path: req.path,
      query: req.query,
      headers: req.headers,
      body: req.body,
      requestId: req.id,
      userAgent: req.headers['user-agent']
    });
  } else {
    logger.info(`${req.method} ${req.path}`, { requestId: req.id });
  }

  next();
});

// Initialize services
async function initializeServices() {
  let hasErrors = false;

  // Try Firestore initialization
  try {
    await initializeFirestore();
    logger.info('Firestore initialized');
  } catch (error) {
    logger.error('Failed to initialize Firestore', error);
    hasErrors = true;
  }

  // Try authentication service initialization
  try {
    const { initializeAuthService } = require('./services/auth');
    await initializeAuthService();
    logger.info('Authentication service initialized');
  } catch (error) {
    logger.error('Failed to initialize authentication service', error);
    hasErrors = true;
  }

  // Try user role service initialization (for RBAC)
  try {
    const { initializeUserRoleService } = require('./services/userRoleService');
    await initializeUserRoleService();
    logger.info('User role service initialized (RBAC)');
  } catch (error) {
    logger.error('Failed to initialize user role service', error);
    hasErrors = true;
  }

  // Try personality service initialization
  try {
    const { initializePersonalityService } = require('./services/agentPersonality');
    const { initializeKnowledgeBase } = require('./services/knowledgeBase');
    await initializePersonalityService();
    await initializeKnowledgeBase();
    logger.info('Agent personality initialized');
  } catch (error) {
    logger.error('Failed to initialize personality service', error);
    hasErrors = true;
  }

  // Try custom tools loading - this is critical for the current issue
  try {
    const { loadTools } = require('./lib/toolLoader');
    await loadTools();
    logger.info('Custom tools loaded');
  } catch (error) {
    logger.error('Failed to load custom tools', error);
    hasErrors = true;
  }

  // Try queue manager initialization
  try {
    const { initializeQueue } = require('./services/bitrix24-queue');
    await initializeQueue();
    logger.info('Queue manager initialized');
  } catch (error) {
    logger.error('Failed to initialize queue manager', error);
    hasErrors = true;
  }

  // Try 3CX authentication service initialization (optional)
  try {
    const { initializeThreeCXAuthService } = require('./services/threecx-auth');
    await initializeThreeCXAuthService();
    logger.info('3CX authentication service initialized');
  } catch (error) {
    // 3CX is optional - log but don't fail startup
    logger.warn('3CX authentication service not initialized (credentials may not be configured)', {
      error: error.message
    });
  }

  // Try 3CX queue manager initialization (optional, depends on auth)
  try {
    const { initializeThreeCXQueue } = require('./services/threecx-queue');
    await initializeThreeCXQueue();
    logger.info('3CX queue manager initialized');
  } catch (error) {
    // 3CX is optional - log but don't fail startup
    logger.warn('3CX queue manager not initialized (credentials may not be configured)', {
      error: error.message
    });
  }

  return !hasErrors;
}

// Routes
app.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Chantilly Agent',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint for Cloud Run
app.get('/health', healthCheck);

// Authentication routes
app.use('/auth', authRoutes);

// Admin routes (Bitrix user management, role control)
app.use('/admin', adminRoutes);

// Agent management routes
app.use('/agent', agentRoutes);

// Knowledge base routes
app.use('/knowledge', knowledgeRoutes);

// Worker routes for Cloud Tasks background processing
app.use('/worker', workerRoutes);

// SECURITY FIX: Webhook-specific rate limiter
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: {
    error: 'Too many webhook requests',
    retryAfter: '60 seconds'
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers

  // Custom key generator using IP + webhook signature
  keyGenerator: (req) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';

    // Include webhook signature if present for better tracking
    const signature = req.headers['x-bitrix24-signature'] || '';
    const signaturePrefix = signature.substring(0, 10);

    return `webhook-${ip}-${signaturePrefix}`;
  },

  // Custom handler for rate limit exceeded
  handler: (req, res) => {
    logger.warn('Webhook rate limit exceeded', {
      ip: req.ip,
      signature: req.headers['x-bitrix24-signature']?.substring(0, 20),
      path: req.path,
      method: req.method
    });

    res.status(429).json({
      error: 'Too many webhook requests',
      message: 'Rate limit exceeded. Please retry after 60 seconds.',
      retryAfter: 60
    });
  },

  // Skip rate limiting for successful validation (optional)
  skip: (req) => {
    // Could skip if webhook signature is valid and from known domain
    return false; // For now, rate limit all requests
  }
});

// Raw request logger for debugging webhook issues - log ANY method
app.all('/webhook/bitrix24', (req, res, next) => {
  logger.info('Raw webhook request received', {
    method: req.method,
    path: req.path,
    query: req.query,
    headers: req.headers,
    body: req.body,
    contentType: req.get('Content-Type'),
    userAgent: req.get('User-Agent'),
    requestId: req.id
  });
  next();
});

// Bitrix24 webhook endpoint - handles ALL events including installation
app.all('/webhook/bitrix24',
  webhookLimiter,  // SECURITY FIX: Add rate limiting
  bitrixWebhook
);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler with better null/undefined handling
app.use((err, req, res, next) => {
  // Handle null/undefined errors gracefully
  const errorMessage = err?.message || 'Unknown error occurred';
  const errorStack = err?.stack || 'No stack trace available';
  const statusCode = err?.status || err?.statusCode || 500;

  // Don't expose internal errors in production
  const isProduction = process.env.NODE_ENV === 'production';

  logger.error('Unhandled error', {
    error: errorMessage,
    stack: errorStack,
    requestId: req.id,
    url: req.url,
    method: req.method
  });

  // Return appropriate error based on environment and error type
  if (statusCode === 400) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: isProduction ? 'Invalid request data' : errorMessage,
      requestId: req.id
    });
  }

  if (statusCode === 401) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      requestId: req.id
    });
  }

  if (statusCode === 403) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      requestId: req.id
    });
  }

  // Default 500 error
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: isProduction ? 'Something went wrong' : errorMessage,
    requestId: req.id
  });
});

// Graceful shutdown for Cloud Run
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, starting graceful shutdown');

  try {
    // SECURITY FIX: Clear all intervals and cleanup resources

    // 1. Cleanup webhook cache and intervals
    try {
      const webhookCleanup = require('./webhooks/bitrix').cleanup;
      if (webhookCleanup) {
        webhookCleanup();
        logger.info('Webhook cache cleanup completed');
      }
    } catch (error) {
      logger.error('Webhook cleanup failed', { error: error.message });
    }

    // 2. Cleanup GeminiService intervals
    try {
      const { getGeminiService } = require('./services/gemini');
      const geminiService = getGeminiService();
      if (geminiService && geminiService.destroy) {
        geminiService.destroy();
        logger.info('GeminiService cleanup completed');
      }
    } catch (error) {
      // Service might not be initialized yet, that's okay
      logger.debug('GeminiService cleanup skipped', { reason: error.message });
    }

    // 3. Cleanup tool registry
    try {
      const { getToolLoader } = require('./lib/toolLoader');
      const toolLoader = getToolLoader();
      if (toolLoader && toolLoader.registry) {
        await toolLoader.registry.clear();
        logger.info('Tool registry cleanup completed');
      }
    } catch (error) {
      logger.error('Tool registry cleanup failed', { error: error.message });
    }

    // 4. Shutdown TaskOrchestrator if initialized
    try {
      const { getTaskOrchestrator } = require('./services/taskOrchestrator');
      const orchestrator = getTaskOrchestrator();
      if (orchestrator) {
        await orchestrator.shutdown();
        logger.info('TaskOrchestrator shutdown completed');
      }
    } catch (error) {
      logger.error('TaskOrchestrator shutdown failed', { error: error.message });
    }

    // 5. Cleanup 3CX services if initialized
    try {
      const { getThreeCXQueueManager } = require('./services/threecx-queue');
      const threeCXQueue = getThreeCXQueueManager();
      if (threeCXQueue && threeCXQueue.clear) {
        await threeCXQueue.clear();
        logger.info('3CX queue cleanup completed');
      }
    } catch (error) {
      // 3CX services might not be initialized, that's okay
      logger.debug('3CX queue cleanup skipped', { reason: error.message });
    }

    // 6. Close HTTP server
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  } catch (error) {
    logger.error('Error during graceful shutdown', { error: error.message });
    process.exit(1);
  }

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
});

// Start server
let server;

// Start server immediately for health checks, initialize services in background
server = app.listen(PORT, () => {
  logger.info(`Server starting on port ${PORT}`);
});

// Initialize services in background
initializeServices().then((success) => {
  if (success) {
    logger.info('All services initialized successfully');
  } else {
    logger.error('Some services failed to initialize, but server is running');
    // Don't exit - let health checks handle service readiness
  }
}).catch((error) => {
  logger.error('Service initialization error', error);
  // Don't exit - let health checks handle service readiness
});