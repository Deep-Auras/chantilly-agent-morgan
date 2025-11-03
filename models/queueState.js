const { getFirestore, getFieldValue } = require('../config/firestore');
const { logger } = require('../utils/logger');

class QueueStateModel {
  constructor() {
    this.db = null;
  }

  async initialize() {
    this.db = getFirestore();
  }

  async saveQueueState(state) {
    if (!this.db) {return;}

    try {
      await this.db.collection('queue').doc('state').set({
        ...state,
        timestamp: getFieldValue().serverTimestamp()
      }, { merge: true });
    } catch (error) {
      logger.error('Failed to save queue state', error);
    }
  }

  async getQueueState() {
    if (!this.db) {return null;}

    try {
      const doc = await this.db.collection('queue').doc('state').get();
      return doc.exists ? doc.data() : null;
    } catch (error) {
      logger.error('Failed to get queue state', error);
      return null;
    }
  }

  async saveMetrics(metrics) {
    if (!this.db) {return;}

    try {
      const metricsDoc = {
        ...metrics,
        timestamp: getFieldValue().serverTimestamp()
      };

      // Save to metrics collection with timestamp as ID
      const docId = `metrics_${Date.now()}`;
      await this.db.collection('queue').doc('metrics').collection('history')
        .doc(docId).set(metricsDoc);

      // Also update latest metrics
      await this.db.collection('queue').doc('metrics').set(metricsDoc, { merge: true });

      logger.debug('Queue metrics saved');
    } catch (error) {
      logger.error('Failed to save queue metrics', error);
    }
  }

  async getMetrics(hours = 24) {
    if (!this.db) {return [];}

    try {
      const cutoff = Date.now() - (hours * 60 * 60 * 1000);
      const snapshot = await this.db
        .collection('queue')
        .doc('metrics')
        .collection('history')
        .where('timestamp', '>=', new Date(cutoff))
        .orderBy('timestamp', 'desc')
        .limit(100)
        .get();

      const metrics = [];
      snapshot.forEach(doc => {
        metrics.push(doc.data());
      });

      return metrics;
    } catch (error) {
      logger.error('Failed to get queue metrics', error);
      return [];
    }
  }

  async addFailedRequest(request, reason, retryAfter = null) {
    if (!this.db) {return;}

    try {
      await this.db.collection('queue').doc('failed').collection('requests').add({
        request,
        reason,
        retryAfter: retryAfter || Date.now() + 60000, // Default 1 minute
        timestamp: getFieldValue().serverTimestamp(),
        attempts: request.attempts || 0
      });

      logger.info('Failed request saved', { method: request.method, reason });
    } catch (error) {
      logger.error('Failed to save failed request', error);
    }
  }

  async getFailedRequests(limit = 100) {
    if (!this.db) {return [];}

    try {
      const now = Date.now();
      const snapshot = await this.db
        .collection('queue')
        .doc('failed')
        .collection('requests')
        .where('retryAfter', '<=', now)
        .orderBy('retryAfter', 'asc')
        .limit(limit)
        .get();

      const requests = [];
      snapshot.forEach(doc => {
        requests.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return requests;
    } catch (error) {
      logger.error('Failed to get failed requests', error);
      return [];
    }
  }

  async deleteFailedRequest(requestId) {
    if (!this.db) {return;}

    try {
      await this.db
        .collection('queue')
        .doc('failed')
        .collection('requests')
        .doc(requestId)
        .delete();

      logger.debug('Failed request deleted', { requestId });
    } catch (error) {
      logger.error('Failed to delete failed request', error);
    }
  }

  async cleanupOldMetrics(daysToKeep = 7) {
    if (!this.db) {return;}

    try {
      const cutoff = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
      const snapshot = await this.db
        .collection('queue')
        .doc('metrics')
        .collection('history')
        .where('timestamp', '<', new Date(cutoff))
        .get();

      const batch = this.db.batch();
      snapshot.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      logger.info(`Cleaned up ${snapshot.size} old metric records`);
    } catch (error) {
      logger.error('Failed to cleanup old metrics', error);
    }
  }
}

// Singleton instance
let queueStateModel;

function getQueueStateModel() {
  if (!queueStateModel) {
    queueStateModel = new QueueStateModel();
  }
  return queueStateModel;
}

module.exports = {
  QueueStateModel,
  getQueueStateModel
};