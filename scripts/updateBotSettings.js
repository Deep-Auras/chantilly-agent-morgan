#!/usr/bin/env node

/**
 * Script to update Bitrix24 bot settings to receive all messages
 *
 * Usage: node scripts/updateBotSettings.js
 */

const axios = require('axios');
const { getFirestore } = require('../config/firestore');

async function updateBotSettings() {
  try {
    // Get bot auth from Firestore
    const db = getFirestore();
    const authDoc = await db.collection('bot').doc('auth').get();

    if (!authDoc.exists) {
      console.error('Bot auth not found in Firestore');
      return;
    }

    const auth = authDoc.data();
    const restUrl = auth.restUrl || `https://${auth.domain}/rest/`;

    console.log('Current bot domain:', auth.domain);
    console.log('Bot ID:', auth.botId);

    // Update bot to receive all messages (not just mentions)
    const updateUrl = `${restUrl}imbot.update`;

    const params = {
      BOT_ID: auth.botId,
      FIELDS: {
        // This setting allows bot to receive all messages
        TYPE: 'H',  // H = Human-like bot (receives all messages)
        // Alternative: TYPE: 'B' for Bot type (only mentions)

        // Event message type
        EVENT_MESSAGE_ADD: 'Y',
        EVENT_MESSAGE_UPDATE: 'Y',
        EVENT_MESSAGE_DELETE: 'Y',

        // Bot properties
        OPENLINE: 'N'
      }
    };

    console.log('Updating bot with params:', JSON.stringify(params, null, 2));

    const response = await axios.post(updateUrl, {
      ...params,
      auth: auth.accessToken
    });

    if (response.data.result) {
      console.log('✅ Bot settings updated successfully!');
      console.log('Bot will now receive ALL messages in channels.');
      console.log('Response:', JSON.stringify(response.data.result, null, 2));
    } else {
      console.error('❌ Failed to update bot settings');
      console.error('Error:', response.data.error, response.data.error_description);
    }

  } catch (error) {
    console.error('Error updating bot settings:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the update
updateBotSettings()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });