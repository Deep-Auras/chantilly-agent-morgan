const WebSearchTool = require('../tools/webSearch');
const { logger } = require('../utils/logger');

// Mock axios for testing
jest.mock('axios');
const axios = require('axios');

describe('WebSearchTool', () => {
  let tool;
  
  beforeEach(() => {
    tool = new WebSearchTool({
      logger: logger.child({ source: 'test' })
    });
    
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    test('should initialize with correct properties', () => {
      expect(tool.name).toBe('WebSearch');
      expect(tool.description).toContain('Search the web using DuckDuckGo');
      expect(tool.priority).toBe(80);
      expect(tool.category).toBe('information');
    });

    test('should have required parameters defined', () => {
      expect(tool.parameters.required).toContain('query');
      expect(tool.parameters.properties.query).toBeDefined();
      expect(tool.parameters.properties.maxResults).toBeDefined();
      expect(tool.parameters.properties.focusArea).toBeDefined();
    });
  });

  describe('shouldTrigger', () => {
    test('should trigger on explicit web search requests', async () => {
      const testCases = [
        'search web for latest news',
        'look up current information',
        'search online for recent updates',
        'find latest data on web'
      ];

      for (const message of testCases) {
        const result = await tool.shouldTrigger(message);
        expect(result).toBe(true);
      }
    });

    test('should trigger when knowledge base results are insufficient', async () => {
      const toolContext = {
        knowledgeResults: [] // Empty results
      };

      const result = await tool.shouldTrigger('what is the latest price of bitcoin?', toolContext);
      expect(result).toBe(true);
    });

    test('should trigger for recent date queries', async () => {
      const testCases = [
        'what happened in 2024?',
        'latest news this year',
        'recent updates last month'
      ];

      for (const message of testCases) {
        const result = await tool.shouldTrigger(message);
        expect(result).toBe(true);
      }
    });

    test('should not trigger for general questions with good knowledge base results', async () => {
      const toolContext = {
        knowledgeResults: [
          { title: 'Test', content: 'Good content', relevanceScore: 0.8 },
          { title: 'Test2', content: 'More content', relevanceScore: 0.7 }
        ]
      };

      const result = await tool.shouldTrigger('what is machine learning?', toolContext);
      expect(result).toBe(false);
    });
  });

  describe('utility methods', () => {
    test('should enhance query correctly', () => {
      const enhanced = tool.enhanceQuery('bitcoin price', 'financial', {});
      expect(enhanced).toContain('bitcoin price');
      expect(enhanced).toContain('current price financial');
      expect(enhanced).toMatch(/2024|2025/);
    });

    test('should calculate relevance score', () => {
      const content = 'This is about bitcoin cryptocurrency and current market prices in 2024';
      const query = 'bitcoin current price';
      const snippet = 'Bitcoin price analysis';
      
      const score = tool.calculateRelevance(content, query, snippet);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    test('should validate URLs correctly', () => {
      expect(tool.isValidUrl('https://example.com')).toBe(true);
      expect(tool.isValidUrl('http://example.com')).toBe(true);
      expect(tool.isValidUrl('ftp://example.com')).toBe(false);
      expect(tool.isValidUrl('invalid-url')).toBe(false);
    });

    test('should clean content properly', () => {
      const dirtyContent = 'This   has    extra\n\n\nspaces\n   and   weird   formatting';
      const cleaned = tool.cleanContent(dirtyContent);
      expect(cleaned).not.toMatch(/\s{2,}/); // No multiple spaces
      expect(cleaned.trim()).toBe(cleaned); // No leading/trailing spaces
    });

    test('should summarize content effectively', () => {
      const content = 'Bitcoin is a cryptocurrency. It was created in 2009. The price fluctuates daily. Many people invest in bitcoin for long-term gains.';
      const query = 'bitcoin price';
      
      const summary = tool.summarizeContent(content, query);
      expect(summary).toContain('price');
      expect(summary.length).toBeLessThanOrEqual(300);
    });
  });

  describe('error handling', () => {
    test('should handle shouldTrigger errors gracefully', async () => {
      const result = await tool.shouldTrigger(null);
      expect(result).toBe(false);
    });

    test('should handle malformed toolContext', async () => {
      const result = await tool.shouldTrigger('test message', null);
      expect(result).toBe(false);
    });
  });

  describe('execute method', () => {
    test('should return error message when search fails', async () => {
      // Mock search failure
      axios.post.mockRejectedValue(new Error('Network error'));

      const result = await tool.execute({ query: 'test query' });
      expect(result).toContain('unable to find any relevant web results');
    });

    test('should handle empty search results', async () => {
      // Mock empty search results
      axios.post.mockResolvedValue({
        data: '<html><body><div class="no-results">No results found</div></body></html>'
      });

      const result = await tool.execute({ query: 'test query' });
      expect(result).toContain('unable to find any relevant web results');
    });

    test('should provide fallback response when content fetch fails', async () => {
      // Mock search results but failed content fetch
      axios.post.mockResolvedValue({
        data: `<html><body>
          <div class="result">
            <div class="result__title"><a href="https://example.com">Test Title</a></div>
            <div class="result__snippet">Test snippet content</div>
            <div class="result__url">example.com</div>
          </div>
        </body></html>`
      });

      // Mock failed content fetch
      axios.get.mockRejectedValue(new Error('Access denied'));

      const result = await tool.execute({ query: 'test query' });
      expect(result).toContain('Web Search Results');
      expect(result).toContain('Test Title');
      expect(result).toContain('access restrictions');
    });
  });

  describe('integration with tool context', () => {
    test('should use knowledge results in shouldTrigger logic', async () => {
      const contextWithResults = {
        knowledgeResults: [
          { title: 'Good match', content: 'Relevant content', relevanceScore: 0.9 }
        ]
      };

      const contextEmpty = {
        knowledgeResults: []
      };

      // Should not trigger with good knowledge results
      const resultWithKnowledge = await tool.shouldTrigger('what is AI?', contextWithResults);
      expect(resultWithKnowledge).toBe(false);

      // Should trigger with empty knowledge results
      const resultEmpty = await tool.shouldTrigger('what is AI?', contextEmpty);
      expect(resultEmpty).toBe(true);
    });
  });
});