/**
 * Unit Tests for UserRoleService
 *
 * Tests role retrieval, caching, and cache invalidation for RBAC system
 */

const { UserRoleService } = require('../../services/userRoleService');

// Mock Firestore
const mockFirestore = {
  collection: jest.fn()
};

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

// Mock Firestore config
jest.mock('../../config/firestore', () => ({
  getFirestore: jest.fn(() => mockFirestore),
  getFieldValue: jest.fn(() => ({
    serverTimestamp: jest.fn(() => 'TIMESTAMP')
  }))
}));

describe('UserRoleService', () => {
  let service;
  let mockDoc;
  let mockCollection;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock collection and doc
    mockDoc = {
      get: jest.fn(),
      update: jest.fn(),
      exists: false,
      data: jest.fn()
    };

    mockCollection = {
      doc: jest.fn(() => mockDoc),
      get: jest.fn(),
      orderBy: jest.fn(() => ({
        get: jest.fn()
      }))
    };

    mockFirestore.collection.mockReturnValue(mockCollection);

    // Create fresh service instance
    service = new UserRoleService();
    service.db = mockFirestore;
  });

  describe('getUserRole', () => {
    it('should return role for valid Bitrix user ID', async () => {
      // Mock Firestore response
      mockDoc.exists = true;
      mockDoc.data.mockReturnValue({
        bitrixUserId: '123',
        internalUserId: 'testuser',
        role: 'admin',
        email: 'test@example.com'
      });
      mockDoc.get.mockResolvedValue(mockDoc);

      const role = await service.getUserRole('123');

      expect(role).toBe('admin');
      expect(mockCollection.doc).toHaveBeenCalledWith('123');
      expect(mockDoc.get).toHaveBeenCalled();
      expect(service.metrics.firestoreReads).toBe(1);
      expect(service.metrics.cacheMisses).toBe(1);
    });

    it('should return "user" role for unknown Bitrix user ID', async () => {
      // Mock Firestore response - user not found
      mockDoc.exists = false;
      mockDoc.get.mockResolvedValue(mockDoc);

      const role = await service.getUserRole('999');

      expect(role).toBe('user');
      expect(service.metrics.unknownUsers).toBe(1);
    });

    it('should return "user" role for empty Bitrix user ID', async () => {
      const role = await service.getUserRole('');

      expect(role).toBe('user');
      expect(mockCollection.doc).not.toHaveBeenCalled();
    });

    it('should return "user" role for null Bitrix user ID', async () => {
      const role = await service.getUserRole(null);

      expect(role).toBe('user');
      expect(mockCollection.doc).not.toHaveBeenCalled();
    });

    it('should return "user" role for undefined Bitrix user ID', async () => {
      const role = await service.getUserRole(undefined);

      expect(role).toBe('user');
      expect(mockCollection.doc).not.toHaveBeenCalled();
    });
  });

  describe('Cache Behavior', () => {
    it('should cache role after first retrieval (cache miss → cache hit)', async () => {
      // First call - cache miss
      mockDoc.exists = true;
      mockDoc.data.mockReturnValue({
        role: 'admin',
        internalUserId: 'testuser'
      });
      mockDoc.get.mockResolvedValue(mockDoc);

      const role1 = await service.getUserRole('123');
      expect(role1).toBe('admin');
      expect(service.metrics.cacheMisses).toBe(1);
      expect(service.metrics.cacheHits).toBe(0);
      expect(mockDoc.get).toHaveBeenCalledTimes(1);

      // Second call - cache hit
      const role2 = await service.getUserRole('123');
      expect(role2).toBe('admin');
      expect(service.metrics.cacheMisses).toBe(1);
      expect(service.metrics.cacheHits).toBe(1);
      expect(mockDoc.get).toHaveBeenCalledTimes(1); // Should not call Firestore again
    });

    it('should expire cache after TTL (5 minutes)', async () => {
      // Override cache timeout to 100ms for testing
      service.cacheTimeout = 100;

      // First call - cache miss
      mockDoc.exists = true;
      mockDoc.data.mockReturnValue({ role: 'admin' });
      mockDoc.get.mockResolvedValue(mockDoc);

      await service.getUserRole('123');
      expect(mockDoc.get).toHaveBeenCalledTimes(1);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Second call after expiration - should fetch from Firestore again
      await service.getUserRole('123');
      expect(mockDoc.get).toHaveBeenCalledTimes(2);
      expect(service.metrics.cacheMisses).toBe(2);
    });

    it('should invalidate cache for specific user', async () => {
      // Populate cache
      mockDoc.exists = true;
      mockDoc.data.mockReturnValue({ role: 'user' });
      mockDoc.get.mockResolvedValue(mockDoc);

      await service.getUserRole('123');
      expect(service.cache.has('123')).toBe(true);

      // Invalidate cache
      service.invalidateCache('123');
      expect(service.cache.has('123')).toBe(false);
    });

    it('should clear entire cache', async () => {
      // Populate cache with multiple users
      mockDoc.exists = true;
      mockDoc.data.mockReturnValue({ role: 'user' });
      mockDoc.get.mockResolvedValue(mockDoc);

      await service.getUserRole('123');
      await service.getUserRole('456');
      await service.getUserRole('789');

      expect(service.cache.size).toBe(3);

      // Clear cache
      service.clearCache();
      expect(service.cache.size).toBe(0);
    });

    it('should implement LRU eviction when cache exceeds max size', async () => {
      // Set small max cache size for testing
      service.maxCacheSize = 3;

      mockDoc.exists = true;
      mockDoc.data.mockReturnValue({ role: 'user' });
      mockDoc.get.mockResolvedValue(mockDoc);

      // Add 4 users (exceeds maxCacheSize of 3)
      await service.getUserRole('user1');
      await service.getUserRole('user2');
      await service.getUserRole('user3');
      await service.getUserRole('user4'); // Should evict user1

      expect(service.cache.size).toBe(3);
      expect(service.cache.has('user1')).toBe(false); // Oldest entry evicted
      expect(service.cache.has('user2')).toBe(true);
      expect(service.cache.has('user3')).toBe(true);
      expect(service.cache.has('user4')).toBe(true);
    });
  });

  describe('updateUserRole', () => {
    it('should update role in both collections and invalidate cache', async () => {
      // Mock existing user
      mockDoc.exists = true;
      mockDoc.data.mockReturnValue({
        role: 'user',
        internalUserId: 'testuser',
        email: 'test@example.com'
      });
      mockDoc.get.mockResolvedValue(mockDoc);
      mockDoc.update.mockResolvedValue({});

      // Populate cache first
      await service.getUserRole('123');
      expect(service.cache.has('123')).toBe(true);

      // Clear mock call count from getUserRole (which calls updateLastSeen)
      mockDoc.update.mockClear();

      // Update role
      const result = await service.updateUserRole('123', 'admin');

      expect(result.success).toBe(true);
      expect(result.oldRole).toBe('user');
      expect(result.newRole).toBe('admin');
      expect(mockDoc.update).toHaveBeenCalledTimes(2); // bitrix_users and users
      expect(service.cache.has('123')).toBe(false); // Cache invalidated
    });

    it('should throw error for invalid role', async () => {
      await expect(service.updateUserRole('123', 'invalid')).rejects.toThrow(
        'Role must be one of: admin, user'
      );
    });

    it('should throw error for non-existent user', async () => {
      mockDoc.exists = false;
      mockDoc.get.mockResolvedValue(mockDoc);

      await expect(service.updateUserRole('999', 'admin')).rejects.toThrow(
        'Bitrix user 999 not found'
      );
    });

    it('should validate role is string', async () => {
      await expect(service.updateUserRole('123', 123)).rejects.toThrow(
        'Role must be a string'
      );
    });

    it('should validate role is not empty', async () => {
      await expect(service.updateUserRole('123', '')).rejects.toThrow(
        'Role must be a string'
      );
    });
  });

  describe('Error Handling', () => {
    it('should return "user" role on Firestore error', async () => {
      mockDoc.get.mockRejectedValue(new Error('Firestore connection failed'));

      const role = await service.getUserRole('123');

      expect(role).toBe('user'); // Fail-safe default
    });

    it('should handle undefined role in Firestore data', async () => {
      mockDoc.exists = true;
      mockDoc.data.mockReturnValue({
        bitrixUserId: '123',
        internalUserId: 'testuser'
        // role is undefined
      });
      mockDoc.get.mockResolvedValue(mockDoc);

      const role = await service.getUserRole('123');

      expect(role).toBe('user'); // Default to 'user' if role missing
    });
  });

  describe('Cache Statistics', () => {
    it('should calculate cache hit rate correctly', async () => {
      mockDoc.exists = true;
      mockDoc.data.mockReturnValue({ role: 'admin' });
      mockDoc.get.mockResolvedValue(mockDoc);

      // 1 cache miss
      await service.getUserRole('123');

      // 2 cache hits
      await service.getUserRole('123');
      await service.getUserRole('123');

      const stats = service.getCacheStats();

      expect(stats.cacheHits).toBe(2);
      expect(stats.cacheMisses).toBe(1);
      expect(stats.hitRate).toBe('66.67%'); // 2/3 = 66.67%
    });

    it('should return 0% hit rate with no requests', () => {
      const stats = service.getCacheStats();

      expect(stats.hitRate).toBe('0.00%');
    });

    it('should track Firestore read count', async () => {
      mockDoc.exists = true;
      mockDoc.data.mockReturnValue({ role: 'user' });
      mockDoc.get.mockResolvedValue(mockDoc);

      await service.getUserRole('123');
      await service.getUserRole('456');

      const stats = service.getCacheStats();

      expect(stats.firestoreReads).toBe(2);
    });

    it('should track unknown users count', async () => {
      mockDoc.exists = false;
      mockDoc.get.mockResolvedValue(mockDoc);

      await service.getUserRole('999');
      await service.getUserRole('888');

      const stats = service.getCacheStats();

      expect(stats.unknownUsers).toBe(2);
    });
  });

  describe('Input Validation', () => {
    it('should validate bitrixUserId is not too long', async () => {
      const longId = 'a'.repeat(101);

      await expect(service.updateUserRole(longId, 'admin')).rejects.toThrow(
        'bitrixUserId exceeds maximum length of 100 characters'
      );
    });

    it('should trim whitespace from bitrixUserId', async () => {
      mockDoc.exists = true;
      mockDoc.data.mockReturnValue({
        role: 'admin',
        internalUserId: 'test'
      });
      mockDoc.get.mockResolvedValue(mockDoc);
      mockDoc.update.mockResolvedValue({});

      await service.updateUserRole('  123  ', 'admin');

      expect(mockCollection.doc).toHaveBeenCalledWith('123');
    });

    it('should normalize role to lowercase', async () => {
      mockDoc.exists = true;
      mockDoc.data.mockReturnValue({
        role: 'user',
        internalUserId: 'test'
      });
      mockDoc.get.mockResolvedValue(mockDoc);
      mockDoc.update.mockResolvedValue({});

      const result = await service.updateUserRole('123', 'ADMIN');

      expect(result.newRole).toBe('admin');
    });
  });

  describe('getAllBitrixUsers', () => {
    it('should retrieve all users ordered by lastSeen', async () => {
      const mockSnapshot = {
        forEach: jest.fn((callback) => {
          callback({ id: '123', data: () => ({ role: 'admin', email: 'admin@test.com' }) });
          callback({ id: '456', data: () => ({ role: 'user', email: 'user@test.com' }) });
        })
      };

      mockCollection.orderBy.mockReturnValue({
        get: jest.fn().mockResolvedValue(mockSnapshot)
      });

      const users = await service.getAllBitrixUsers();

      expect(users).toHaveLength(2);
      expect(users[0].bitrixUserId).toBe('123');
      expect(users[0].role).toBe('admin');
      expect(users[1].bitrixUserId).toBe('456');
      expect(mockCollection.orderBy).toHaveBeenCalledWith('lastSeen', 'desc');
    });

    it('should handle empty user list', async () => {
      const mockSnapshot = {
        forEach: jest.fn()
      };

      mockCollection.orderBy.mockReturnValue({
        get: jest.fn().mockResolvedValue(mockSnapshot)
      });

      const users = await service.getAllBitrixUsers();

      expect(users).toEqual([]);
    });
  });
});
