/**
 * Google Workspace Chat Service
 * Handles bidirectional communication with Google Chat API
 */

const { google } = require('googleapis');
const { getGeminiService } = require('./gemini');
const { getFirestore, FieldValue } = require('@google-cloud/firestore');
const { logger } = require('../utils/logger');

class GoogleChatService {
  constructor() {
    this.chat = null;
    this.db = getFirestore(process.env.FIRESTORE_DATABASE_ID || '(default)');
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      const auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: ['https://www.googleapis.com/auth/chat.bot']
      });

      this.chat = google.chat({
        version: 'v1',
        auth: await auth.getClient()
      });

      this.initialized = true;
      logger.info('Google Chat service initialized');
    } catch (error) {
      logger.error('Failed to initialize Google Chat service', { error: error.message });
      throw error;
    }
  }

  /**
   * Handle incoming message event
   */
  async handleMessage(event) {
    const { message, space, user } = event;

    try {
      // Get or create conversation context
      const conversationId = space.name;
      const userId = user.name;

      // Process message with Gemini
      const gemini = getGeminiService();
      const response = await gemini.generateResponse(message.text, {
        conversationId,
        userId,
        platform: 'google-chat',
        userName: user.displayName || user.name
      });

      // Cache conversation history
      await this.cacheMessage(space.name, user, message.text, response);

      // Return card UI response
      return this.createCardResponse(response);
    } catch (error) {
      logger.error('Error handling Google Chat message', { error: error.message });
      return {
        text: '❌ Sorry, I encountered an error processing your message.'
      };
    }
  }

  /**
   * Cache message in conversation history
   */
  async cacheMessage(spaceId, user, messageText, response) {
    try {
      const conversationRef = this.db.collection('conversations').doc(spaceId);
      const conversationDoc = await conversationRef.get();

      const messageEntry = {
        timestamp: FieldValue.serverTimestamp(),
        userId: user.name,
        userName: user.displayName || user.name,
        text: messageText,
        response: response,
        platform: 'google-chat'
      };

      if (!conversationDoc.exists) {
        // Create new conversation
        await conversationRef.set({
          platform: 'google-chat',
          spaceId: spaceId,
          messages: [messageEntry],
          lastActivity: FieldValue.serverTimestamp(),
          created: FieldValue.serverTimestamp()
        });
      } else {
        // Append to existing conversation (keep last 10 messages)
        const currentMessages = conversationDoc.data().messages || [];
        const updatedMessages = [...currentMessages, messageEntry].slice(-10);

        await conversationRef.update({
          messages: updatedMessages,
          lastActivity: FieldValue.serverTimestamp()
        });
      }

      logger.info('Cached Google Chat message', { spaceId, userId: user.name });
    } catch (error) {
      logger.error('Failed to cache message', { error: error.message });
      // Don't throw - caching failure shouldn't break message handling
    }
  }

  /**
   * Create rich card response
   */
  createCardResponse(content) {
    return {
      cards: [{
        header: {
          title: '🤖 Morgan AI Assistant',
          subtitle: 'AI Project Assistant'
        },
        sections: [{
          widgets: [{
            textParagraph: {
              text: content
            }
          }]
        }]
      }]
    };
  }

  /**
   * Send async message to space
   */
  async sendMessage(spaceName, text, threadKey = null) {
    await this.initialize();

    try {
      const message = {
        parent: spaceName,
        requestBody: {
          text: text
        }
      };

      if (threadKey) {
        message.requestBody.thread = { name: threadKey };
      }

      const response = await this.chat.spaces.messages.create(message);
      logger.info('Sent Google Chat message', { spaceName, threadKey });
      return response.data;
    } catch (error) {
      logger.error('Failed to send Google Chat message', { error: error.message });
      throw error;
    }
  }

  /**
   * Handle slash command
   */
  async handleSlashCommand(event) {
    const { message } = event;
    const command = message.slashCommand;

    switch (command.commandName) {
      case '/help':
        return this.getHelpCard();
      case '/task':
        return this.getTaskCreationCard();
      default:
        return { text: 'Unknown command' };
    }
  }

  /**
   * Create help card
   */
  getHelpCard() {
    return {
      cards: [{
        header: {
          title: '📚 Morgan Help',
          subtitle: 'Available Commands & Features'
        },
        sections: [{
          widgets: [{
            textParagraph: {
              text: '<b>Commands:</b>\n' +
                    '• /help - Show this help message\n' +
                    '• /task - Create a task template\n\n' +
                    '<b>Features:</b>\n' +
                    '• Natural language task creation\n' +
                    '• Knowledge base search\n' +
                    '• Real-time web search\n' +
                    '• Complex task execution\n' +
                    '• Asana integration'
            }
          }]
        }]
      }]
    };
  }

  /**
   * Create task creation card
   */
  getTaskCreationCard() {
    return {
      cards: [{
        header: {
          title: '📋 Create Task',
          subtitle: 'Describe the task you want to create'
        },
        sections: [{
          widgets: [{
            textParagraph: {
              text: 'Just describe what you need in natural language, and I\'ll help create a task template or add it to Asana.'
            }
          }]
        }]
      }]
    };
  }

  /**
   * Handle space join event
   */
  async handleSpaceJoin(event) {
    const { space } = event;

    await this.db.collection('google-chat-spaces').doc(space.name).set({
      spaceName: space.name,
      spaceType: space.type, // DM or ROOM
      displayName: space.displayName || 'Unknown',
      joinedAt: FieldValue.serverTimestamp(),
      active: true
    });

    logger.info('Joined Google Chat space', { spaceName: space.name });
  }

  /**
   * Handle space leave event
   */
  async handleSpaceLeave(event) {
    const { space } = event;

    await this.db.collection('google-chat-spaces').doc(space.name).update({
      active: false,
      leftAt: FieldValue.serverTimestamp()
    });

    logger.info('Left Google Chat space', { spaceName: space.name });
  }

  /**
   * Handle card click event
   */
  async handleCardClick(event) {
    logger.info('Card clicked', { event: event.action });
    return {
      text: 'Card interaction received'
    };
  }
}

let instance = null;

function getGoogleChatService() {
  if (!instance) {
    instance = new GoogleChatService();
  }
  return instance;
}

module.exports = { getGoogleChatService };
