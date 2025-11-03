const { getFirestore } = require('../config/firestore');
const { getGeminiModel } = require('../config/gemini');
const config = require('../config/env');
const axios = require('axios');

async function checkFirestore() {
  try {
    const db = getFirestore();
    await db.collection('_health').doc('check').get();
    return { status: 'healthy', latency: 0 };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

async function checkGeminiAPI() {
  try {
    const model = getGeminiModel();
    const result = await model.generateContent('Test');
    return { status: 'healthy', model: config.GEMINI_MODEL };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

async function checkBitrix24API() {
  try {
    const response = await axios.get(
      `${config.BITRIX24_INBOUND_WEBHOOK}profile`,
      { timeout: 5000 }
    );
    return {
      status: 'healthy',
      domain: config.BITRIX24_DOMAIN
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

async function getQueueStatus() {
  try {
    const { getQueueManager } = require('../services/bitrix24-queue');
    const queue = getQueueManager();

    return {
      pending: queue?.size || 0,
      processing: queue?.pending || 0,
      cooldown: queue?.isInCooldown() || false,
      failed: queue?.failedCount || 0
    };
  } catch (error) {
    return {
      pending: 0,
      processing: 0,
      cooldown: false,
      failed: 0,
      error: error.message
    };
  }
}

async function healthCheck(req, res) {
  const startTime = Date.now();

  const [firestore, gemini, bitrix24, queue] = await Promise.all([
    checkFirestore(),
    checkGeminiAPI(),
    checkBitrix24API(),
    getQueueStatus()
  ]);

  const allHealthy =
    firestore.status === 'healthy' &&
    gemini.status === 'healthy' &&
    bitrix24.status === 'healthy';

  const health = {
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    responseTime: Date.now() - startTime,
    checks: {
      firestore,
      gemini,
      bitrix24,
      queue
    },
    environment: {
      nodeVersion: process.version,
      environment: config.NODE_ENV,
      service: config.SERVICE_NAME
    }
  };

  res.status(allHealthy ? 200 : 503).json(health);
}

module.exports = healthCheck;