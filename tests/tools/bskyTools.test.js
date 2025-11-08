/**
 * Bluesky Tools Unit Tests
 */

const BskyPersonaFollow = require('../../tools/bskyPersonaFollow');
const BskyFeedAnalyzer = require('../../tools/bskyFeedAnalyzer');
const BskyYouTubePost = require('../../tools/bskyYouTubePost');

// Mock dependencies
jest.mock('../../services/bskyService');
jest.mock('../../services/gemini');
jest.mock('../../config/firestore');

const { getBskyService } = require('../../services/bskyService');
const { getGeminiService } = require('../../services/gemini');
const { getFirestore } = require('../../config/firestore');

describe('Bluesky Tools', () => {
  let mockBsky;
  let mockGemini;
  let mockFirestore;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock BskyService
    mockBsky = {
      initialize: jest.fn().mockResolvedValue(true),
      searchProfiles: jest.fn(),
      getProfile: jest.fn(),
      followUser: jest.fn(),
      getFeed: jest.fn(),
      createPost: jest.fn(),
      session: { did: 'did:plc:morgan' }
    };

    getBskyService.mockReturnValue(mockBsky);

    // Mock GeminiService
    mockGemini = {
      generateResponse: jest.fn(),
      generateContent: jest.fn()
    };

    getGeminiService.mockReturnValue(mockGemini);

    // Mock Firestore
    mockFirestore = {
      collection: jest.fn().mockReturnThis(),
      doc: jest.fn().mockReturnThis(),
      get: jest.fn(),
      set: jest.fn(),
      update: jest.fn(),
      add: jest.fn(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis()
    };

    getFirestore.mockReturnValue(mockFirestore);
  });

  describe('BskyPersonaFollow', () => {
    let tool;

    beforeEach(() => {
      tool = new BskyPersonaFollow();
    });

    it('should have correct metadata', () => {
      expect(tool.name).toBe('BskyPersonaFollow');
      expect(tool.priority).toBe(60);
      expect(tool.timeout).toBe(5 * 60 * 1000);
    });

    it('should use semantic triggering (return false)', async () => {
      const result = await tool.shouldTrigger('find bluesky profiles');
      expect(result).toBe(false);
    });

    it('should return error if Bluesky not available', async () => {
      mockBsky.initialize.mockResolvedValue(false);

      const result = await tool.execute({ action: 'search' });

      expect(result).toContain('❌');
      expect(result).toContain('not available');
    });

    it('should search and score profiles', async () => {
      const mockProfiles = [
        {
          did: 'did:plc:user1',
          handle: 'blockchain.bsky.social',
          displayName: 'Blockchain Dev',
          description: 'Smart contract developer',
          followersCount: 100,
          followingCount: 50,
          postsCount: 200
        }
      ];

      mockBsky.searchProfiles.mockResolvedValue(mockProfiles);

      // Mock AI scoring
      mockGemini.generateResponse.mockResolvedValue(
        JSON.stringify({ score: 85, reason: 'Strong blockchain background' })
      );

      // Mock persona loading
      const toolContext = {
        knowledgeBase: {
          search: jest.fn().mockResolvedValue([
            {
              content: '```json\n{"personaId":"blockchain_developer","name":"Blockchain Developer","industry":"Web3"}\n```'
            }
          ])
        }
      };

      // Mock isAlreadyFollowed check
      mockFirestore.get.mockResolvedValue({ exists: false });

      const result = await tool.execute(
        { action: 'search', matchThreshold: 75, dryRun: true },
        toolContext
      );

      expect(result).toContain('📊');
      expect(result).toContain('Dry-run');
      expect(mockBsky.searchProfiles).toHaveBeenCalled();
    });

    it('should follow profiles when not in dry-run', async () => {
      const mockProfiles = [
        {
          did: 'did:plc:user1',
          handle: 'dev.bsky.social',
          displayName: 'Developer',
          description: 'Full stack dev',
          followersCount: 100,
          followingCount: 50,
          postsCount: 200
        }
      ];

      mockBsky.searchProfiles.mockResolvedValue(mockProfiles);
      mockBsky.followUser.mockResolvedValue('at://follow/123');

      mockGemini.generateResponse.mockResolvedValue(
        JSON.stringify({ score: 80, reason: 'Good match' })
      );

      const toolContext = {
        knowledgeBase: {
          search: jest.fn().mockResolvedValue([
            {
              content: '```json\n{"personaId":"saas_founder","name":"SaaS Founder","industry":"SaaS"}\n```'
            }
          ])
        }
      };

      mockFirestore.get.mockResolvedValue({ exists: false });

      const result = await tool.execute(
        { action: 'follow', matchThreshold: 75, dryRun: false, maxFollows: 1 },
        toolContext
      );

      expect(result).toContain('Followed:');
      expect(mockBsky.followUser).toHaveBeenCalledWith('did:plc:user1');
    });

    it('should skip profiles below match threshold', async () => {
      mockBsky.searchProfiles.mockResolvedValue([
        {
          did: 'did:plc:lowmatch',
          handle: 'low.bsky.social',
          displayName: 'Low Match',
          description: 'Random user',
          followersCount: 50,
          followingCount: 30,
          postsCount: 10
        }
      ]);

      mockGemini.generateResponse.mockResolvedValue(
        JSON.stringify({ score: 40, reason: 'Poor match' })
      );

      const toolContext = {
        knowledgeBase: {
          search: jest.fn().mockResolvedValue([
            {
              content: '```json\n{"personaId":"test","name":"Test","industry":"Tech"}\n```'
            }
          ])
        }
      };

      mockFirestore.get.mockResolvedValue({ exists: false });

      const result = await tool.execute(
        { action: 'search', matchThreshold: 75 },
        toolContext
      );

      expect(result).toContain('No profiles found');
    });

    it('should generate report of followed profiles', async () => {
      mockFirestore.get.mockResolvedValue({
        empty: false,
        docs: [
          {
            data: () => ({
              handle: 'user1.bsky.social',
              displayName: 'User One',
              personaMatch: { personaName: 'Blockchain Developer', matchScore: 85 },
              followedAt: { toDate: () => new Date() }
            })
          }
        ]
      });

      const result = await tool.execute({ action: 'report' });

      expect(result).toContain('📊');
      expect(result).toContain('Followed Profiles Report');
    });
  });

  describe('BskyFeedAnalyzer', () => {
    let tool;

    beforeEach(() => {
      tool = new BskyFeedAnalyzer();
    });

    it('should have correct metadata', () => {
      expect(tool.name).toBe('BskyFeedAnalyzer');
      expect(tool.priority).toBe(55);
      expect(tool.timeout).toBe(10 * 60 * 1000);
    });

    it('should use semantic triggering', async () => {
      const result = await tool.shouldTrigger('analyze feed');
      expect(result).toBe(false);
    });

    it('should analyze feed and identify prospects', async () => {
      const mockPosts = [
        {
          uri: 'at://post/1',
          cid: 'abc123',
          author: {
            did: 'did:plc:prospect1',
            handle: 'founder.bsky.social',
            displayName: 'SaaS Founder',
            avatarUrl: 'https://example.com/avatar.jpg'
          },
          text: 'Looking for better infrastructure solutions for our startup',
          createdAt: new Date().toISOString(),
          likeCount: 10,
          repostCount: 2,
          replyCount: 3
        }
      ];

      mockBsky.getFeed.mockResolvedValue(mockPosts);

      mockBsky.getProfile.mockResolvedValue({
        did: 'did:plc:prospect1',
        handle: 'founder.bsky.social',
        displayName: 'SaaS Founder',
        description: 'Building a B2B SaaS product',
        followersCount: 500,
        followingCount: 200,
        postsCount: 1000
      });

      mockGemini.generateResponse.mockResolvedValue(
        JSON.stringify({
          score: 85,
          reason: 'SaaS founder looking for infrastructure solutions',
          personaMatches: ['saas_founder'],
          buyingSignals: ['Looking for solutions', 'infrastructure challenges']
        })
      );

      const toolContext = {
        knowledgeBase: {
          search: jest.fn().mockResolvedValue([
            {
              content: '```json\n{"personaId":"saas_founder","name":"SaaS Founder","industry":"SaaS","painPoints":["Infrastructure scaling"]}\n```'
            }
          ])
        }
      };

      // Mock Firestore .get() for both isAlreadyFollowed and getExistingProspect checks
      mockFirestore.get.mockResolvedValue({
        empty: true,
        exists: false
      });
      mockFirestore.add.mockResolvedValue({ id: 'prospect123' });

      const result = await tool.execute(
        {
          action: 'analyze',
          feedType: 'timeline',
          lookbackHours: 24,
          minProspectScore: 75
        },
        toolContext
      );

      expect(result).toContain('📊');
      expect(result).toContain('Prospect Analysis Report');
      expect(result).toContain('founder.bsky.social');
      // Note: Firestore storage is tested in integration tests
      // This unit test focuses on prospect identification logic
    });

    it('should skip low-quality accounts', async () => {
      const mockPosts = [
        {
          uri: 'at://post/1',
          author: {
            did: 'did:plc:lowquality',
            handle: 'bot.bsky.social',
            displayName: 'Bot Account'
          },
          text: 'Spam post',
          createdAt: new Date().toISOString(),
          likeCount: 0,
          repostCount: 0,
          replyCount: 0
        }
      ];

      mockBsky.getFeed.mockResolvedValue(mockPosts);

      mockBsky.getProfile.mockResolvedValue({
        did: 'did:plc:lowquality',
        handle: 'bot.bsky.social',
        followersCount: 5, // Below threshold
        postsCount: 2 // Below threshold
      });

      const toolContext = {
        knowledgeBase: {
          search: jest.fn().mockResolvedValue([
            {
              content: '```json\n{"personaId":"test","name":"Test"}\n```'
            }
          ])
        }
      };

      const result = await tool.execute(
        { action: 'analyze', minProspectScore: 75 },
        toolContext
      );

      expect(result).toContain('No qualified prospects');
    });

    it('should generate prospect report', async () => {
      mockFirestore.get.mockResolvedValue({
        empty: false,
        docs: [
          {
            id: 'prospect1',
            data: () => ({
              handle: 'prospect.bsky.social',
              prospectScore: 85,
              prospectReason: 'Great match',
              status: 'new',
              identifiedAt: { toDate: () => new Date() },
              engagement: { likes: 10, reposts: 2 }
            })
          }
        ]
      });

      const result = await tool.execute({
        action: 'report',
        maxProspects: 20,
        minProspectScore: 75
      });

      expect(result).toContain('📊');
      expect(result).toContain('Prospects Report');
      expect(result).toContain('prospect.bsky.social');
    });
  });

  describe('BskyYouTubePost', () => {
    let tool;

    beforeEach(() => {
      tool = new BskyYouTubePost();
    });

    it('should have correct metadata', () => {
      expect(tool.name).toBe('BskyYouTubePost');
      expect(tool.priority).toBe(50);
      expect(tool.timeout).toBe(12 * 60 * 1000);
    });

    it('should use semantic triggering', async () => {
      const result = await tool.shouldTrigger('create post from video');
      expect(result).toBe(false);
    });

    it('should validate YouTube URLs', async () => {
      const result = await tool.execute({
        youtubeUrl: 'https://invalid.com/video'
      });

      expect(result).toContain('❌');
      expect(result).toContain('Invalid YouTube URL');
    });

    it('should extract video ID from YouTube URLs', async () => {
      const validUrls = [
        { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', id: 'dQw4w9WgXcQ' },
        { url: 'https://youtu.be/dQw4w9WgXcQ', id: 'dQw4w9WgXcQ' }
      ];

      for (const { url, id } of validUrls) {
        const extracted = tool.extractVideoId(url);
        expect(extracted).toBe(id);
      }
    });

    it('should reject non-YouTube domains (SSRF protection)', async () => {
      const invalidUrls = [
        'https://evil.com/watch?v=abc123',
        'https://metadata.google.internal/video',
        'file:///etc/passwd'
      ];

      for (const url of invalidUrls) {
        const videoId = tool.extractVideoId(url);
        expect(videoId).toBe(null);
      }
    });

    it('should analyze video and generate post draft', async () => {
      const videoUrl = 'https://www.youtube.com/watch?v=test123';

      mockGemini.generateContent.mockResolvedValue({
        text: JSON.stringify({
          topic: 'How to scale SaaS infrastructure',
          insights: [
            'Use edge computing',
            'Optimize caching strategies',
            'Implement CDN'
          ],
          targetAudience: 'SaaS founders and CTOs',
          surprisingFact: 'Netflix saves $1B/year with custom CDN',
          emotionalTone: 'informative'
        })
      });

      mockGemini.generateResponse.mockResolvedValue(
        'Scaling to 10M users? The secret isn\'t more servers—it\'s smarter caching. ' +
        'This video breaks down 3 game-changing strategies. ' +
        'Fun fact: Netflix saves $1B/year with a custom CDN. ' +
        'What\'s your biggest scaling challenge? #SaaS #DevOps'
      );

      const toolContext = {
        knowledgeBase: {
          search: jest.fn().mockResolvedValue([])
        }
      };

      const result = await tool.execute(
        {
          youtubeUrl: videoUrl,
          maxLength: 280,
          includeFact: true,
          tone: 'engaging',
          postImmediately: false
        },
        toolContext
      );

      expect(result).toContain('📝');
      expect(result).toContain('Post Draft Ready');
      expect(result).toContain(videoUrl);
      expect(mockGemini.generateContent).toHaveBeenCalled();
    });

    it('should post immediately if requested', async () => {
      const videoUrl = 'https://www.youtube.com/watch?v=test123';

      mockGemini.generateContent.mockResolvedValue({
        text: JSON.stringify({
          topic: 'Test topic',
          insights: ['Insight 1', 'Insight 2'],
          surprisingFact: 'Fun fact'
        })
      });

      mockGemini.generateResponse.mockResolvedValue('Test post content');

      mockBsky.createPost.mockResolvedValue({
        uri: 'at://post/123',
        cid: 'abc123',
        url: 'https://bsky.app/profile/morgan/post/123'
      });

      const toolContext = {
        knowledgeBase: {
          search: jest.fn().mockResolvedValue([])
        }
      };

      const result = await tool.execute(
        {
          youtubeUrl: videoUrl,
          postImmediately: true
        },
        toolContext
      );

      expect(result).toContain('✅');
      expect(result).toContain('Posted to Bluesky');
      expect(result).toContain('bsky.app');
      expect(mockBsky.createPost).toHaveBeenCalled();
    });

    it('should handle video analysis errors gracefully', async () => {
      const videoUrl = 'https://www.youtube.com/watch?v=test123';

      mockGemini.generateContent.mockRejectedValue(
        new Error('Video unavailable')
      );

      const result = await tool.execute({ youtubeUrl: videoUrl });

      expect(result).toContain('❌');
      expect(result).toContain('Video analysis failed');
      expect(result).toContain('unavailable');
    });

    it('should truncate long posts intelligently', async () => {
      const longText = 'a'.repeat(300);
      const truncated = tool.truncateAtSentence(longText, 200);

      expect(truncated.length).toBeLessThanOrEqual(200);
      expect(truncated).toContain('...');
    });

    it('should truncate at sentence boundaries when possible', async () => {
      const text = 'First sentence. Second sentence. Third sentence. Fourth sentence.';
      const truncated = tool.truncateAtSentence(text, 40);

      expect(truncated).toBe('First sentence. Second sentence.');
    });
  });

  describe('Tool Parameter Validation', () => {
    it('should validate required parameters', async () => {
      const followTool = new BskyPersonaFollow();

      const validation = followTool.validateParameters({});

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Missing required parameter: action');
    });

    it('should accept valid parameters', async () => {
      const followTool = new BskyPersonaFollow();

      const validation = followTool.validateParameters({ action: 'search' });

      expect(validation.valid).toBe(true);
    });
  });

  describe('Tool Integration', () => {
    it('should handle Bluesky service initialization failure', async () => {
      mockBsky.initialize.mockResolvedValue(false);

      // Test BskyPersonaFollow
      const followTool = new BskyPersonaFollow();
      const followResult = await followTool.execute({ action: 'search' });
      expect(followResult).toContain('❌');
      expect(followResult).toContain('not available');

      // Test BskyFeedAnalyzer
      const feedTool = new BskyFeedAnalyzer();
      const feedResult = await feedTool.execute({ action: 'analyze' });
      expect(feedResult).toContain('❌');
      expect(feedResult).toContain('not available');

      // Test BskyYouTubePost (different interface - requires youtubeUrl)
      const youtubeTool = new BskyYouTubePost();
      const youtubeResult = await youtubeTool.execute({ youtubeUrl: 'https://www.youtube.com/watch?v=test123' });
      expect(youtubeResult).toContain('❌');
      expect(youtubeResult).toContain('not available');
    });

    it('should handle missing personas gracefully', async () => {
      const tool = new BskyPersonaFollow();

      const toolContext = {
        knowledgeBase: {
          search: jest.fn().mockResolvedValue([])
        }
      };

      const result = await tool.execute({ action: 'search' }, toolContext);

      expect(result).toContain('❌');
      expect(result).toContain('No marketing personas found');
    });
  });
});
