const embeddingService = require('../services/embeddingService');
const { logger } = require('../utils/logger');

/**
 * Test script for embedding service
 * Verifies Vertex AI connection and embedding generation
 */
async function testEmbeddingService() {
  console.log('🧪 Testing Embedding Service...\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const testQueries = [
    'How do I request time off?',
    'What is the vacation policy?',
    'How do I request time off?' // Duplicate to test cache
  ];

  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < testQueries.length; i++) {
    const query = testQueries[i];
    console.log(`\n📝 Test ${i + 1}/${testQueries.length}: "${query}"`);

    try {
      const startTime = Date.now();

      // Generate embedding
      const embedding = await embeddingService.embedQuery(query, 'RETRIEVAL_QUERY');

      const duration = Date.now() - startTime;

      console.log('✅ Success!');
      console.log(`   - Dimensions: ${embedding.length}`);
      console.log(`   - Duration: ${duration}ms`);
      console.log(`   - First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);

      successCount++;

    } catch (error) {
      console.log('❌ Failed!');
      console.log(`   - Error: ${error.message}`);
      failureCount++;
    }
  }

  // Display cache statistics
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 Cache Statistics:');
  const stats = embeddingService.getCacheStats();
  console.log(`   - Cache Size: ${stats.size}/${stats.maxSize}`);
  console.log(`   - Cache Hits: ${stats.hits}`);
  console.log(`   - Cache Misses: ${stats.misses}`);
  console.log(`   - Hit Rate: ${stats.hitRate}`);
  console.log(`   - Utilization: ${stats.utilization}`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📈 Test Results:');
  console.log(`   - Total Tests: ${testQueries.length}`);
  console.log(`   - Successes: ${successCount}`);
  console.log(`   - Failures: ${failureCount}`);

  if (failureCount === 0) {
    console.log('\n✅ All tests passed! Embedding service is working correctly.\n');
    console.log('💡 Next steps:');
    console.log('   1. Run: ./scripts/createVectorIndexes.sh');
    console.log('   2. Wait 10-15 minutes for indexes to build');
    console.log('   3. Run: node scripts/backfillKnowledgeBase.js\n');
    return true;
  } else {
    console.log('\n❌ Some tests failed. Please check:');
    console.log('   - GOOGLE_CLOUD_PROJECT environment variable is set');
    console.log('   - Vertex AI API is enabled');
    console.log('   - Service account has aiplatform.user role');
    console.log('   - You have deployed the service with new dependencies\n');
    return false;
  }
}

// Run test
testEmbeddingService()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('\n❌ Fatal error during test:', error);
    process.exit(1);
  });
