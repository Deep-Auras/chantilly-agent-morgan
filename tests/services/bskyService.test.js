/**
 * BskyService Unit Tests
 */

const { BskyService } = require('../../services/bskyService');

// Mock dependencies
jest.mock('@atproto/api');
jest.mock('../../config/firestore');
jest.mock('../../utils/encryption');
jest.mock('../../utils/logger');

const { BskyAgent } = require('@atproto/api');
const { getFirestore, getFieldValue } = require('../../config/firestore');
const { getEncryption } = require('../../utils/encryption');

describe('BskyService', () => {
  let bskyService;
  let mockFirestore;
  let mockEncryption;
  let mockAgent;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock Firestore
    mockFirestore = {
      collection: jest.fn().mockReturnThis(),
      doc: jest.fn().mockReturnThis(),
      get: jest.fn(),
      set: jest.fn(),
      update: jest.fn(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      runTransaction: jest.fn()
    };

    getFirestore.mockReturnValue(mockFirestore);
    getFieldValue.mockReturnValue({
      serverTimestamp: jest.fn(() => new Date())
    });

    // Mock Encryption
    mockEncryption = {
      isEnabled: jest.fn(() => true),
      encrypt: jest.fn((text) => ({
        encrypted: 'encrypted_' + text,
        iv: 'mock_iv',
        authTag: 'mock_tag'
      })),
      decrypt: jest.fn((data) => data.encrypted.replace('encrypted_', ''))
    };

    getEncryption.mockReturnValue(mockEncryption);

    // Mock BskyAgent
    mockAgent = {
      login: jest.fn(),
      resumeSession: jest.fn(),
      follow: jest.fn(),
      post: jest.fn(),
      searchActors: jest.fn(),
      getProfile: jest.fn(),
      getTimeline: jest.fn(),
      api: {
        app: {
          bsky: {
            feed: {
              getAuthorFeed: jest.fn()
            }
          }
        }
      },
      com: {
        atproto: {
          server: {
            refreshSession: jest.fn()
          }
        }
      }
    };

    BskyAgent.mockImplementation(() => mockAgent);

    // Set environment variables
    process.env.ENABLE_BLUESKY_INTEGRATION = 'true';
    process.env.BLUESKY_USERNAME = 'test.bsky.social';
    process.env.BLUESKY_PASSWORD = 'test-password';
    process.env.BLUESKY_SERVICE_URL = 'https://bsky.social';

    // Create service instance
    bskyService = new BskyService();
  });

  afterEach(() => {
    delete process.env.ENABLE_BLUESKY_INTEGRATION;
    delete process.env.BLUESKY_USERNAME;
    delete process.env.BLUESKY_PASSWORD;
    delete process.env.BLUESKY_SERVICE_URL;
  });

  describe('initialize', () => {
    it('should return false if integration disabled', async () => {
      process.env.ENABLE_BLUESKY_INTEGRATION = 'false';

      const result = await bskyService.initialize();

      expect(result).toBe(false);
      expect(bskyService.initialized).toBe(false);
    });

    it('should create new session if no existing session', async () => {
      mockFirestore.get.mockResolvedValue({ exists: false });

      mockAgent.login.mockResolvedValue({
        success: true,
        data: {
          did: 'did:plc:test123',
          handle: 'test.bsky.social',
          accessJwt: 'access_token',
          refreshJwt: 'refresh_token'
        }
      });

      const result = await bskyService.initialize();

      expect(result).toBe(true);
      expect(bskyService.initialized).toBe(true);
      expect(mockAgent.login).toHaveBeenCalledWith({
        identifier: 'test.bsky.social',
        password: 'test-password'
      });
    });

    it('should load existing session if not expired', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      mockFirestore.get.mockResolvedValue({
        exists: true,
        data: () => ({
          username: 'test.bsky.social',
          did: 'did:plc:test123',
          accessJwt: { encrypted: 'encrypted_access', iv: 'iv', authTag: 'tag' },
          refreshJwt: { encrypted: 'encrypted_refresh', iv: 'iv', authTag: 'tag' },
          sessionExpiry: { toDate: () => futureDate }
        })
      });

      mockAgent.resumeSession.mockResolvedValue(true);

      const result = await bskyService.initialize();

      expect(result).toBe(true);
      expect(bskyService.initialized).toBe(true);
      expect(mockAgent.resumeSession).toHaveBeenCalled();
    });

    it('should return false if login fails', async () => {
      mockFirestore.get.mockResolvedValue({ exists: false });

      mockAgent.login.mockResolvedValue({
        success: false
      });

      const result = await bskyService.initialize();

      expect(result).toBe(false);
      expect(bskyService.initialized).toBe(false);
    });
  });

  describe('searchProfiles', () => {
    beforeEach(async () => {
      // Initialize service first
      mockFirestore.get.mockResolvedValue({ exists: false });
      mockAgent.login.mockResolvedValue({
        success: true,
        data: {
          did: 'did:plc:test123',
          handle: 'test.bsky.social',
          accessJwt: 'access_token',
          refreshJwt: 'refresh_token'
        }
      });
      await bskyService.initialize();
    });

    it('should search profiles successfully', async () => {
      const mockProfiles = [
        {
          did: 'did:plc:user1',
          handle: 'user1.bsky.social',
          displayName: 'User One',
          description: 'Blockchain developer',
          avatar: 'https://example.com/avatar1.jpg',
          followersCount: 100,
          followsCount: 50,
          postsCount: 200
        }
      ];

      mockAgent.searchActors.mockResolvedValue({
        success: true,
        data: {
          actors: mockProfiles
        }
      });

      const results = await bskyService.searchProfiles('blockchain', 20);

      expect(results).toHaveLength(1);
      expect(results[0].did).toBe('did:plc:user1');
      expect(results[0].handle).toBe('user1.bsky.social');
      expect(mockAgent.searchActors).toHaveBeenCalledWith({
        term: 'blockchain',
        limit: 20
      });
    });

    it('should limit results to 100', async () => {
      mockAgent.searchActors.mockResolvedValue({
        success: true,
        data: { actors: [] }
      });

      await bskyService.searchProfiles('test', 500);

      expect(mockAgent.searchActors).toHaveBeenCalledWith({
        term: 'test',
        limit: 100
      });
    });
  });

  describe('getProfile', () => {
    beforeEach(async () => {
      mockFirestore.get.mockResolvedValue({ exists: false });
      mockAgent.login.mockResolvedValue({
        success: true,
        data: {
          did: 'did:plc:test123',
          handle: 'test.bsky.social',
          accessJwt: 'access_token',
          refreshJwt: 'refresh_token'
        }
      });
      await bskyService.initialize();
    });

    it('should fetch profile successfully', async () => {
      const mockProfile = {
        did: 'did:plc:user1',
        handle: 'user1.bsky.social',
        displayName: 'User One',
        description: 'Test bio',
        avatar: 'https://example.com/avatar.jpg',
        followersCount: 100,
        followsCount: 50,
        postsCount: 200,
        labels: []
      };

      mockAgent.getProfile.mockResolvedValue({
        success: true,
        data: mockProfile
      });

      const result = await bskyService.getProfile('user1.bsky.social');

      expect(result.did).toBe('did:plc:user1');
      expect(result.handle).toBe('user1.bsky.social');
      expect(mockAgent.getProfile).toHaveBeenCalledWith({
        actor: 'user1.bsky.social'
      });
    });

    it('should use cached profile if available', async () => {
      const cachedProfile = {
        did: 'did:plc:cached',
        handle: 'cached.bsky.social'
      };

      bskyService.profileCache.set('cached.bsky.social', {
        profile: cachedProfile,
        timestamp: Date.now()
      });

      const result = await bskyService.getProfile('cached.bsky.social');

      expect(result.did).toBe('did:plc:cached');
      expect(mockAgent.getProfile).not.toHaveBeenCalled();
    });
  });

  describe('followUser', () => {
    beforeEach(async () => {
      mockFirestore.get.mockResolvedValue({ exists: false });
      mockAgent.login.mockResolvedValue({
        success: true,
        data: {
          did: 'did:plc:test123',
          handle: 'test.bsky.social',
          accessJwt: 'access_token',
          refreshJwt: 'refresh_token'
        }
      });
      await bskyService.initialize();

      // Mock daily limit check
      mockFirestore.get.mockResolvedValue({
        exists: true,
        data: () => ({
          date: new Date().toISOString().split('T')[0],
          count: 10,
          maxPerDay: 50
        })
      });
    });

    it('should follow user successfully', async () => {
      mockAgent.follow.mockResolvedValue({
        uri: 'at://follow/123'
      });

      mockAgent.getProfile.mockResolvedValue({
        success: true,
        data: {
          did: 'did:plc:user1',
          handle: 'user1.bsky.social',
          displayName: 'User One',
          description: 'Test bio',
          avatar: 'https://example.com/avatar.jpg',
          followersCount: 100,
          followsCount: 50,
          postsCount: 200
        }
      });

      // Mock transaction
      mockFirestore.runTransaction.mockImplementation(async (callback) => {
        const mockTransaction = {
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              date: new Date().toISOString().split('T')[0],
              count: 10
            })
          }),
          set: jest.fn(),
          update: jest.fn()
        };
        return await callback(mockTransaction);
      });

      const followUri = await bskyService.followUser('did:plc:user1');

      expect(followUri).toBe('at://follow/123');
      expect(mockAgent.follow).toHaveBeenCalledWith('did:plc:user1');
      expect(mockFirestore.set).toHaveBeenCalled();
    });

    it('should reject if daily limit reached', async () => {
      mockFirestore.get.mockResolvedValue({
        exists: true,
        data: () => ({
          date: new Date().toISOString().split('T')[0],
          count: 50,
          maxPerDay: 50
        })
      });

      await expect(bskyService.followUser('did:plc:user1')).rejects.toThrow(
        /Daily follow limit reached/
      );
    });
  });

  describe('createPost', () => {
    beforeEach(async () => {
      mockFirestore.get.mockResolvedValue({ exists: false });
      mockAgent.login.mockResolvedValue({
        success: true,
        data: {
          did: 'did:plc:test123',
          handle: 'test.bsky.social',
          accessJwt: 'access_token',
          refreshJwt: 'refresh_token'
        }
      });
      await bskyService.initialize();
    });

    it('should create post successfully', async () => {
      const postText = 'Test post';

      mockAgent.post.mockResolvedValue({
        uri: 'at://post/123',
        cid: 'abc123'
      });

      const result = await bskyService.createPost(postText);

      expect(result.uri).toBe('at://post/123');
      expect(result.cid).toBe('abc123');
      expect(result.url).toContain('bsky.app');
      expect(mockAgent.post).toHaveBeenCalledWith(
        expect.objectContaining({ text: postText })
      );
    });

    it('should reject posts over 300 characters', async () => {
      const longText = 'a'.repeat(301);

      await expect(bskyService.createPost(longText)).rejects.toThrow(
        /Post text must be 1-300 characters/
      );
    });

    it('should reject empty posts', async () => {
      await expect(bskyService.createPost('')).rejects.toThrow(
        /Post text must be 1-300 characters/
      );
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(async () => {
      mockFirestore.get.mockResolvedValue({ exists: false });
      mockAgent.login.mockResolvedValue({
        success: true,
        data: {
          did: 'did:plc:test123',
          handle: 'test.bsky.social',
          accessJwt: 'access_token',
          refreshJwt: 'refresh_token'
        }
      });
      await bskyService.initialize();
    });

    it('should enforce rate limits on API calls', async () => {
      mockAgent.getProfile.mockResolvedValue({
        success: true,
        data: {
          did: 'did:plc:test',
          handle: 'test.bsky.social',
          displayName: 'Test',
          description: '',
          followersCount: 0,
          followsCount: 0,
          postsCount: 0
        }
      });

      // Make requests up to limit
      const requests = [];
      for (let i = 0; i < 100; i++) {
        requests.push(bskyService.getProfile(`user${i}.bsky.social`));
      }

      await Promise.all(requests);

      expect(bskyService.rateLimiter.getCurrentCount()).toBeLessThanOrEqual(100);
    });
  });

  describe('Session Refresh', () => {
    it('should refresh session when expired', async () => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

      mockFirestore.get.mockResolvedValue({
        exists: true,
        data: () => ({
          username: 'test.bsky.social',
          did: 'did:plc:test123',
          accessJwt: { encrypted: 'encrypted_access', iv: 'iv', authTag: 'tag' },
          refreshJwt: { encrypted: 'encrypted_refresh', iv: 'iv', authTag: 'tag' },
          sessionExpiry: { toDate: () => pastDate }
        })
      });

      mockAgent.com.atproto.server.refreshSession.mockResolvedValue({
        success: true,
        data: {
          did: 'did:plc:test123',
          handle: 'test.bsky.social',
          accessJwt: 'new_access_token',
          refreshJwt: 'new_refresh_token'
        }
      });

      const result = await bskyService.initialize();

      expect(result).toBe(true);
      expect(mockAgent.com.atproto.server.refreshSession).toHaveBeenCalled();
    });

    it('should not refresh too frequently', async () => {
      bskyService.lastRefresh = Date.now();

      const result = await bskyService.refreshSession();

      expect(result).toBe(false);
    });

    it('should limit refresh attempts', async () => {
      bskyService.refreshAttempts = 3;

      const result = await bskyService.refreshSession();

      expect(result).toBe(false);
    });
  });

  describe('Cleanup', () => {
    it('should clear cache and reset state', async () => {
      bskyService.initialized = true;
      bskyService.profileCache.set('test', { profile: {} });

      await bskyService.cleanup();

      expect(bskyService.initialized).toBe(false);
      expect(bskyService.session).toBe(null);
      expect(bskyService.profileCache.size).toBe(0);
    });
  });
});
