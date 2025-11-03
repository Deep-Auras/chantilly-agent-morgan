const GoogleMapsPlacesTool = require('../../tools/googleMapsPlaces');

// Mock Firestore before importing the tool
jest.mock('../../config/firestore', () => ({
  getFirestore: jest.fn().mockReturnValue({
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        apiKey: 'test-api-key',
        enabled: true,
        rateLimits: { requestsPerMinute: 60, requestsPerDay: 1000 },
        fieldPreferences: { defaultMask: 'enhanced', includeAISummaries: true, includeReviews: true },
        searchDefaults: { radiusMeters: 1000, maxResults: 20, includedTypes: ['restaurant', 'tourist_attraction'] }
      })
    })
  })
}));

describe('GoogleMapsPlaces Tool', () => {
  let tool;

  beforeEach(() => {
    // Mock context for testing
    const mockContext = {
      firestore: {
        collection: jest.fn().mockReturnThis(),
        doc: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            apiKey: 'test-api-key',
            enabled: true,
            rateLimits: { requestsPerMinute: 60, requestsPerDay: 1000 },
            fieldPreferences: { defaultMask: 'enhanced', includeAISummaries: true, includeReviews: true },
            searchDefaults: { radiusMeters: 1000, maxResults: 20, includedTypes: ['restaurant', 'tourist_attraction'] }
          })
        })
      },
      queue: null,
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      }
    };

    tool = new GoogleMapsPlacesTool(mockContext);
  });

  describe('Tool Configuration', () => {
    test('should have correct basic properties', () => {
      expect(tool.name).toBe('GoogleMapsPlaces');
      expect(tool.priority).toBe(68);
      expect(tool.category).toBe('geographic');
      expect(tool.description).toContain('Google Places API');
      expect(tool.description).toContain('2025');
    });

    test('should have required parameters defined', () => {
      expect(tool.parameters).toBeDefined();
      expect(tool.parameters.required).toContain('location');
      expect(tool.parameters.properties.location).toBeDefined();
      expect(tool.parameters.properties.location.type).toBe('string');
    });

    test('should have correct endpoints configured', () => {
      expect(tool.endpoints.textSearch).toBe('https://places.googleapis.com/v1/places:searchText');
      expect(tool.endpoints.nearbySearch).toBe('https://places.googleapis.com/v1/places:searchNearby');
      expect(tool.endpoints.placeDetails).toBe('https://places.googleapis.com/v1/places');
    });

    test('should have comprehensive field masks', () => {
      expect(tool.fieldMasks.comprehensive).toContain('places.displayName');
      expect(tool.fieldMasks.comprehensive).toContain('places.generativeSummary');
      expect(tool.fieldMasks.comprehensive).toContain('places.reviews');
      expect(tool.fieldMasks.comprehensive).toContain('places.accessibilityOptions');
    });
  });

  describe('shouldTrigger Method', () => {
    test('should trigger on location information requests', async () => {
      const testCases = [
        // Original area information patterns
        'tell me about this location',
        'what is Times Square area like',
        'describe this neighborhood',
        'more info about this place',
        'information about this area',
        'area summary for downtown',
        'neighborhood guide for Brooklyn',
        
        // NEW: Business search patterns (the real-world use cases)
        'Are there any pizza places in the Gramercy area?', // Exact message from logs
        'any good restaurants in SoHo?',
        'pizza near Times Square',
        'find coffee shops in Brooklyn',
        'restaurants in the area',
        'looking for pizza in Manhattan'
      ];

      for (const message of testCases) {
        const result = await tool.shouldTrigger(message, {});
        expect(result).toBe(true);
      }
    });

    test('should NOT trigger on unrelated messages', async () => {
      const testCases = [
        'how is the weather today',
        'translate this to spanish',
        'what time is it',
        'calculate 2 + 2',
        'create a reminder'
      ];

      for (const message of testCases) {
        const result = await tool.shouldTrigger(message, {});
        expect(result).toBe(false);
      }
    });

    test('should trigger when geographic knowledge is available', async () => {
      const toolContext = {
        knowledgeResults: [
          {
            category: 'geographic',
            title: 'NYC Areas KML',
            content: '<kml>...coordinates...</kml>',
            tags: ['kml', 'geographic', 'nyc']
          }
        ]
      };

      const result = await tool.shouldTrigger('where is this location', toolContext);
      expect(result).toBe(true);
    });
  });

  describe('KML Analysis', () => {
    test('should analyze KML knowledge correctly', async () => {
      const mockToolContext = {
        knowledgeResults: [
          {
            category: 'geographic',
            title: 'NYC Neighborhoods',
            content: '<kml><coordinates>-74.0059,40.7128</coordinates></kml>',
            tags: ['kml', 'nyc', 'neighborhoods']
          }
        ]
      };

      const result = await tool.analyzeKMLKnowledge('Manhattan', mockToolContext);
      
      expect(result).toBeDefined();
      expect(result.results).toHaveLength(1);
      expect(result.hasCoordinates).toBe(true);
      expect(result.hasKML).toBe(true);
      expect(result.relevantTitles).toContain('NYC Neighborhoods');
    });

    test('should return null when no geographic knowledge available', async () => {
      const mockToolContext = {
        knowledgeResults: [
          {
            category: 'general',
            title: 'Random Info',
            content: 'Some random content',
            tags: ['general']
          }
        ]
      };

      const result = await tool.analyzeKMLKnowledge('Manhattan', mockToolContext);
      expect(result).toBeNull();
    });
  });

  describe('Response Formatting', () => {
    test('should format comprehensive guide correctly', () => {
      const mockPlacesData = {
        places: [
          {
            displayName: { text: 'Test Restaurant' },
            formattedAddress: '123 Test St, New York, NY',
            rating: 4.5,
            userRatingCount: 100,
            types: ['restaurant', 'food'],
            editorialSummary: { text: 'Great food and atmosphere' },
            websiteUri: 'https://test-restaurant.com'
          }
        ]
      };

      const mockKMLData = {
        results: [{ title: 'Local Area Guide' }],
        relevantTitles: ['Local Area Guide']
      };

      const result = tool.formatComprehensiveGuide(mockPlacesData, mockKMLData, null, 'Test Area');

      expect(result).toContain('🗺️ **Comprehensive Area Guide: Test Area**');
      expect(result).toContain('📍 **Geographic Context**');
      expect(result).toContain('🏢 **Current Places & Attractions**');
      expect(result).toContain('Test Restaurant');
      expect(result).toContain('4.5/5');
      expect(result).toContain('📱 **Local Recommendations**');
    });

    test('should extract AI summary from places data', () => {
      const mockPlacesData = {
        places: [
          {
            generativeSummary: {
              overview: { text: 'AI-generated area summary' }
            }
          }
        ]
      };

      const result = tool.extractAISummary(mockPlacesData);
      expect(result).toBe('AI-generated area summary');
    });

    test('should generate smart recommendations', () => {
      const mockPlacesData = {
        places: [
          {
            displayName: { text: 'Top Restaurant' },
            rating: 4.8,
            types: ['restaurant']
          },
          {
            displayName: { text: 'Great Bar' },
            rating: 4.6,
            types: ['bar']
          }
        ]
      };

      const result = tool.generateSmartRecommendations(mockPlacesData, null);
      expect(result).toContain('Top Restaurant');
      expect(result).toContain('4.8⭐');
      expect(result).toContain('Highly rated');
    });
  });

  describe('Error Handling', () => {
    test('should handle missing API configuration gracefully', async () => {
      // Mock Firestore to return no configuration
      tool.db = {
        collection: jest.fn().mockReturnThis(),
        doc: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ exists: false })
      };

      await expect(tool.loadAPIConfiguration()).rejects.toThrow('Google Places API configuration not found');
    });

    test('should handle disabled API configuration', async () => {
      tool.db = {
        collection: jest.fn().mockReturnThis(),
        doc: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ enabled: false })
        })
      };

      await expect(tool.loadAPIConfiguration()).rejects.toThrow('Google Places API is disabled');
    });

    test('should handle shouldTrigger errors gracefully', async () => {
      // Force an error in shouldTrigger
      tool.log = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      const result = await tool.shouldTrigger('test message', {});
      expect(result).toBe(false);
    });
  });
});