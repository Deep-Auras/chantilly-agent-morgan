// Load environment variables from .env file
require('dotenv').config();

const axios = require('axios');
const config = require('../config/env');
const { logger } = require('../utils/logger');

async function checkExistingBot() {
  try {
    logger.info('Checking for existing bot registration...');

    // Try to get bot info
    const response = await axios.post(`${config.BITRIX24_INBOUND_WEBHOOK}imbot.bot.list`);

    if (response.data.result) {
      const bots = response.data.result;
      logger.info('Found bots:', bots);

      // Convert object to array and find Chantilly bot
      const botArray = Object.values(bots);
      const chantillyBot = botArray.find(bot =>
        bot.CODE === 'Chantilly_AI_AGENT' ||
        bot.NAME === 'Chantilly' ||
        bot.PROPERTIES?.NAME === 'Chantilly'
      );

      if (chantillyBot) {
        console.log('\n✅ Bot already registered!');
        console.log(`Bot ID: ${chantillyBot.ID}`);
        console.log(`Bot Code: ${chantillyBot.CODE}`);
        console.log(`Bot Name: ${chantillyBot.NAME || chantillyBot.PROPERTIES?.NAME}`);
        console.log(`Open Line Support: ${chantillyBot.OPENLINE}`);
        console.log('\nAdd this to your environment variables:');
        console.log(`BITRIX24_BOT_ID=${chantillyBot.ID}`);

        // Get bot details
        const detailResponse = await axios.post(`${config.BITRIX24_INBOUND_WEBHOOK}imbot.bot.get`, {
          BOT_ID: chantillyBot.ID
        });

        if (detailResponse.data.result) {
          console.log('\nBot Event Handlers:');
          const bot = detailResponse.data.result;
          console.log(`EVENT_MESSAGE_ADD: ${bot.EVENT_MESSAGE_ADD || 'Not set'}`);
          console.log(`EVENT_WELCOME_MESSAGE: ${bot.EVENT_WELCOME_MESSAGE || 'Not set'}`);
          console.log(`EVENT_BOT_DELETE: ${bot.EVENT_BOT_DELETE || 'Not set'}`);
        }

        return chantillyBot.ID;
      } else {
        console.log('\n⚠️  No Chantilly bot found.');
        console.log('\nTo register the bot, you have two options:\n');
        console.log('Option 1: Use Bitrix24 REST API Explorer');
        console.log('1. Go to: https://your-domain.bitrix24.com/devops/');
        console.log('2. Find "imbot.register" in the API list');
        console.log('3. Use these parameters:');
        console.log(JSON.stringify({
          CODE: 'Chantilly_AI_AGENT',
          TYPE: 'S',
          OPENLINE: 'Y',
          EVENT_MESSAGE_ADD: `${config.CLOUD_RUN_SERVICE_URL}/webhook/bitrix24`,
          EVENT_WELCOME_MESSAGE: `${config.CLOUD_RUN_SERVICE_URL}/webhook/bitrix24`,
          EVENT_BOT_DELETE: `${config.CLOUD_RUN_SERVICE_URL}/webhook/bitrix24`,
          PROPERTIES: {
            NAME: 'Chantilly',
            LAST_NAME: 'AI Agent',
            COLOR: 'BLUE',
            WORK_POSITION: 'AI Assistant for Chats & Open Channels'
          }
        }, null, 2));
        console.log('\nOption 2: Create a Market Application');
        console.log('This would allow OAuth authentication for bot registration.');
      }
    } else {
      console.log('\n📋 No bots found. Follow the registration instructions above.');
    }
  } catch (error) {
    if (error.response?.data?.error === 'insufficient_scope') {
      console.log('\n⚠️  Webhook lacks permission to list bots.');
      console.log('Your webhook needs the "imbot" scope.');
      console.log('\nManually register the bot using Bitrix24 REST API Explorer:');
      console.log('https://your-domain.bitrix24.com/devops/');
    } else {
      logger.error('Failed to check bot:', {
        error: error.message,
        response: error.response?.data
      });
      console.error(`\n❌ ERROR: ${error.message}`);
    }
  }
}

// Allow running this script directly
if (require.main === module) {
  checkExistingBot()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Check failed!');
      process.exit(1);
    });
}

module.exports = { checkExistingBot };