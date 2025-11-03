/**
 * Unit Tests for ToolRegistry Role-Based Filtering
 *
 * Tests tool access control based on user roles for RBAC system
 */

const { ToolRegistry } = require('../../lib/toolLoader');
const BaseTool = require('../../lib/baseTool');

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock tool access control config
jest.mock('../../config/toolAccessControl', () => {
  const TOOL_ACCESS_CONTROL = {
    // All users tools
    bitrixChatSummary: ['user', 'admin'],
    weather: ['user', 'admin'],
    webSearch: ['user', 'admin'],

    // Admin-only tools
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
        return normalizedRole === 'admin'; // Fail-secure
      }
      return allowedRoles.includes(normalizedRole);
    },
    validateConfiguration: jest.fn()
  };
});

// Mock tool classes
class MockAllUsersTool extends BaseTool {
  constructor(name = 'bitrixChatSummary') {
    super();
    this.name = name;
    this.description = 'All users tool';
    this.category = 'communication';
    this.enabled = true;
  }
  async execute() { return { success: true }; }
}

class MockAdminTool extends BaseTool {
  constructor(name = 'taskManagement') {
    super();
    this.name = name;
    this.description = 'Admin only tool';
    this.category = 'management';
    this.enabled = true;
  }
  async execute() { return { success: true }; }
}

class MockDisabledTool extends BaseTool {
  constructor() {
    super();
    this.name = 'disabledTool';
    this.description = 'Disabled tool';
    this.category = 'test';
    this.enabled = false;
  }
  async execute() { return { success: true }; }
}

class MockUnknownTool extends BaseTool {
  constructor() {
    super();
    this.name = 'unknownTool';
    this.description = 'Tool not in config';
    this.category = 'test';
    this.enabled = true;
  }
  async execute() { return { success: true }; }
}

describe('ToolRegistry - Role-Based Filtering', () => {
  let registry;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new ToolRegistry();
  });

  describe('getToolsForUser - Admin Role', () => {
    beforeEach(() => {
      // Register test tools
      registry.register(new MockAllUsersTool());
      registry.register(new MockAdminTool());
    });

    it('should return all enabled tools for admin users', () => {
      const tools = registry.getToolsForUser('admin');

      expect(tools).toHaveLength(2);
      expect(tools.map(t => t.name)).toContain('bitrixChatSummary');
      expect(tools.map(t => t.name)).toContain('taskManagement');
    });

    it('should include admin-only tools for admin role', () => {
      const tools = registry.getToolsForUser('admin');

      const adminTool = tools.find(t => t.name === 'taskManagement');
      expect(adminTool).toBeDefined();
    });

    it('should include all-users tools for admin role', () => {
      const tools = registry.getToolsForUser('admin');

      const allUsersTool = tools.find(t => t.name === 'bitrixChatSummary');
      expect(allUsersTool).toBeDefined();
    });
  });

  describe('getToolsForUser - User Role', () => {
    beforeEach(() => {
      registry.register(new MockAllUsersTool());
      registry.register(new MockAdminTool());
    });

    it('should return only all-users tools for regular users', () => {
      const tools = registry.getToolsForUser('user');

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('bitrixChatSummary');
    });

    it('should NOT include admin-only tools for user role', () => {
      const tools = registry.getToolsForUser('user');

      const adminTool = tools.find(t => t.name === 'taskManagement');
      expect(adminTool).toBeUndefined();
    });

    it('should include all-users tools for user role', () => {
      const tools = registry.getToolsForUser('user');

      const allUsersTool = tools.find(t => t.name === 'bitrixChatSummary');
      expect(allUsersTool).toBeDefined();
    });
  });

  describe('Tool Not in Access Control Config (Fail-Secure)', () => {
    beforeEach(() => {
      registry.register(new MockUnknownTool());
    });

    it('should default to admin-only for unknown tools (fail-secure)', () => {
      const userTools = registry.getToolsForUser('user');
      const adminTools = registry.getToolsForUser('admin');

      expect(userTools.find(t => t.name === 'unknownTool')).toBeUndefined();
      expect(adminTools.find(t => t.name === 'unknownTool')).toBeDefined();
    });

    it('should allow admin access to unknown tools', () => {
      const tools = registry.getToolsForUser('admin');

      const unknownTool = tools.find(t => t.name === 'unknownTool');
      expect(unknownTool).toBeDefined();
    });

    it('should deny user access to unknown tools', () => {
      const tools = registry.getToolsForUser('user');

      const unknownTool = tools.find(t => t.name === 'unknownTool');
      expect(unknownTool).toBeUndefined();
    });
  });

  describe('Disabled Tools Handling', () => {
    beforeEach(() => {
      registry.register(new MockDisabledTool());
      registry.register(new MockAllUsersTool());
    });

    it('should exclude disabled tools regardless of role', () => {
      const adminTools = registry.getToolsForUser('admin');
      const userTools = registry.getToolsForUser('user');

      expect(adminTools.find(t => t.name === 'disabledTool')).toBeUndefined();
      expect(userTools.find(t => t.name === 'disabledTool')).toBeUndefined();
    });

    it('should still include enabled tools', () => {
      const tools = registry.getToolsForUser('admin');

      expect(tools.find(t => t.name === 'bitrixChatSummary')).toBeDefined();
    });
  });

  describe('Tool Filtering Count Verification', () => {
    beforeEach(() => {
      // Register mix of tools
      registry.register(new MockAllUsersTool('bitrixChatSummary'));
      registry.register(new MockAllUsersTool('weather'));
      registry.register(new MockAllUsersTool('webSearch'));
      registry.register(new MockAdminTool('taskManagement'));
      registry.register(new MockAdminTool('knowledgeManagement'));
      registry.register(new MockAdminTool('threecxCallRecords'));
    });

    it('should return correct count for admin (all enabled tools)', () => {
      const tools = registry.getToolsForUser('admin');

      expect(tools).toHaveLength(6); // 3 all-users + 3 admin-only
    });

    it('should return correct count for user (only all-users tools)', () => {
      const tools = registry.getToolsForUser('user');

      expect(tools).toHaveLength(3); // Only all-users tools
    });

    it('should filter out exactly the right number of tools', () => {
      const allTools = registry.getEnabledTools();
      const userTools = registry.getToolsForUser('user');
      const adminOnlyCount = allTools.length - userTools.length;

      expect(adminOnlyCount).toBe(3); // 3 admin-only tools filtered out
    });
  });

  describe('Default Role Behavior', () => {
    beforeEach(() => {
      registry.register(new MockAllUsersTool());
      registry.register(new MockAdminTool());
    });

    it('should default to "user" role when no role specified', () => {
      const tools = registry.getToolsForUser(); // No role parameter

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('bitrixChatSummary');
    });

    it('should default to "user" role for undefined', () => {
      const tools = registry.getToolsForUser(undefined);

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('bitrixChatSummary');
    });

    it('should default to "user" role for null', () => {
      const tools = registry.getToolsForUser(null);

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('bitrixChatSummary');
    });
  });

  describe('Edge Cases', () => {
    it('should return empty array when no tools registered', () => {
      const tools = registry.getToolsForUser('admin');

      expect(tools).toEqual([]);
    });

    it('should return empty array when all tools disabled', () => {
      registry.register(new MockDisabledTool());

      const tools = registry.getToolsForUser('admin');

      expect(tools).toEqual([]);
    });

    it('should handle case-sensitive role comparison', () => {
      registry.register(new MockAllUsersTool());
      registry.register(new MockAdminTool());

      // Case matters - 'Admin' !== 'admin'
      const tools = registry.getToolsForUser('Admin');

      // Should only get all-users tools since role doesn't match 'admin'
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('bitrixChatSummary');
    });

    it('should handle invalid role gracefully', () => {
      registry.register(new MockAllUsersTool());
      registry.register(new MockAdminTool());

      const tools = registry.getToolsForUser('invalid-role');

      // Should default to most restrictive (user-like behavior)
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('bitrixChatSummary');
    });
  });

  describe('Comparison with getEnabledTools', () => {
    beforeEach(() => {
      registry.register(new MockAllUsersTool());
      registry.register(new MockAdminTool());
      registry.register(new MockDisabledTool());
    });

    it('getEnabledTools should return all enabled tools regardless of role', () => {
      const enabledTools = registry.getEnabledTools();

      expect(enabledTools).toHaveLength(2); // Only enabled tools
      expect(enabledTools.map(t => t.name)).toContain('bitrixChatSummary');
      expect(enabledTools.map(t => t.name)).toContain('taskManagement');
    });

    it('getToolsForUser(admin) should match getEnabledTools count', () => {
      const enabledTools = registry.getEnabledTools();
      const adminTools = registry.getToolsForUser('admin');

      expect(adminTools.length).toBe(enabledTools.length);
    });

    it('getToolsForUser(user) should be subset of getEnabledTools', () => {
      const enabledTools = registry.getEnabledTools();
      const userTools = registry.getToolsForUser('user');

      expect(userTools.length).toBeLessThan(enabledTools.length);
    });
  });

  describe('Multiple Tool Registration', () => {
    it('should correctly filter large number of tools', () => {
      // Register 10 tools with known access (all-users)
      registry.register(new MockAllUsersTool('bitrixChatSummary'));
      registry.register(new MockAllUsersTool('weather'));
      registry.register(new MockAllUsersTool('webSearch'));

      // Register 3 tools with known access (admin-only)
      registry.register(new MockAdminTool('taskManagement'));
      registry.register(new MockAdminTool('knowledgeManagement'));
      registry.register(new MockAdminTool('threecxCallRecords'));

      // Register 9 unknown tools (will default to admin-only due to fail-secure)
      for (let i = 0; i < 9; i++) {
        registry.register(new MockAdminTool(`unknownTool${i}`));
      }

      const adminTools = registry.getToolsForUser('admin');
      const userTools = registry.getToolsForUser('user');

      expect(adminTools).toHaveLength(15); // All tools (3 all-users + 12 admin/unknown)
      expect(userTools).toHaveLength(3); // Only known all-users tools
    });
  });
});
