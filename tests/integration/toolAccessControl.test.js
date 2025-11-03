/**
 * Integration Tests for Tool Access Control (RBAC)
 *
 * Tests complete RBAC flow: user role retrieval → tool filtering → tool execution
 */

const request = require('supertest');
const express = require('express');
const bodyParser = require('body-parser');
const { ToolRegistry } = require('../../lib/toolLoader');
const { UserRoleService } = require('../../services/userRoleService');
const BaseTool = require('../../lib/baseTool');

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

// Mock Firestore
const mockFirestore = {
  collection: jest.fn()
};

jest.mock('../../config/firestore', () => ({
  getFirestore: jest.fn(() => mockFirestore),
  getFieldValue: jest.fn(() => ({
    serverTimestamp: jest.fn(() => 'TIMESTAMP')
  }))
}));

// Mock tool access control
jest.mock('../../config/toolAccessControl', () => {
  const TOOL_ACCESS_CONTROL = {
    bitrixChatSummary: ['user', 'admin'],
    weather: ['user', 'admin'],
    webSearch: ['user', 'admin'],
    taskManagement: ['admin'],
    knowledgeManagement: ['admin'],
    threecxCallRecords: ['admin']
  };

  return {
    TOOL_ACCESS_CONTROL,
    hasAccess: function(toolName, userRole = 'user') {
      // Normalize role to 'user' for null/undefined/invalid values (fail-safe)
      const normalizedRole = (userRole === 'admin' || userRole === 'user') ? userRole : 'user';

      const allowedRoles = TOOL_ACCESS_CONTROL[toolName];
      if (!allowedRoles) {
        return normalizedRole === 'admin';
      }
      return allowedRoles.includes(normalizedRole);
    },
    validateConfiguration: jest.fn()
  };
});

// Mock tool classes
class MockAllUsersTool extends BaseTool {
  constructor(name) {
    super();
    this.name = name || 'bitrixChatSummary';
    this.description = 'All users tool';
    this.category = 'communication';
    this.enabled = true;
  }
  async execute() {
    return { success: true, message: 'All users tool executed' };
  }
}

class MockAdminTool extends BaseTool {
  constructor(name) {
    super();
    this.name = name || 'taskManagement';
    this.description = 'Admin only tool';
    this.category = 'management';
    this.enabled = true;
  }
  async execute() {
    return { success: true, message: 'Admin tool executed' };
  }
}

describe('Tool Access Control Integration Tests', () => {
  let userRoleService;
  let toolRegistry;
  let mockDoc;
  let mockCollection;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock Firestore
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

    // Initialize services
    userRoleService = new UserRoleService();
    userRoleService.db = mockFirestore;

    toolRegistry = new ToolRegistry();

    // Register test tools
    toolRegistry.register(new MockAllUsersTool('bitrixChatSummary'));
    toolRegistry.register(new MockAllUsersTool('weather'));
    toolRegistry.register(new MockAllUsersTool('webSearch'));
    toolRegistry.register(new MockAdminTool('taskManagement'));
    toolRegistry.register(new MockAdminTool('knowledgeManagement'));
    toolRegistry.register(new MockAdminTool('threecxCallRecords'));
  });

  describe('Admin User Access', () => {
    beforeEach(() => {
      // Mock admin user
      mockDoc.exists = true;
      mockDoc.data.mockReturnValue({
        bitrixUserId: 'admin-123',
        internalUserId: 'admin',
        role: 'admin',
        email: 'admin@example.com'
      });
      mockDoc.get.mockResolvedValue(mockDoc);
    });

    it('should allow admin to access all tools (6 tools)', async () => {
      const role = await userRoleService.getUserRole('admin-123');
      const tools = toolRegistry.getToolsForUser(role);

      expect(role).toBe('admin');
      expect(tools).toHaveLength(6);
      expect(tools.map(t => t.name)).toEqual(
        expect.arrayContaining([
          'bitrixChatSummary',
          'weather',
          'webSearch',
          'taskManagement',
          'knowledgeManagement',
          'threecxCallRecords'
        ])
      );
    });

    it('should allow admin to access admin-only tools', async () => {
      const role = await userRoleService.getUserRole('admin-123');
      const tools = toolRegistry.getToolsForUser(role);

      const adminTools = tools.filter(t =>
        ['taskManagement', 'knowledgeManagement', 'threecxCallRecords'].includes(t.name)
      );

      expect(adminTools).toHaveLength(3);
    });

    it('should allow admin to execute admin-only tools', async () => {
      const role = await userRoleService.getUserRole('admin-123');
      const tools = toolRegistry.getToolsForUser(role);

      const taskManagementTool = tools.find(t => t.name === 'taskManagement');
      expect(taskManagementTool).toBeDefined();

      const result = await taskManagementTool.execute({}, {});
      expect(result.success).toBe(true);
    });

    it('should allow admin to execute all-users tools', async () => {
      const role = await userRoleService.getUserRole('admin-123');
      const tools = toolRegistry.getToolsForUser(role);

      const chatTool = tools.find(t => t.name === 'bitrixChatSummary');
      expect(chatTool).toBeDefined();

      const result = await chatTool.execute({}, {});
      expect(result.success).toBe(true);
    });
  });

  describe('Regular User Access', () => {
    beforeEach(() => {
      // Mock regular user
      mockDoc.exists = true;
      mockDoc.data.mockReturnValue({
        bitrixUserId: 'user-456',
        internalUserId: 'regularuser',
        role: 'user',
        email: 'user@example.com'
      });
      mockDoc.get.mockResolvedValue(mockDoc);
    });

    it('should allow regular user to access only all-users tools (3 tools)', async () => {
      const role = await userRoleService.getUserRole('user-456');
      const tools = toolRegistry.getToolsForUser(role);

      expect(role).toBe('user');
      expect(tools).toHaveLength(3);
      expect(tools.map(t => t.name)).toEqual(
        expect.arrayContaining(['bitrixChatSummary', 'weather', 'webSearch'])
      );
    });

    it('should NOT allow regular user to access admin-only tools', async () => {
      const role = await userRoleService.getUserRole('user-456');
      const tools = toolRegistry.getToolsForUser(role);

      const adminTools = tools.filter(t =>
        ['taskManagement', 'knowledgeManagement', 'threecxCallRecords'].includes(t.name)
      );

      expect(adminTools).toHaveLength(0);
    });

    it('should allow regular user to execute all-users tools', async () => {
      const role = await userRoleService.getUserRole('user-456');
      const tools = toolRegistry.getToolsForUser(role);

      const weatherTool = tools.find(t => t.name === 'weather');
      expect(weatherTool).toBeDefined();

      const result = await weatherTool.execute({}, {});
      expect(result.success).toBe(true);
    });

    it('should prevent regular user from executing admin tools (not in tool list)', async () => {
      const role = await userRoleService.getUserRole('user-456');
      const tools = toolRegistry.getToolsForUser(role);

      const taskManagementTool = tools.find(t => t.name === 'taskManagement');
      expect(taskManagementTool).toBeUndefined(); // Tool not available
    });
  });

  describe('Unknown Bitrix User (Fail-Safe)', () => {
    beforeEach(() => {
      // Mock unknown user (not in database)
      mockDoc.exists = false;
      mockDoc.get.mockResolvedValue(mockDoc);
    });

    it('should default unknown user to "user" role', async () => {
      const role = await userRoleService.getUserRole('unknown-999');

      expect(role).toBe('user'); // Fail-safe default
      expect(userRoleService.metrics.unknownUsers).toBe(1);
    });

    it('should grant unknown user only all-users tools (3 tools)', async () => {
      const role = await userRoleService.getUserRole('unknown-999');
      const tools = toolRegistry.getToolsForUser(role);

      expect(tools).toHaveLength(3);
      expect(tools.map(t => t.name)).toEqual(
        expect.arrayContaining(['bitrixChatSummary', 'weather', 'webSearch'])
      );
    });

    it('should NOT grant unknown user admin tools', async () => {
      const role = await userRoleService.getUserRole('unknown-999');
      const tools = toolRegistry.getToolsForUser(role);

      const adminTools = tools.filter(t =>
        ['taskManagement', 'knowledgeManagement', 'threecxCallRecords'].includes(t.name)
      );

      expect(adminTools).toHaveLength(0);
    });
  });

  describe('Tool Filtering Based on Role', () => {
    it('should filter out exactly 3 admin tools for regular users', async () => {
      // Admin user
      mockDoc.exists = true;
      mockDoc.data.mockReturnValue({ role: 'admin' });
      mockDoc.get.mockResolvedValue(mockDoc);

      const adminRole = await userRoleService.getUserRole('admin-123');
      const adminTools = toolRegistry.getToolsForUser(adminRole);

      // Regular user
      mockDoc.data.mockReturnValue({ role: 'user' });
      const userRole = await userRoleService.getUserRole('user-456');
      const userTools = toolRegistry.getToolsForUser(userRole);

      const filteredCount = adminTools.length - userTools.length;
      expect(filteredCount).toBe(3); // 3 admin-only tools filtered out
    });

    it('should apply correct filtering for multiple users in sequence', async () => {
      // First user: admin
      mockDoc.exists = true;
      mockDoc.data.mockReturnValue({ role: 'admin' });
      mockDoc.get.mockResolvedValue(mockDoc);

      const role1 = await userRoleService.getUserRole('admin-123');
      const tools1 = toolRegistry.getToolsForUser(role1);

      expect(tools1).toHaveLength(6);

      // Second user: regular user
      mockDoc.data.mockReturnValue({ role: 'user' });
      const role2 = await userRoleService.getUserRole('user-456');
      const tools2 = toolRegistry.getToolsForUser(role2);

      expect(tools2).toHaveLength(3);

      // Third user: another admin
      mockDoc.data.mockReturnValue({ role: 'admin' });
      const role3 = await userRoleService.getUserRole('admin-789');
      const tools3 = toolRegistry.getToolsForUser(role3);

      expect(tools3).toHaveLength(6);
    });
  });

  describe('Role Caching Integration', () => {
    beforeEach(() => {
      mockDoc.exists = true;
      mockDoc.data.mockReturnValue({
        bitrixUserId: 'user-123',
        role: 'admin'
      });
      mockDoc.get.mockResolvedValue(mockDoc);
    });

    it('should cache role after first lookup', async () => {
      // First lookup
      const role1 = await userRoleService.getUserRole('user-123');
      expect(mockDoc.get).toHaveBeenCalledTimes(1);

      // Second lookup (from cache)
      const role2 = await userRoleService.getUserRole('user-123');
      expect(mockDoc.get).toHaveBeenCalledTimes(1); // No additional Firestore call
      expect(role2).toBe(role1);
    });

    it('should use cached role for tool filtering', async () => {
      // First lookup (cache miss)
      const role1 = await userRoleService.getUserRole('user-123');
      const tools1 = toolRegistry.getToolsForUser(role1);

      expect(mockDoc.get).toHaveBeenCalledTimes(1);
      expect(tools1).toHaveLength(6); // Admin tools

      // Second lookup (cache hit)
      const role2 = await userRoleService.getUserRole('user-123');
      const tools2 = toolRegistry.getToolsForUser(role2);

      expect(mockDoc.get).toHaveBeenCalledTimes(1); // Still just one Firestore call
      expect(tools2).toHaveLength(6);
    });

    it('should invalidate cache after role update', async () => {
      // Initial lookup
      await userRoleService.getUserRole('user-123');
      expect(userRoleService.cache.has('user-123')).toBe(true);

      // Update role (invalidates cache)
      mockDoc.data.mockReturnValue({
        bitrixUserId: 'user-123',
        role: 'user',
        internalUserId: 'testuser'
      });
      mockDoc.update.mockResolvedValue({});

      await userRoleService.updateUserRole('user-123', 'user');
      expect(userRoleService.cache.has('user-123')).toBe(false);

      // Next lookup should fetch from Firestore again
      await userRoleService.getUserRole('user-123');
      expect(mockDoc.get).toHaveBeenCalledTimes(3); // Initial + update check + post-invalidation
    });
  });

  describe('End-to-End RBAC Flow', () => {
    it('should complete full RBAC flow: unknown user → role lookup → tool filtering → execution', async () => {
      // Step 1: Unknown user tries to access system
      mockDoc.exists = false;
      mockDoc.get.mockResolvedValue(mockDoc);

      const role = await userRoleService.getUserRole('new-user-999');
      expect(role).toBe('user'); // Defaults to 'user'

      // Step 2: Get filtered tools
      const tools = toolRegistry.getToolsForUser(role);
      expect(tools).toHaveLength(3); // Only all-users tools

      // Step 3: Execute allowed tool
      const allowedTool = tools.find(t => t.name === 'bitrixChatSummary');
      expect(allowedTool).toBeDefined();

      const result = await allowedTool.execute({}, {});
      expect(result.success).toBe(true);

      // Step 4: Verify admin tool is not accessible
      const adminTool = tools.find(t => t.name === 'taskManagement');
      expect(adminTool).toBeUndefined();
    });

    it('should complete full RBAC flow: admin user → role lookup → tool filtering → execution', async () => {
      // Step 1: Admin user accesses system
      mockDoc.exists = true;
      mockDoc.data.mockReturnValue({
        role: 'admin',
        internalUserId: 'admin'
      });
      mockDoc.get.mockResolvedValue(mockDoc);

      const role = await userRoleService.getUserRole('admin-123');
      expect(role).toBe('admin');

      // Step 2: Get all tools
      const tools = toolRegistry.getToolsForUser(role);
      expect(tools).toHaveLength(6); // All tools

      // Step 3: Execute admin tool
      const adminTool = tools.find(t => t.name === 'knowledgeManagement');
      expect(adminTool).toBeDefined();

      const adminResult = await adminTool.execute({}, {});
      expect(adminResult.success).toBe(true);

      // Step 4: Execute all-users tool
      const userTool = tools.find(t => t.name === 'weather');
      expect(userTool).toBeDefined();

      const userResult = await userTool.execute({}, {});
      expect(userResult.success).toBe(true);
    });
  });

  describe('Performance and Metrics', () => {
    beforeEach(() => {
      mockDoc.exists = true;
      mockDoc.data.mockReturnValue({ role: 'admin' });
      mockDoc.get.mockResolvedValue(mockDoc);
    });

    it('should track cache hit rate correctly across multiple requests', async () => {
      // 3 requests for same user
      await userRoleService.getUserRole('user-123');
      await userRoleService.getUserRole('user-123');
      await userRoleService.getUserRole('user-123');

      const stats = userRoleService.getCacheStats();

      expect(stats.cacheHits).toBe(2); // 2 cache hits
      expect(stats.cacheMisses).toBe(1); // 1 cache miss
      expect(stats.hitRate).toBe('66.67%');
    });

    it('should minimize Firestore reads with caching', async () => {
      // 10 requests for same user
      for (let i = 0; i < 10; i++) {
        await userRoleService.getUserRole('user-123');
      }

      expect(mockDoc.get).toHaveBeenCalledTimes(1); // Only 1 Firestore read
      expect(userRoleService.metrics.firestoreReads).toBe(1);
    });
  });
});
