#!/usr/bin/env node

/**
 * Basic Gemini API Test
 *
 * Tests that your Gemini API key is working correctly.
 */

const { getGeminiClient, extractGeminiText } = require('../config/gemini');

async function testBasicGemini() {
  console.log('🧪 Testing Basic Gemini API\n');

  try {
    // Check API key
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable not set');
    }

    console.log('1️⃣ Initializing Gemini client...');
    const client = getGeminiClient();
    console.log('   ✅ Client initialized\n');

    console.log('2️⃣ Testing basic text generation...');
    const response = await client.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: [
        {
          parts: [
            {
              text: 'Say "Hello, the API key is working!" and nothing else.'
            }
          ]
        }
      ]
    });

    const responseText = extractGeminiText(response);

    if (!responseText) {
      throw new Error('Empty response from Gemini');
    }

    console.log(`   ✅ Response received:\n   "${responseText}"\n`);

    console.log('✅ **API Key is working correctly!**\n');
    console.log('💡 Note: YouTube video URL support may require OAuth2 credentials.');
    console.log('   For BskyYouTubePost tool, we\'ll need to either:');
    console.log('   1. Upload videos to Gemini Files API first, OR');
    console.log('   2. Use OAuth2 authentication\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);

    if (error.message.includes('API key')) {
      console.error('\n💡 Check that GEMINI_API_KEY is set correctly');
    } else if (error.message.includes('403') || error.message.includes('401')) {
      console.error('\n💡 API key is invalid or doesn\'t have permission');
    }

    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

testBasicGemini();
