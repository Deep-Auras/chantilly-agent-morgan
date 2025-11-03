const { initializeFirestore, getDb, getFieldValue } = require('../config/firestore');
const embeddingService = require('../services/embeddingService');
const { logger } = require('../utils/logger');

async function validateVectorSearch() {
  console.log('🔍 Validating Firestore Vector Search Setup...\n');

  try {
    // Initialize Firestore first
    await initializeFirestore();
    const db = getDb();

    // Step 1: Check if collection exists
    console.log('Step 1: Checking if reasoning-memory collection exists...');
    const collectionRef = db.collection('reasoning-memory');
    const snapshot = await collectionRef.limit(1).get();

    if (snapshot.empty) {
      console.log('⚠️  WARNING: Collection is empty. Run npm run memory:init first.\n');
      return false;
    }
    console.log(`✅ Collection exists with ${snapshot.size} document(s)\n`);

    // Step 2: Generate test embedding
    console.log('Step 2: Generating test embedding...');
    const testText = 'This is a test query for vector search validation';
    const testEmbedding = await embeddingService.embedQuery(testText, 'RETRIEVAL_QUERY');
    console.log(`✅ Generated ${testEmbedding.length}-dimensional embedding\n`);

    // Step 3: Test vector search
    console.log('Step 3: Testing vector search query...');

    try {
      const vectorQuery = collectionRef.findNearest({
        vectorField: 'embedding',
        queryVector: getFieldValue().vector(testEmbedding),
        limit: 3,
        distanceMeasure: 'COSINE'
      });

      const results = await vectorQuery.get();

      if (results.empty) {
        console.log('⚠️  WARNING: Vector search returned no results\n');
        return false;
      }

      console.log(`✅ Vector search successful! Found ${results.size} result(s)\n`);

      // Step 4: Display results
      console.log('📊 Sample Results:');
      let index = 1;
      results.forEach((doc) => {
        const data = doc.data();
        // Calculate similarity from distance (Firestore returns distance in the document)
        const distance = data.distance || 0;
        const similarity = 1 - distance;

        console.log(`\n  ${index}. ${data.title || 'Untitled'}`);
        console.log(`     Similarity: ${(similarity * 100).toFixed(1)}%`);
        console.log(`     Category: ${data.category || 'N/A'}`);
        console.log(`     Source: ${data.source || 'N/A'}`);
        index++;
      });

      console.log('\n✅ All validation checks passed!');
      console.log('🚀 Vector search is ready for production use.\n');

      // Display cache stats from embedding service
      const cacheStats = embeddingService.getCacheStats();
      console.log('📈 Embedding Service Stats:');
      console.log(`   Cache Size: ${cacheStats.size}/${cacheStats.maxSize}`);
      console.log(`   Cache Hit Rate: ${cacheStats.hitRate}`);
      console.log(`   Cache Utilization: ${cacheStats.utilization}\n`);

      return true;

    } catch (vectorError) {
      console.error('\n❌ Vector search failed:', vectorError.message);

      if (vectorError.message.includes('index') || vectorError.message.includes('Index')) {
        console.log('\n💡 Possible causes:');
        console.log('   1. Vector index not yet created');
        console.log('   2. Index still building (can take 10-30 minutes)');
        console.log('   3. firestore.indexes.json not deployed\n');
        console.log('📝 Actions:');
        console.log('   - Check index status in Firebase Console → Firestore → Indexes');
        console.log('   - Look for "reasoning-memory" collection with "embedding" field');
        console.log('   - Status should show "Enabled" (not "Building")\n');
        console.log('   If index doesn\'t exist, create it using:');
        console.log('   Option A: Firebase Console (Manual)');
        console.log('   Option B: firebase deploy --only firestore:indexes');
        console.log('   Option C: gcloud firestore fields update embedding \\');
        console.log('              --collection-group=reasoning-memory \\');
        console.log('              --enable-vector-search \\');
        console.log('              --vector-dimension=768 \\');
        console.log('              --vector-index-type=flat\n');
      } else if (vectorError.message.includes('findNearest')) {
        console.log('\n💡 Possible causes:');
        console.log('   1. Firestore SDK version < 7.0.0\n');
        console.log('📝 Actions:');
        console.log('   - Your current version should be 7.11.6 (via firebase-admin)');
        console.log('   - If not, update: npm install firebase-admin@latest\n');
      } else {
        console.log('\n💡 Unexpected error. Check:');
        console.log('   - Firestore connection and credentials');
        console.log('   - Collection and field names are correct');
        console.log('   - Service account has Firestore permissions\n');
      }

      return false;
    }

  } catch (error) {
    console.error('\n❌ Validation failed:', error.message);
    console.error('\nStack trace:', error.stack);
    return false;
  }
}

if (require.main === module) {
  validateVectorSearch()
    .then(success => {
      if (success) {
        console.log('✅ Validation complete - System ready!\n');
        process.exit(0);
      } else {
        console.log('❌ Validation failed - See errors above\n');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Validation script error:', error);
      process.exit(1);
    });
}

module.exports = { validateVectorSearch };
