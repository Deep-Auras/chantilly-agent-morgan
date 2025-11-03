// Jest setup file for global test configuration
require('dotenv').config({ path: '.env.example' });

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
process.env.PORT = '3001';
process.env.SERVICE_NAME = 'test-service';

// Global test timeout
jest.setTimeout(30000);

// Mock external services globally
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: {
    applicationDefault: jest.fn()
  },
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
        set: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({})
      })),
      add: jest.fn().mockResolvedValue({ id: 'test-id' })
    })),
    settings: jest.fn(() => ({
      timestampsInSnapshots: true
    }))
  })),
  apps: []
}));

// Suppress console logs during tests unless debugging
if (!process.env.DEBUG_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
}

// Global test utilities
global.testUtils = {
  // Create a mock request object
  createMockReq: (overrides = {}) => ({
    body: {},
    query: {},
    params: {},
    headers: {},
    ip: '127.0.0.1',
    user: null,
    ...overrides
  }),

  // Create a mock response object
  createMockRes: () => {
    const res = {
      status: jest.fn(() => res),
      json: jest.fn(() => res),
      send: jest.fn(() => res),
      setHeader: jest.fn(() => res),
      removeHeader: jest.fn(() => res)
    };
    return res;
  },

  // Sleep utility for async tests
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
});

// Clean up after all tests
afterAll(() => {
  jest.restoreAllMocks();
});