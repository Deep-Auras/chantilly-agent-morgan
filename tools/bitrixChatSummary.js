const BaseTool = require('../lib/baseTool');
const { getGeminiModel, extractGeminiText } = require('../config/gemini');
const { getQueueManager } = require('../services/bitrix24-queue');

class BitrixChatSummaryTool extends BaseTool {
  constructor(context) {
    super(context);
    this.name = 'BitrixChatSummary';
    this.description = 'Provides comprehensive analytical summaries of Bitrix24 chat conversations. Goes beyond basic summarization to identify contradictions, fact-check information, consolidate redundancies, detect patterns, and provide intelligent recommendations for next steps. Analyzes up to 100 recent messages with critical thinking and contextual understanding.';
    this.userDescription = 'Analyze and summarize chat conversations with critical insights';
    this.category = 'communication';
    this.version = '2.0.0';
    this.author = 'Chantilly Agent';
    this.priority = 65; // Medium-high priority for chat analysis

    this.parameters = {
      type: 'object',
      properties: {
        summaryType: {
          type: 'string',
          enum: ['bullet_points', 'summary', 'key_insights', 'topics', 'decisions'],
          description: 'Type of summary to generate',
          default: 'bullet_points'
        },
        messageCount: {
          type: 'number',
          minimum: 10,
          maximum: 100,
          description: 'Number of recent messages to analyze (10-100)',
          default: 100
        },
        includeMentions: {
          type: 'boolean',
          description: 'Include only messages that mention specific users',
          default: false
        },
        filterUser: {
          type: 'string',
          description: 'Filter messages from specific user ID'
        }
      },
      required: []
    };

    // Cache for user info to avoid repeated API calls
    this.userCache = new Map();
    this.cacheTimeout = 3600000; // 1 hour
  }

  async shouldTrigger(message, toolContext = {}) {
    try {
      const lowerMessage = message.toLowerCase();
      
      // Trigger patterns for chat summary requests
      const summaryTriggers = [
        // Direct summary requests
        /summarize.{0,20}chat/i,
        /summary.{0,20}chat/i,
        /chat.{0,20}summary/i,
        /summarize.{0,20}conversation/i,
        /conversation.{0,20}summary/i,
        
        // Bullet point requests
        /bullet.{0,20}list.{0,20}discussed/i,
        /bullet.{0,20}points.{0,20}discussed/i,
        /list.{0,20}points.{0,20}discussed/i,
        /best.{0,20}points.{0,20}discussed/i,
        /key.{0,20}points.{0,20}discussed/i,
        /main.{0,20}points.{0,20}discussed/i,
        
        // Topic and insight requests
        /what.{0,20}discussed/i,
        /topics.{0,20}discussed/i,
        /key.{0,20}insights/i,
        /important.{0,20}points/i,
        /decisions.{0,20}made/i,
        /conclusions.{0,20}reached/i,
        
        // Recent activity requests
        /recent.{0,20}messages/i,
        /latest.{0,20}discussion/i,
        /recent.{0,20}conversation/i,
        /what.{0,20}happened.{0,20}here/i,
        /catch.{0,20}me.{0,20}up/i,
        
        // Analysis requests
        /analyze.{0,20}chat/i,
        /review.{0,20}chat/i,
        /breakdown.{0,20}discussion/i,
        /overview.{0,20}conversation/i
      ];

      const isTriggered = summaryTriggers.some(trigger => trigger.test(message));
      
      if (isTriggered) {
        // Only trigger if we have messageData with dialog info
        const messageData = toolContext.messageData || toolContext;
        if (messageData && (messageData.dialogId || messageData.DIALOG_ID)) {
          this.log('info', 'Chat summary request detected', {
            hasDialogId: !!(messageData.dialogId || messageData.DIALOG_ID)
          });
          return true;
        } else {
          this.log('debug', 'Summary request detected but no dialog context available');
          return false;
        }
      }

      return false;
    } catch (error) {
      this.log('error', 'Error in shouldTrigger', { error: error.message });
      return false;
    }
  }

  async execute(params, toolContext = {}) {
    try {
      const {
        summaryType = 'bullet_points',
        messageCount = 100,
        includeMentions = false,
        filterUser
      } = params;

      const messageData = toolContext.messageData || {};
      const dialogId = messageData.dialogId || messageData.DIALOG_ID;

      if (!dialogId) {
        return 'I need to know which chat to summarize. This tool works within Bitrix24 chats only.';
      }

      this.log('info', 'Starting chat summary', {
        dialogId,
        summaryType,
        messageCount
      });

      // Retrieve chat messages
      const messages = await this.getChatMessages(dialogId, messageCount);
      
      if (!messages || messages.length === 0) {
        return 'No messages found in this chat or I don\'t have access to the chat history.';
      }

      // Filter messages if requested
      let filteredMessages = messages;
      if (filterUser) {
        filteredMessages = messages.filter(msg => msg.author_id === filterUser);
      }

      if (filteredMessages.length === 0) {
        return filterUser ? 
          `No messages found from user ID ${filterUser} in the last ${messageCount} messages.` :
          `No messages found in the last ${messageCount} messages.`;
      }

      // Enrich messages with user names
      const enrichedMessages = await this.enrichMessagesWithUserNames(filteredMessages);

      // Generate summary based on type
      const summary = await this.generateSummary(enrichedMessages, summaryType, dialogId);

      this.log('info', 'Chat summary completed', {
        messagesAnalyzed: enrichedMessages.length,
        summaryType
      });

      return summary;

    } catch (error) {
      this.log('error', 'Chat summary failed', {
        error: error.message,
        stack: error.stack
      });
      return 'I encountered an error while summarizing the chat. Please try again later.';
    }
  }

  async getChatMessages(dialogId, limit = 100) {
    try {
      const queue = getQueueManager();
      
      // Call Bitrix24 im.dialog.messages.get API
      const result = await queue.add({
        method: 'im.dialog.messages.get',
        params: {
          DIALOG_ID: dialogId,
          LIMIT: Math.min(limit, 100) // Ensure we don't exceed API limits
        },
        priority: 3 // Medium priority
      });

      if (result && result.result && result.result.messages) {
        const messages = Object.values(result.result.messages);
        
        this.log('info', 'Retrieved chat messages', {
          dialogId,
          messageCount: messages.length,
          requestedLimit: limit
        });

        return messages;
      } else {
        this.log('warn', 'No messages in API response', { result });
        return [];
      }

    } catch (error) {
      this.log('error', 'Failed to retrieve chat messages', {
        dialogId,
        error: error.message,
        errorCode: error.response?.data?.error
      });

      // Check for permission/access errors
      if (error.message.includes('403') || error.message.includes('ACCESS_ERROR')) {
        throw new Error(`I don't have permission to read messages from this chat. This usually happens with collaboration chats. Please ask an administrator to add the Chantilly webhook user (Backend - Will Not Respond To Chats) to this chat as a participant.`);
      }

      throw new Error(`Failed to retrieve chat messages: ${error.message}`);
    }
  }

  async enrichMessagesWithUserNames(messages) {
    const enrichedMessages = [];
    
    for (const message of messages) {
      try {
        const userId = message.author_id;
        const userName = await this.getUserName(userId);
        
        enrichedMessages.push({
          id: message.id,
          text: message.text,
          date: message.date,
          author_id: userId,
          author_name: userName,
          timestamp: new Date(message.date).toLocaleString()
        });
      } catch (error) {
        // Include message even if user lookup fails
        enrichedMessages.push({
          id: message.id,
          text: message.text,
          date: message.date,
          author_id: message.author_id,
          author_name: `User #${message.author_id}`,
          timestamp: new Date(message.date).toLocaleString()
        });
      }
    }

    return enrichedMessages;
  }

  async getUserName(userId) {
    if (!userId) {return 'Unknown User';}

    // Check cache first
    const cacheKey = `user:${userId}`;
    const cached = this.userCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.name;
    }

    try {
      const queue = getQueueManager();
      
      const result = await queue.add({
        method: 'user.get',
        params: {
          FILTER: {
            'ID': userId
          }
        }
      });

      let userName = `User #${userId}`;
      if (result && result.result && Array.isArray(result.result) && result.result.length > 0) {
        const userInfo = result.result[0];
        const firstName = userInfo.NAME || '';
        const lastName = userInfo.LAST_NAME || '';
        const fullName = `${firstName} ${lastName}`.trim();
        
        if (fullName) {
          userName = fullName;
        }
      }

      // Cache the result
      this.userCache.set(cacheKey, {
        name: userName,
        timestamp: Date.now()
      });

      return userName;
    } catch (error) {
      this.log('debug', 'Failed to get user name, using fallback', {
        userId,
        error: error.message
      });
      return `User #${userId}`;
    }
  }

  async generateSummary(messages, summaryType, dialogId) {
    try {
      const model = getGeminiModel();

      // Prepare message content for analysis
      const messageContent = messages
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map(msg => `[${msg.timestamp}] ${msg.author_name}: ${msg.text}`)
        .join('\n');

      // Generate appropriate prompt based on summary type
      const prompt = this.getSummaryPrompt(summaryType, messageContent, messages.length);

      this.log('info', 'Generating comprehensive summary with Gemini', {
        summaryType,
        messageCount: messages.length,
        promptLength: prompt.length
      });

      // Use higher token limit for comprehensive analysis
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 8192, // Allow longer, more detailed responses
          temperature: 0.3 // Slightly higher for more creative analysis
        }
      });

      // Use centralized response extraction
      const summary = (extractGeminiText(result) || 'Unable to generate summary').trim();

      this.log('info', 'Summary generated successfully', {
        summaryType,
        summaryLength: summary.length,
        tokensUsed: result.usageMetadata?.totalTokenCount
      });

      // Format the final response
      return this.formatSummaryResponse(summary, summaryType, messages.length, dialogId);

    } catch (error) {
      this.log('error', 'Failed to generate summary', { error: error.message });
      throw new Error(`Failed to generate summary: ${error.message}`);
    }
  }

  getSummaryPrompt(summaryType, messageContent, messageCount) {
    const baseContext = `Analyze the following ${messageCount} chat messages from a Bitrix24 business chat:

${messageContent}

`;

    switch (summaryType) {
    case 'bullet_points':
      return baseContext + `Create a comprehensive analysis of this chat in TWO parts:

**PART 1 - STRUCTURED BULLET POINTS (NO section headers):**

Provide clear bullet points covering:
• Main topics discussed with context
• Important decisions or conclusions reached
• Notable insights or breakthrough ideas
• Any contradictions or conflicting statements between participants
• Redundant or repetitive information (consolidated)
• Fact-check: flag any outdated or questionable claims
• Important gaps or missing information

**PART 2 - CONVERSATIONAL ENGAGEMENT:**

After the bullet points, write naturally as if you're joining the conversation. Address active participants by name, offer helpful suggestions or next steps, ask relevant follow-up questions, and share insights in a friendly, collaborative tone. Make it feel like you're a colleague contributing to the discussion, not delivering a formal report.`;

    case 'summary':
      return baseContext + `Provide a comprehensive, analytical summary of the conversation. Structure your response in TWO parts:

**PART 1 - STRUCTURED ANALYSIS (use bullet points, NO section headers):**

First, provide a 2-3 sentence overview of the main topics and purpose.

Then use bullet points to cover:
• Key points, decisions, and conclusions reached
• Any contradictions, conflicting statements, or outdated information (if none, skip this)
• Redundant or repetitive information consolidated
• Important gaps or missing information

**PART 2 - CONVERSATIONAL ENGAGEMENT:**

After the bullet points, write 2-3 paragraphs in a natural, conversational tone as if you're actively participating in the discussion. This should:

- Address frequent participants directly by name (e.g., "Rabshan, based on what you mentioned about...")
- Offer insights, suggestions, or next steps in a helpful, collaborative way
- Ask relevant follow-up questions if appropriate
- Share relevant information or considerations naturally
- Point out opportunities or risks in a friendly, advisory manner
- Feel like a colleague contributing to the conversation, not a formal report

Keep the structured part analytical and the conversational part warm and engaging.`;

    case 'key_insights':
      return baseContext + `Extract and analyze key insights from this conversation with critical thinking:

**🎯 Strategic Insights:**
- Business implications and opportunities
- Market trends or competitive intelligence mentioned
- Resource allocation or budget considerations

**🔧 Technical & Problem-Solving:**
- Technical solutions or approaches discussed
- Problems identified with root cause analysis
- Alternative solutions considered
- Implementation considerations

**📊 Data & Facts:**
- Important metrics, numbers, or data points mentioned
- Fact-check these against current knowledge
- Flag any outdated or questionable information

**⚠️ Risks & Concerns:**
- Potential problems or obstacles identified
- Conflicting viewpoints or disagreements
- Missing information that could be critical

**💡 Recommendations:**
- Additional insights based on the discussion
- Questions that need investigation
- Suggested next steps for deeper analysis

Present as numbered insights with thorough explanations and critical analysis.`;

    case 'topics':
      return baseContext + `Analyze and organize the main topics discussed in this chat:

For each topic, provide:
1. **Topic Name** (clear, descriptive title)
2. **Discussion Summary** (what was said, key points made)
3. **Key Participants** (who contributed, their positions)
4. **Contradictions/Debates** (any conflicting views or ongoing debates)
5. **Current Status** (resolved, ongoing, needs follow-up)
6. **Action Items** (specific next steps related to this topic)
7. **Recommendations** (what should happen next)

Also include:
- **Cross-Topic Connections:** How topics relate to each other
- **Missing Discussions:** Important topics that should have been covered but weren't
- **Priority Assessment:** Which topics are most urgent or important

Format as a structured, analytical list of topics with comprehensive coverage.`;

    case 'decisions':
      return baseContext + `Extract and analyze all decisions, conclusions, and action items:

**✅ Decisions Made:**
- What was decided
- Who made the decision
- Rationale or reasoning provided
- Any dissenting opinions or concerns raised

**📋 Action Items:**
- Specific tasks assigned
- Who is responsible
- Deadlines or timelines (if mentioned)
- Dependencies on other tasks or decisions

**🤝 Agreements & Consensus:**
- What everyone agreed on
- Any conditions or contingencies
- Follow-up needed to confirm

**⚠️ Outstanding Issues:**
- Decisions that need more information
- Conflicting viewpoints that weren't resolved
- Questions that need answers before proceeding

**💡 Recommendations:**
- Suggested action items based on the conversation
- Risks to consider in implementation
- Follow-up meetings or discussions needed
- Resources or information that should be gathered

Format as clear, actionable items with context, analysis, and recommendations.`;

    default:
      return baseContext + `Provide a comprehensive analytical summary of this chat conversation. Include:
- Main topics and key information
- Important decisions and conclusions
- Any contradictions or conflicts
- Redundant information consolidated
- Action items and next steps
- Recommendations for follow-up

Be thorough and add value through critical analysis.`;
    }
  }

  formatSummaryResponse(summary, summaryType, messageCount, dialogId) {
    const typeEmojis = {
      bullet_points: '📋',
      summary: '📝',
      key_insights: '💡',
      topics: '🗂️',
      decisions: '✅'
    };

    const typeNames = {
      bullet_points: 'Key Points',
      summary: 'Chat Summary',
      key_insights: 'Key Insights',
      topics: 'Discussion Topics',
      decisions: 'Decisions & Actions'
    };

    const emoji = typeEmojis[summaryType] || '📊';
    const typeName = typeNames[summaryType] || 'Analysis';

    return `${emoji} **${typeName}** (${messageCount} messages analyzed)

${summary}

*Summary generated on ${new Date().toLocaleString()} • Chat ID: ${dialogId}*`;
  }

  async cleanup() {
    this.userCache.clear();
    this.log('info', 'Bitrix chat summary tool cleaned up');
  }

  getMetadata() {
    return {
      ...super.getMetadata(),
      cacheSize: this.userCache.size,
      supportedSummaryTypes: ['bullet_points', 'summary', 'key_insights', 'topics', 'decisions'],
      maxMessages: 100
    };
  }
}

module.exports = BitrixChatSummaryTool;