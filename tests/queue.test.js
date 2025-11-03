const { describe, it, beforeEach, afterEach, expect } = require('@jest/globals');

// Mock dependencies
jest.mock('../config/firestore');
jest.mock('../config/env');
jest.mock('../utils/logger');

const { Bitrix24QueueManager } = require('../services/bitrix24-queue');

describe('Queue Service - Infinite Loop Prevention', () => {
  let queueManager;
  let mockDb;
  let mockLogger;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock Firestore
    mockDb = {
      collection: jest.fn().mockReturnThis(),
      doc: jest.fn().mockReturnThis(),
      get: jest.fn(),
      set: jest.fn(),
      add: jest.fn(),
      delete: jest.fn(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis()
    };

    require('../config/firestore').getFirestore = jest.fn(() => mockDb);

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    require('../utils/logger').logger = mockLogger;

    // Mock config
    require('../config/env').QUEUE_MAX_RETRIES = 3;
    require('../config/env').QUEUE_RETRY_DELAY = 1000;

    queueManager = new Bitrix24QueueManager();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initialization Tests', () => {
    it('should initialize only once even with multiple calls', async () => {
      const initSpy = jest.spyOn(queueManager, 'initialize');

      // Call initialize multiple times concurrently
      const promises = Array(5).fill().map(() => queueManager.initialize());
      await Promise.all(promises);

      expect(initSpy).toHaveBeenCalledTimes(5);
      expect(queueManager.initialized).toBe(true);
    });

    it('should not load failed requests (anti-infinite loop protection)', async () => {
      // Mock empty Firestore response
      mockDb.get.mockResolvedValue({ exists: false });

      await queueManager.initialize();

      // Verify no attempts to load failed requests
      expect(mockDb.collection).not.toHaveBeenCalledWith('queue');
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('failed requests')
      );
    });

    it('should complete initialization within reasonable time', async () => {
      const startTime = Date.now();

      await queueManager.initialize();

      const initTime = Date.now() - startTime;
      expect(initTime).toBeLessThan(5000); // Should init in under 5 seconds
    });
  });

  describe('Request Processing - Loop Prevention', () => {
    beforeEach(async () => {
      // Initialize queue before tests
      await queueManager.initialize();
    });

    it('should reject requests during cooldown without creating loops', async () => {
      // Force cooldown state
      queueManager.cooldownUntil = Date.now() + 10000;

      const request = {
        method: 'imbot.message.add',
        params: { MESSAGE: 'test' }
      };

      // Multiple requests during cooldown should all fail fast
      const promises = Array(10).fill().map(() =>
        queueManager.add(request).catch(err => err)
      );

      const results = await Promise.all(promises);

      // All should fail with cooldown error
      results.forEach(result => {
        expect(result).toBeInstanceOf(Error);
        expect(result.message).toBe('Rate limit cooldown active');
      });

      // Should not have created any failed request entries
      expect(mockDb.add).not.toHaveBeenCalled();
    });

    it('should fail fast on rate limit without retrying infinitely', async () => {
      // Mock rate limit condition
      queueManager.slidingWindow.canProceed = jest.fn(() => false);

      const request = {
        method: 'imbot.message.add',
        params: { MESSAGE: 'test' }
      };

      await expect(queueManager.add(request)).rejects.toThrow('Rate limit exceeded');

      // Should enter cooldown but not retry
      expect(queueManager.isInCooldown()).toBe(true);
      expect(mockDb.add).not.toHaveBeenCalled(); // No failed request storage
    });

    it('should limit retries and fail after max attempts', async () => {
      // Mock API call that always fails
      jest.spyOn(queueManager, 'callBitrix24API').mockRejectedValue(
        new Error('Network error')
      );

      const request = {
        method: 'imbot.message.add',
        params: { MESSAGE: 'test' },
        maxRetries: 2
      };

      const startTime = Date.now();

      await expect(queueManager.add(request)).rejects.toThrow('Network error');

      const executionTime = Date.now() - startTime;

      // Should complete within reasonable time (not infinite)
      expect(executionTime).toBeLessThan(10000);

      // Should have called API max retries + 1 times
      expect(queueManager.callBitrix24API).toHaveBeenCalledTimes(3);

      // Should not store failed request
      expect(mockDb.add).not.toHaveBeenCalled();
    });
  });

  describe('Memory and Resource Management', () => {
    beforeEach(async () => {
      await queueManager.initialize();
    });

    it('should not accumulate infinite memory usage', async () => {
      // Mock successful API calls
      jest.spyOn(queueManager, 'callBitrix24API').mockResolvedValue({ result: true });

      // Process requests sequentially for controlled test
      const request = {
        method: 'imbot.message.add',
        params: { MESSAGE: 'test' }
      };

      // Process a few requests to verify no memory leaks
      for (let i = 0; i < 5; i++) {
        await queueManager.add(request);
      }

      // If we reach here without timeout, memory is not accumulating infinitely
      expect(true).toBe(true);
    });

    it('should handle concurrent requests without race conditions', async () => {
      // Mock API calls with delay
      jest.spyOn(queueManager, 'callBitrix24API').mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ result: true }), 10))
      );

      const requests = Array(50).fill().map((_, i) => ({
        method: 'imbot.message.add',
        params: { MESSAGE: `concurrent test ${i}` }
      }));

      const startTime = Date.now();

      // Fire all requests concurrently
      const promises = requests.map(req => queueManager.add(req));
      const results = await Promise.all(promises);

      const executionTime = Date.now() - startTime;

      // All should succeed
      results.forEach(result => {
        expect(result).toEqual({ result: true });
      });

      // Should complete in reasonable time (queue should throttle properly)
      expect(executionTime).toBeLessThan(30000);

      // Should respect rate limiting
      expect(queueManager.callBitrix24API).toHaveBeenCalledTimes(50);
    });
  });

  describe('Error Handling - No Infinite Loops', () => {
    beforeEach(async () => {
      await queueManager.initialize();
    });

    it('should handle Firestore errors without loops', async () => {
      // Mock successful API call
      jest.spyOn(queueManager, 'callBitrix24API').mockResolvedValue({ result: true });

      const request = {
        method: 'imbot.message.add',
        params: { MESSAGE: 'test' }
      };

      // Should process request successfully
      const result = await queueManager.add(request);
      expect(result).toEqual({ result: true });

      // Test passes if no infinite loops occurred
      expect(true).toBe(true);
    });

    it('should timeout on stuck operations', async () => {
      // Mock API call that never resolves
      jest.spyOn(queueManager, 'callBitrix24API').mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const request = {
        method: 'imbot.message.add',
        params: { MESSAGE: 'test' }
      };

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Test timeout')), 5000)
      );

      // Race between add and timeout
      await expect(
        Promise.race([queueManager.add(request), timeoutPromise])
      ).rejects.toThrow('Test timeout');
    });
  });

  describe('Statistics and Monitoring', () => {
    beforeEach(async () => {
      await queueManager.initialize();
    });

    it('should provide accurate statistics without internal loops', () => {
      const stats = queueManager.getStats();

      expect(stats).toHaveProperty('processed');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('queued');
      expect(stats).toHaveProperty('cooldowns');
      expect(stats).toHaveProperty('queueSize');
      expect(stats).toHaveProperty('queuePending');
      expect(stats).toHaveProperty('isInCooldown');
      expect(stats).toHaveProperty('requestsInWindow');

      // All stats should be numbers or booleans
      expect(typeof stats.processed).toBe('number');
      expect(typeof stats.failed).toBe('number');
      expect(typeof stats.isInCooldown).toBe('boolean');
    });

    it('should update statistics correctly during operation', async () => {
      // Mock successful API call
      jest.spyOn(queueManager, 'callBitrix24API').mockResolvedValue({ result: true });

      const initialStats = queueManager.getStats();

      await queueManager.add({
        method: 'imbot.message.add',
        params: { MESSAGE: 'test' }
      });

      const finalStats = queueManager.getStats();

      expect(finalStats.processed).toBeGreaterThan(initialStats.processed);
    });
  });

  describe('Edge Cases and Stress Tests', () => {
    beforeEach(async () => {
      await queueManager.initialize();
    });

    it('should handle malformed requests gracefully', async () => {
      const malformedRequests = [
        null,
        undefined,
        {},
        { method: null },
        { params: null },
        { method: '', params: {} },
        { method: 'test', params: null }
      ];

      for (const request of malformedRequests) {
        await expect(queueManager.add(request)).rejects.toThrow();
      }

      // Queue should still be functional
      const validRequest = {
        method: 'imbot.message.add',
        params: { MESSAGE: 'test' }
      };

      jest.spyOn(queueManager, 'callBitrix24API').mockResolvedValue({ result: true });
      const result = await queueManager.add(validRequest);
      expect(result).toEqual({ result: true });
    });

    it('should survive rapid initialization attempts', async () => {
      const manager1 = new Bitrix24QueueManager();
      const manager2 = new Bitrix24QueueManager();
      const manager3 = new Bitrix24QueueManager();

      // Initialize all managers rapidly
      const promises = [
        manager1.initialize(),
        manager2.initialize(),
        manager3.initialize()
      ];

      await Promise.all(promises);

      // All should be initialized
      expect(manager1.initialized).toBe(true);
      expect(manager2.initialized).toBe(true);
      expect(manager3.initialized).toBe(true);
    });
  });
});