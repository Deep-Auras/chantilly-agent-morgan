const express = require('express');
const router = express.Router();
const { getGoogleChatService } = require('../services/googleChatService');
const { logger } = require('../utils/logger');

/**
 * Google Chat webhook endpoint
 */
router.post('/webhook/google-chat', async (req, res) => {
  try {
    const event = req.body;
    const chatService = getGoogleChatService();

    logger.info('Google Chat event received', {
      type: event.type,
      spaceName: event.space?.name,
      userName: event.user?.displayName
    });

    switch (event.type) {
      case 'MESSAGE':
        if (event.message.slashCommand) {
          const response = await chatService.handleSlashCommand(event);
          return res.json(response);
        } else {
          const response = await chatService.handleMessage(event);
          return res.json(response);
        }

      case 'ADDED_TO_SPACE':
        await chatService.handleSpaceJoin(event);
        return res.json({
          text: "👋 Hi! I'm Morgan, your AI project assistant. Type /help to see what I can do!"
        });

      case 'REMOVED_FROM_SPACE':
        await chatService.handleSpaceLeave(event);
        return res.json({});

      case 'CARD_CLICKED':
        const response = await chatService.handleCardClick(event);
        return res.json(response);

      default:
        logger.info('Unhandled Google Chat event type', { type: event.type });
        return res.json({});
    }
  } catch (error) {
    logger.error('Google Chat webhook error', { error: error.message, stack: error.stack });
    return res.status(500).json({
      text: '❌ Internal error occurred'
    });
  }
});

module.exports = router;
