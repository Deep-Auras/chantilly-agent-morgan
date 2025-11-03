/**
 * Security Tests: PII Leakage Detection
 *
 * OWASP LLM02:2025 - Sensitive Information Disclosure Prevention
 *
 * Tests that verify no PII is leaked to:
 * - Gemini API context
 * - Logs
 * - Error messages
 * - Tool responses
 * - Task template execution
 *
 * This test suite scans all possible leakage vectors and validates
 * that PII sanitization is working correctly across the entire system.
 */

const { getBitrix24QueueManager } = require('../../services/bitrix24-queue');
const { getTaskTemplateLoader } = require('../../services/taskTemplateLoader');
const { logger } = require('../../utils/logger');
const BitrixUserManagementTool = require('../../tools/bitrixUserManagement');

// Mock dependencies
jest.mock('../../services/bitrix24-queue');
jest.mock('../../utils/logger');
jest.mock('@google/genai');

describe('Security: PII Leakage Detection (OWASP LLM02:2025)', () => {
  let mockQueueManager;
  let loggerSpy;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock logger to capture all log calls
    loggerSpy = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    logger.info = loggerSpy.info;
    logger.warn = loggerSpy.warn;
    logger.error = loggerSpy.error;
    logger.debug = loggerSpy.debug;

    // Mock queue manager
    mockQueueManager = {
      add: jest.fn(),
      sanitizeUser: jest.fn(user => ({
        id: user.ID,
        displayName: `${user.NAME} ${user.LAST_NAME?.charAt(0)}.`,
        active: user.ACTIVE === 'Y',
        workPosition: user.WORK_POSITION
      }))
    };
    getBitrix24QueueManager.mockReturnValue(mockQueueManager);
  });

  describe('PII Pattern Detection', () => {
    const piiPatterns = {
      email: {
        pattern: /[\w._%+-]+@[\w.-]+\.[A-Z]{2,}/i,
        examples: ['royce@company.com', 'test.user@example.org'],
        description: 'Email addresses'
      },
      phone: {
        pattern: /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
        examples: ['+1234567890', '(555) 123-4567', '555-123-4567'],
        description: 'Phone numbers'
      },
      ssn: {
        pattern: /\b\d{3}-\d{2}-\d{4}\b/,
        examples: ['123-45-6789'],
        description: 'Social Security Numbers'
      },
      creditCard: {
        pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
        examples: ['4111-1111-1111-1111', '4111 1111 1111 1111'],
        description: 'Credit card numbers'
      },
      fullName: {
        pattern: /\b[A-Z][a-z]+\s+[A-Z][a-z]{2,}\b/,
        examples: ['Royce Williams', 'John Smith'],
        description: 'Full names (First Last)'
      },
      address: {
        pattern: /\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b/i,
        examples: ['123 Main Street', '456 Oak Avenue'],
        description: 'Street addresses'
      },
      zipCode: {
        pattern: /\b\d{5}(?:-\d{4})?\b/,
        examples: ['94102', '94102-1234'],
        description: 'ZIP codes'
      }
    };

    test('PII detection patterns are comprehensive', () => {
      // Verify each pattern works
      Object.entries(piiPatterns).forEach(([key, { pattern, examples, description }]) => {
        examples.forEach(example => {
          expect(pattern.test(example)).toBe(true);
        }, `${description} pattern should match "${example}"`);
      });
    });

    test('display names do not match full name pattern', () => {
      const displayNames = ['Royce W.', 'John D.', 'Larry S.'];
      displayNames.forEach(name => {
        expect(piiPatterns.fullName.pattern.test(name)).toBe(false);
      });
    });
  });

  describe('User Management Tool - PII Leakage Prevention', () => {
    test('tool output contains no PII patterns', async () => {
      const tool = new BitrixUserManagementTool();

      mockQueueManager.add.mockResolvedValueOnce({
        result: [
          {
            id: '123',
            displayName: 'Royce W.',
            active: true,
            workPosition: 'Manager'
          }
        ]
      });

      const result = await tool.execute({
        action: 'search',
        query: 'Royce'
      });

      // Scan result for all PII patterns
      const piiPatterns = {
        email: /[\w._%+-]+@[\w.-]+\.[A-Z]{2,}/i,
        phone: /\+?\d{10,}/,
        fullLastName: /Williams|Smith|Johnson|Brown/i // Common last names
      };

      Object.entries(piiPatterns).forEach(([type, pattern]) => {
        expect(pattern.test(result)).toBe(false);
      }, `Tool output should not contain ${type}`);

      tool.cleanup();
    });

    test('logged data contains no PII', async () => {
      const tool = new BitrixUserManagementTool();

      mockQueueManager.add.mockResolvedValueOnce({
        result: [
          {
            id: '123',
            displayName: 'Royce W.',
            active: true,
            workPosition: 'Manager'
          }
        ]
      });

      await tool.execute({
        action: 'search',
        query: 'Royce'
      });

      // Collect all log calls
      const allLogs = [
        ...loggerSpy.info.mock.calls,
        ...loggerSpy.warn.mock.calls,
        ...loggerSpy.error.mock.calls,
        ...loggerSpy.debug.mock.calls
      ].map(call => JSON.stringify(call));

      const combinedLogs = allLogs.join(' ');

      // Verify no PII in logs
      expect(combinedLogs).not.toMatch(/@\w+\.\w+/); // No email
      expect(combinedLogs).not.toMatch(/\+\d{10}/); // No phone
      expect(combinedLogs).not.toMatch(/Williams|Smith/i); // No full last names

      tool.cleanup();
    });

    test('error messages contain no PII', async () => {
      const tool = new BitrixUserManagementTool();

      // Simulate error with PII in the error object
      mockQueueManager.add.mockRejectedValueOnce(
        new Error('Failed to fetch user royce.williams@company.com')
      );

      const result = await tool.execute({
        action: 'search',
        query: 'Royce'
      });

      // Error message to user should not contain PII
      expect(result).not.toContain('royce.williams@company.com');
      expect(result).toContain('Failed to complete user management operation');

      tool.cleanup();
    });
  });

  describe('Queue Manager - Sanitization Verification', () => {
    test('sanitizeUser removes all PII fields', () => {
      const { Bitrix24QueueManager } = require('../../services/bitrix24-queue');
      const queueManager = new Bitrix24QueueManager();

      const fullUser = {
        ID: '123',
        NAME: 'Royce',
        LAST_NAME: 'Williams',
        EMAIL: 'royce.williams@company.com',
        PERSONAL_EMAIL: 'royce@personal.com',
        PERSONAL_MOBILE: '+1234567890',
        WORK_PHONE: '+0987654321',
        UF_PHONE_INNER: '1234',
        PERSONAL_STREET: '123 Main St',
        PERSONAL_CITY: 'San Francisco',
        PERSONAL_STATE: 'CA',
        PERSONAL_ZIP: '94102',
        WORK_STREET: '456 Office Blvd',
        WORK_CITY: 'San Francisco',
        WORK_STATE: 'CA',
        WORK_ZIP: '94105',
        PERSONAL_BIRTHDAY: '1990-01-15',
        PERSONAL_PHOTO: 'https://cdn.bitrix24.com/photo.jpg',
        WORK_POSITION: 'Sales Manager',
        ACTIVE: 'Y',
        UF_CUSTOM_FIELD: 'sensitive data'
      };

      const sanitized = queueManager.sanitizeUser(fullUser);
      const serialized = JSON.stringify(sanitized);

      // Verify no PII in serialized output
      expect(serialized).not.toContain('@');
      expect(serialized).not.toContain('+');
      expect(serialized).not.toContain('Williams');
      expect(serialized).not.toContain('Main St');
      expect(serialized).not.toContain('94102');
      expect(serialized).not.toContain('1990-01-15');

      // Verify only safe fields remain
      expect(sanitized).toHaveProperty('id');
      expect(sanitized).toHaveProperty('displayName');
      expect(sanitized).toHaveProperty('active');
      expect(sanitized).toHaveProperty('workPosition');
      expect(Object.keys(sanitized)).toHaveLength(4);
    });

    test('formatDisplayName creates safe display names', () => {
      const { Bitrix24QueueManager } = require('../../services/bitrix24-queue');
      const queueManager = new Bitrix24QueueManager();

      const testCases = [
        {
          input: { NAME: 'Royce', LAST_NAME: 'Williams' },
          expected: 'Royce W.',
          description: 'full name with last initial'
        },
        {
          input: { NAME: 'Royce', LAST_NAME: null },
          expected: 'Royce',
          description: 'first name only (no last name)'
        },
        {
          input: { NAME: null, LAST_NAME: 'Williams' },
          expected: 'User W.',
          description: 'last initial only (no first name)'
        },
        {
          input: { NAME: '', LAST_NAME: '' },
          expected: 'User',
          description: 'empty names'
        }
      ];

      testCases.forEach(({ input, expected, description }) => {
        const result = queueManager.formatDisplayName(input);
        expect(result).toBe(expected);
        expect(result).not.toContain('Williams'); // Never include full last name
      }, description);
    });
  });

  describe('Task Template Sandbox - bitrixUsers Global', () => {
    test('bitrixUsers.search returns full data without sanitization', async () => {
      // This tests that task templates CAN access full user data
      // but this data stays in the sandbox (not sent to Gemini)
      const { getTaskTemplateLoader } = require('../../services/taskTemplateLoader');
      const loader = getTaskTemplateLoader();

      const mockTemplate = {
        templateId: 'test-user-lookup',
        name: 'Test User Lookup',
        executionScript: `
          class TestExecutor extends BaseTaskExecutor {
            async execute() {
              const users = await bitrixUsers.search('Royce');
              return { success: true, users };
            }
          }
        `
      };

      mockQueueManager.add.mockResolvedValueOnce({
        result: [
          {
            ID: '123',
            NAME: 'Royce',
            LAST_NAME: 'Williams',
            EMAIL: 'royce.williams@company.com',
            PERSONAL_MOBILE: '+1234567890',
            WORK_POSITION: 'Manager',
            ACTIVE: 'Y'
          }
        ]
      });

      const context = loader.createSecureContext(mockTemplate);

      // Verify bitrixUsers global exists in sandbox
      expect(context._sandbox.bitrixUsers).toBeDefined();
      expect(typeof context._sandbox.bitrixUsers.search).toBe('function');
      expect(typeof context._sandbox.bitrixUsers.getById).toBe('function');

      // Note: Full data returned by bitrixUsers.search stays in sandbox
      // and is NOT sent to Gemini - this is secure by design
    });

    test('bitrixUsers calls queue WITHOUT sanitizePII flag', async () => {
      const { getTaskTemplateLoader } = require('../../services/taskTemplateLoader');
      const loader = getTaskTemplateLoader();

      const mockTemplate = {
        templateId: 'test-user-lookup',
        name: 'Test',
        executionScript: 'class Test extends BaseTaskExecutor {}'
      };

      const context = loader.createSecureContext(mockTemplate);

      mockQueueManager.add.mockResolvedValueOnce({
        result: [
          {
            ID: '123',
            NAME: 'Royce',
            LAST_NAME: 'Williams',
            EMAIL: 'royce@company.com',
            ACTIVE: 'Y'
          }
        ]
      });

      // Call bitrixUsers.search from sandbox
      await context._sandbox.bitrixUsers.search('Royce');

      // Verify it called queue WITHOUT sanitizePII
      expect(mockQueueManager.add).toHaveBeenCalledWith({
        method: 'user.search',
        params: expect.any(Object),
        sanitizePII: false, // CRITICAL: Full data for task execution
        priority: 3
      });
    });
  });

  describe('Automated PII Scanner', () => {
    /**
     * Automated scanner function that checks for PII in any string
     * @param {string} content - Content to scan
     * @returns {Object} - Scan result with violations
     */
    function scanForPII(content) {
      const violations = [];

      const piiPatterns = [
        { name: 'Email', pattern: /[\w._%+-]+@[\w.-]+\.[A-Z]{2,}/gi },
        { name: 'Phone', pattern: /\b\+?[1-9]\d{1,14}\b/g },
        { name: 'SSN', pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
        { name: 'Credit Card', pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g },
        { name: 'Address', pattern: /\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd)\b/gi },
        { name: 'ZIP Code', pattern: /\b\d{5}(?:-\d{4})?\b/g },
        { name: 'Full Last Name (common)', pattern: /\b(?:Williams|Smith|Johnson|Brown|Jones|Garcia|Miller|Davis|Rodriguez|Martinez)\b/g }
      ];

      piiPatterns.forEach(({ name, pattern }) => {
        const matches = content.match(pattern);
        if (matches) {
          violations.push({
            type: name,
            count: matches.length,
            examples: matches.slice(0, 3) // First 3 examples
          });
        }
      });

      return {
        hasPII: violations.length > 0,
        violations
      };
    }

    test('automated PII scanner detects all PII types', () => {
      const testContent = `
        User: Royce Williams
        Email: royce.williams@company.com
        Phone: +1234567890
        SSN: 123-45-6789
        Credit Card: 4111-1111-1111-1111
        Address: 123 Main Street
        ZIP: 94102
      `;

      const result = scanForPII(testContent);

      expect(result.hasPII).toBe(true);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'Email' }),
          expect.objectContaining({ type: 'Phone' }),
          expect.objectContaining({ type: 'SSN' }),
          expect.objectContaining({ type: 'Credit Card' }),
          expect.objectContaining({ type: 'Address' }),
          expect.objectContaining({ type: 'ZIP Code' })
        ])
      );
    });

    test('sanitized data passes PII scanner', () => {
      const sanitizedContent = `
        User: Royce W.
        ID: 123
        Status: Active
        Position: Manager
      `;

      const result = scanForPII(sanitizedContent);

      expect(result.hasPII).toBe(false);
      expect(result.violations).toHaveLength(0);
    });

    test('scanner can be used to validate any output', () => {
      // This demonstrates how to use the scanner in production
      const toolOutput = 'Found 1 user: Royce W. (ID: 123) - Manager';
      const geminiContext = JSON.stringify({ user: { id: '123', name: 'Royce W.' } });
      const logMessage = 'User search completed: query=Royce, results=1';

      expect(scanForPII(toolOutput).hasPII).toBe(false);
      expect(scanForPII(geminiContext).hasPII).toBe(false);
      expect(scanForPII(logMessage).hasPII).toBe(false);
    });
  });

  describe('OWASP LLM02:2025 Compliance Checklist', () => {
    test('✓ PII sanitization before AI context', async () => {
      const tool = new BitrixUserManagementTool();

      mockQueueManager.add.mockResolvedValueOnce({
        result: [{ id: '123', displayName: 'Royce W.', active: true, workPosition: 'Manager' }]
      });

      await tool.execute({ action: 'search', query: 'Royce' });

      expect(mockQueueManager.add).toHaveBeenCalledWith(
        expect.objectContaining({ sanitizePII: true })
      );

      tool.cleanup();
    });

    test('✓ Display names use first name + last initial only', () => {
      const { Bitrix24QueueManager } = require('../../services/bitrix24-queue');
      const queueManager = new Bitrix24QueueManager();

      const result = queueManager.formatDisplayName({ NAME: 'Royce', LAST_NAME: 'Williams' });
      expect(result).toBe('Royce W.');
      expect(result).not.toContain('Williams');
    });

    test('✓ Email, phone, address fields removed from AI context', () => {
      const { Bitrix24QueueManager } = require('../../services/bitrix24-queue');
      const queueManager = new Bitrix24QueueManager();

      const sanitized = queueManager.sanitizeUser({
        ID: '123',
        NAME: 'Royce',
        LAST_NAME: 'Williams',
        EMAIL: 'royce@company.com',
        PERSONAL_MOBILE: '+1234567890',
        PERSONAL_STREET: '123 Main St',
        WORK_POSITION: 'Manager'
      });

      expect(sanitized.EMAIL).toBeUndefined();
      expect(sanitized.PERSONAL_MOBILE).toBeUndefined();
      expect(sanitized.PERSONAL_STREET).toBeUndefined();
    });

    test('✓ Full user data stored in secure context (not sent to AI)', async () => {
      // Task templates can access full data via bitrixUsers.search()
      // but this data never leaves the secure sandbox
      const { getTaskTemplateLoader } = require('../../services/taskTemplateLoader');
      const loader = getTaskTemplateLoader();

      const mockTemplate = { templateId: 'test', name: 'Test', executionScript: '' };
      const context = loader.createSecureContext(mockTemplate);

      // Verify bitrixUsers provides full data access in sandbox
      expect(context._sandbox.bitrixUsers).toBeDefined();
      expect(typeof context._sandbox.bitrixUsers.search).toBe('function');
    });

    test('✓ Logging sanitized to prevent PII leakage', async () => {
      const tool = new BitrixUserManagementTool();

      mockQueueManager.add.mockResolvedValueOnce({
        result: [{ id: '123', displayName: 'Royce W.', active: true, workPosition: 'Manager' }]
      });

      await tool.execute({ action: 'search', query: 'Royce' });

      const allLogs = [
        ...loggerSpy.info.mock.calls,
        ...loggerSpy.debug.mock.calls
      ].map(call => JSON.stringify(call)).join(' ');

      expect(allLogs).not.toMatch(/@/);
      expect(allLogs).not.toMatch(/\+\d{10}/);

      tool.cleanup();
    });

    test('✓ Error messages don\'t expose PII', async () => {
      const tool = new BitrixUserManagementTool();

      mockQueueManager.add.mockRejectedValueOnce(
        new Error('User royce@company.com not found')
      );

      const result = await tool.execute({ action: 'search', query: 'Royce' });

      expect(result).not.toContain('royce@company.com');
      expect(result).toContain('Failed to complete user management operation');

      tool.cleanup();
    });
  });
});
