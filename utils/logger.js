const winston = require('winston');
const config = require('../config/env');

// Create base logger configuration
const loggerConfig = {
  level: config.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: config.SERVICE_NAME,
    environment: config.NODE_ENV
  },
  transports: []
};

// Add console transport for local development
if (config.NODE_ENV !== 'production') {
  loggerConfig.transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  );
} else {
  // In production, use structured logging for Cloud Logging
  loggerConfig.transports.push(
    new winston.transports.Console({
      format: winston.format.json()
    })
  );
}

// Add Cloud Logging transport if enabled
if (config.USE_CLOUD_LOGGING && config.NODE_ENV === 'production') {
  const { LoggingWinston } = require('@google-cloud/logging-winston');
  loggerConfig.transports.push(new LoggingWinston({
    projectId: config.GOOGLE_CLOUD_PROJECT,
    labels: {
      service: config.SERVICE_NAME,
      version: '1.0.0'
    }
  }));
}

const logger = winston.createLogger(loggerConfig);

// Helper function for logging with request context
function logWithContext(level, message, meta = {}, requestId = null) {
  const logMeta = { ...meta };
  if (requestId) {
    logMeta.requestId = requestId;
  }
  logger[level](message, logMeta);
}

module.exports = {
  logger,
  logWithContext
};