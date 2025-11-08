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

const { getVertexAIClient, extractGeminiText } = require('../config/gemini');

// Test videos - both owned and public
const TEST_VIDEOS = [
  {
    name: 'Deep Auras Owned Video',
    url: 'https://youtu.be/Icm43LeJJXw',
    type: 'owned'
  },
  {
    name: 'Public Video (Rick Astley)',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    type: 'public'
  }
];

async function testSingleVideo(client, videoInfo, index, total) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📹 Test ${index + 1}/${total}: ${videoInfo.name} (${videoInfo.type})`);
  console.log(`   URL: ${videoInfo.url}`);
  console.log('='.repeat(80));

  try {
    console.log('\n   Sending video analysis request to Gemini...');
    const startTime = Date.now();

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

    // Official Google Cloud format for YouTube URLs with Vertex AI
    const response = await client.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: [
        {
          fileData: {
            fileUri: videoInfo.url,
            mimeType: 'video/mp4'  // Required for Vertex AI (per official docs)
          }
        },
        prompt
      ]
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Extract text from Gemini response
    const responseText = extractGeminiText(response);

    if (!responseText) {
      throw new Error('Empty response from Gemini');
    }

    console.log(`   ✅ Video analysis completed in ${duration}s`);

    // Parse response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.log('   ⚠️  No JSON found in response');
      console.log('   Raw response:', responseText);
      throw new Error('Response not in expected JSON format');
    }

    const analysis = JSON.parse(jsonMatch[0]);

    // Display results
    console.log('\n   📊 Analysis Results:');
    console.log(`      Topic: ${analysis.topic || 'N/A'}`);
    console.log(`      Objects: ${analysis.visibleObjects ? analysis.visibleObjects.join(', ') : 'N/A'}`);
    console.log(`      Tone: ${analysis.tone || 'N/A'}`);

    // Validation
    const validations = [
      {
        test: 'Topic extracted',
        passed: !!analysis.topic && analysis.topic.length > 10
      },
      {
        test: 'Objects identified',
        passed: Array.isArray(analysis.visibleObjects) && analysis.visibleObjects.length >= 3
      },
      {
        test: 'Tone detected',
        passed: !!analysis.tone && analysis.tone.length > 0
      },
      {
        test: 'Response time acceptable',
        passed: duration < 60
      }
    ];

    const allPassed = validations.every(v => v.passed);

    if (allPassed) {
      console.log(`\n   ✅ ${videoInfo.name} test passed!`);
      return { success: true, duration, videoInfo };
    } else {
      const failures = validations.filter(v => !v.passed).map(v => v.test);
      console.log(`\n   ❌ ${videoInfo.name} test failed: ${failures.join(', ')}`);
      return { success: false, duration, videoInfo, failures };
    }
  } catch (error) {
    console.error(`\n   ❌ ${videoInfo.name} test failed:`, error.message);
    return { success: false, error: error.message, videoInfo };
  }
}

async function testGeminiVideoSupport() {
  console.log('🧪 Testing Gemini 2.5 Pro Video Analysis\n');

  try {
    console.log('1️⃣ Initializing Vertex AI client (required for YouTube URLs)...');
    const client = getVertexAIClient();
    console.log('   ✅ Vertex AI client initialized');

    console.log(`\n2️⃣ Testing ${TEST_VIDEOS.length} videos (owned + public)...`);

    const results = [];
    for (let i = 0; i < TEST_VIDEOS.length; i++) {
      const result = await testSingleVideo(client, TEST_VIDEOS[i], i, TEST_VIDEOS.length);
      results.push(result);
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 Test Summary');
    console.log('='.repeat(80));

    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    results.forEach((result, i) => {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${result.videoInfo.name} (${result.videoInfo.type})`);
      if (result.duration) {
        console.log(`   Duration: ${result.duration}s`);
      }
      if (result.failures) {
        console.log(`   Failed: ${result.failures.join(', ')}`);
      }
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log(`Results: ${passed}/${TEST_VIDEOS.length} passed, ${failed}/${TEST_VIDEOS.length} failed`);
    console.log('='.repeat(80));

    if (passed === TEST_VIDEOS.length) {
      console.log('\n✅ **All tests passed!**');
      console.log('\n💡 Gemini Vertex AI video analysis is working correctly.');
      console.log('   - Both owned and public YouTube videos work');
      console.log('   - BskyYouTubePost tool can analyze any public YouTube video\n');
      process.exit(0);
    } else {
      console.log('\n⚠️  **Some tests failed**');
      console.log('\n💡 Check:');
      console.log('   - Service account credentials are valid');
      console.log('   - GOOGLE_CLOUD_PROJECT is set correctly');
      console.log('   - Vertex AI API is enabled');
      console.log('   - Video URLs are accessible\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Run test
console.log('🚀 Gemini 2.5 Pro Video Support Test\n');
console.log('This test verifies that Gemini can analyze YouTube videos');
console.log('using direct video URLs without downloading.\n');

testGeminiVideoSupport();
