// Load environment variables from .env file
require('dotenv').config();

const axios = require('axios');
const config = require('../config/env');
const { logger } = require('../utils/logger');

async function registerBot() {
  try {
    logger.info('Starting manual bot registration...');

    const botData = {
      CODE: 'Chantilly_AI_AGENT',
      TYPE: 'S', // Elevated privileges to access all messages
      OPENLINE: 'Y', // Enable Open Channel support
      EVENT_MESSAGE_ADD: `${config.CLOUD_RUN_SERVICE_URL}/webhook/bitrix24`,
      EVENT_WELCOME_MESSAGE: `${config.CLOUD_RUN_SERVICE_URL}/webhook/bitrix24`,
      EVENT_BOT_DELETE: `${config.CLOUD_RUN_SERVICE_URL}/webhook/bitrix24`,
      PROPERTIES: {
        NAME: 'Chantilly',
        LAST_NAME: 'AI Agent',
        COLOR: 'BLUE',
        WORK_POSITION: 'AI Assistant for Chats & Open Channels',
        PERSONAL_WWW: config.CLOUD_RUN_SERVICE_URL,
        PERSONAL_BIRTHDAY: '2024-01-01',
        PERSONAL_PHOTO: '' // Optional: add bot avatar URL
      }
    };

    logger.info('Bot registration data:', botData);

    // Use inbound webhook to register bot
    const response = await axios.post(`${config.BITRIX24_INBOUND_WEBHOOK}imbot.register`, botData);

    if (response.data.result) {
      logger.info('Bot registered successfully!', {
        botId: response.data.result,
        botData
      });

      // Save bot ID to environment or database
      console.log(`\n✅ SUCCESS! Bot registered with ID: ${response.data.result}`);
      console.log('\nAdd this to your environment variables:');
      console.log(`BITRIX24_BOT_ID=${response.data.result}`);

      return response.data.result;
    } else {
      throw new Error(`Bot registration failed: ${JSON.stringify(response.data)}`);
    }
  } catch (error) {
    logger.error('Failed to register bot:', {
      error: error.message,
      response: error.response?.data,
      status: error.response?.status
    });

    console.error(`\n❌ ERROR: ${error.message}`);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }

    throw error;
  }
}

// Allow running this script directly
if (require.main === module) {
  registerBot()
    .then((botId) => {
      console.log(`\n🤖 Bot registration complete! Bot ID: ${botId}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Bot registration failed!');
      process.exit(1);
    });
}

module.exports = { registerBot };