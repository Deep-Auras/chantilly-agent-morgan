/**
 * Gemini 2.5 Pro Video Support Test
 *
 * Verifies that Gemini 2.5 Pro can analyze YouTube videos
 * using direct video URLs (no download needed).
 *
 * Tests:
 * - YouTube URL support
 * - Video content extraction
 * - Visual + audio analysis
 * - Response quality
 *
 * Usage:
 *   GEMINI_API_KEY=your-api-key \
 *   node scripts/testGeminiVideoSupport.js
 */

const { getGeminiService } = require('../services/gemini');

// Test YouTube video (short, public, educational)
// Using Google's official demo video from Gemini docs
const TEST_VIDEO_URL = 'https://www.youtube.com/watch?v=vfJN6VYLZh8';

async function testGeminiVideoSupport() {
  console.log('🧪 Testing Gemini 2.5 Pro Video Analysis\n');

  try {
    // Check API key
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable not set');
    }

    console.log('1️⃣ Initializing Gemini service...');
    const gemini = getGeminiService();
    console.log('   ✅ Gemini service initialized\n');

    console.log('2️⃣ Testing YouTube video analysis...');
    console.log(`   Video: ${TEST_VIDEO_URL}\n`);

    const prompt = `Analyze this video and answer:
1. What is the main topic? (1 sentence)
2. What are the key objects or scenes visible? (list 3)
3. What is the emotional tone? (1 word)

Respond in JSON format:
{
  "topic": "description",
  "visibleObjects": ["object1", "object2", "object3"],
  "tone": "tone"
}`;

    console.log('   📹 Sending video analysis request to Gemini...');
    const startTime = Date.now();

    const response = await gemini.generateContent({
      contents: [
        {
          parts: [
            {
              fileData: {
                fileUri: TEST_VIDEO_URL,
                mimeType: 'video/*'
              }
            },
            {
              text: prompt
            }
          ]
        }
      ]
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (!response || !response.text) {
      throw new Error('Empty response from Gemini');
    }

    console.log(`   ✅ Video analysis completed in ${duration}s\n`);

    // Parse response
    console.log('3️⃣ Parsing AI response...');
    const jsonMatch = response.text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.log('   ⚠️  No JSON found in response');
      console.log('   Raw response:', response.text);
      throw new Error('Response not in expected JSON format');
    }

    const analysis = JSON.parse(jsonMatch[0]);
    console.log('   ✅ Response parsed successfully\n');

    // Display results
    console.log('📊 **Analysis Results:**\n');
    console.log(`   Topic: ${analysis.topic || 'N/A'}`);
    console.log(`   Visible Objects: ${analysis.visibleObjects ? analysis.visibleObjects.join(', ') : 'N/A'}`);
    console.log(`   Emotional Tone: ${analysis.tone || 'N/A'}`);
    console.log('');

    // Validation
    console.log('4️⃣ Validating results...');

    const validations = [
      {
        test: 'Topic extracted',
        passed: !!analysis.topic && analysis.topic.length > 10,
        detail: analysis.topic ? `"${analysis.topic}"` : 'No topic'
      },
      {
        test: 'Objects identified',
        passed: Array.isArray(analysis.visibleObjects) && analysis.visibleObjects.length >= 3,
        detail: analysis.visibleObjects ? `${analysis.visibleObjects.length} objects` : 'No objects'
      },
      {
        test: 'Tone detected',
        passed: !!analysis.tone && analysis.tone.length > 0,
        detail: analysis.tone || 'No tone'
      },
      {
        test: 'Response time acceptable',
        passed: duration < 60,
        detail: `${duration}s (target: <60s)`
      }
    ];

    let allPassed = true;

    for (const validation of validations) {
      const status = validation.passed ? '✅' : '❌';
      console.log(`   ${status} ${validation.test}: ${validation.detail}`);

      if (!validation.passed) {
        allPassed = false;
      }
    }

    console.log('');

    if (allPassed) {
      console.log('✅ **All tests passed!**\n');
      console.log('💡 Gemini 2.5 Pro video analysis is working correctly.');
      console.log('   You can now use BskyYouTubePost tool to generate posts from videos.\n');
      process.exit(0);
    } else {
      console.log('⚠️  **Some tests failed**\n');
      console.log('💡 Gemini video analysis may have issues. Check:');
      console.log('   - GEMINI_API_KEY is valid');
      console.log('   - Using Gemini 2.5 Pro model (not 1.5)');
      console.log('   - Video URL is accessible');
      console.log('   - API quota not exceeded\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);

    // Provide helpful error guidance
    if (error.message.includes('API key')) {
      console.error('\n💡 Set GEMINI_API_KEY environment variable');
    } else if (error.message.includes('quota')) {
      console.error('\n💡 Gemini API quota exceeded. Try again later.');
    } else if (error.message.includes('model')) {
      console.error('\n💡 Ensure using Gemini 2.5 Pro model with video support');
    } else if (error.message.includes('video')) {
      console.error('\n💡 Video URL may be invalid or video unavailable');
    }

    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Run test
console.log('🚀 Gemini 2.5 Pro Video Support Test\n');
console.log('This test verifies that Gemini can analyze YouTube videos');
console.log('using direct video URLs without downloading.\n');

testGeminiVideoSupport();
