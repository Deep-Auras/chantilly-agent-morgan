const BaseTool = require('../lib/baseTool');
const { getBskyService } = require('../services/bskyService');
const { getGeminiService } = require('../services/gemini');

class BskyTrendAnalyzer extends BaseTool {
  constructor(context) {
    super(context);
    this.name = 'bskyTrendAnalyzer';
    this.description = 'Analyze Bluesky timeline or feed for trends, sentiment, and content patterns. Summarizes recent discussions and identifies emerging topics.';
    this.category = 'analysis';
    
    this.parameters = {
      type: 'object',
      properties: {
        feedType: {
          type: 'string',
          description: 'Type of feed to analyze: "timeline" (algorithmic) or "following" (chronological)',
          enum: ['timeline', 'following'],
          default: 'timeline'
        },
        limit: {
          type: 'number',
          description: 'Number of posts to analyze (max 100)',
          default: 50
        }
      }
    };
  }

  async execute(params) {
    const { feedType = 'timeline', limit = 50 } = params;
    
    try {
        const bsky = getBskyService();
        await bsky.initialize();
        
        const posts = await bsky.getFeed(feedType, limit);
        
        if (!posts || posts.length === 0) {
            return 'No posts found to analyze.';
        }
        
        // Prepare data for Gemini
        // Truncate to avoid context window issues if many posts
        const safeLimit = Math.min(limit, 100); 
        const analyzedPosts = posts.slice(0, safeLimit);
        
        const postsText = analyzedPosts.map(p => {
            return `[${p.createdAt}] @${p.author.handle}: ${p.text} (Likes: ${p.likeCount}, Reposts: ${p.repostCount})`;
        }).join('\n\n');
        
        const prompt = `Analyze the following ${analyzedPosts.length} posts from a Bluesky feed.
        
        Please provide:
        1. **Executive Summary**: What is happening on the feed right now?
        2. **Top Trends**: Identify 3-5 key topics or discussions.
        3. **Sentiment Analysis**: Overall mood (0-100 score) and specific emotions detected.
        4. **Content Patterns**: What types of content are getting engagement?
        
        POSTS:
        ${postsText}
        `;
        
        const gemini = getGeminiService();
        const analysis = await gemini.generateResponse(prompt, {
            temperature: 0.3, // Lower temperature for analytical tasks
            maxTokens: 2048
        });
        
        return analysis;
        
    } catch (error) {
        throw new Error(`Failed to analyze Bluesky trends: ${error.message}`);
    }
  }
}

module.exports = BskyTrendAnalyzer;
