const { initializeFirestore, getDb, getFieldValue } = require('../config/firestore');
const { logger } = require('../utils/logger');
const { FieldValue } = require('@google-cloud/firestore');
const embeddingService = require('../services/embeddingService');

async function initializeMemorySystem() {
  // Initialize Firestore first
  await initializeFirestore();
  const db = getDb();

  console.log('🔧 Initializing ReasoningBank Memory System...\n');

  try {
    // Create memory collection with placeholder document
    const memoryCollection = db.collection('reasoning-memory');

    console.log('Step 1: Creating reasoning-memory collection...');
    console.log('Generating real embedding for placeholder document...');

    // Generate a real embedding for the placeholder
    const placeholderText = 'ReasoningBank memory system initialized - This is a placeholder memory item created during system initialization';
    const embedding = await embeddingService.embedQuery(placeholderText, 'RETRIEVAL_DOCUMENT');

    console.log(`✅ Generated ${embedding.length}-dimensional embedding`);

    // Create a placeholder with all fields including embedding vector
    const placeholderDoc = {
      title: 'System Initialization',
      description: 'ReasoningBank memory system initialized',
      content: placeholderText,
      source: 'system',
      category: 'general_strategy',
      embedding: FieldValue.vector(embedding), // Wrap in FieldValue.vector()
      templateId: null,
      taskId: null,
      successRate: null,
      timesRetrieved: 0,
      timesUsedInSuccess: 0,
      timesUsedInFailure: 0,
      createdAt: getFieldValue().serverTimestamp(),
      updatedAt: getFieldValue().serverTimestamp()
    };

    const docRef = await memoryCollection.add(placeholderDoc);

    console.log('✅ Collection created: reasoning-memory');
    console.log('✅ Placeholder document ID:', docRef.id);
    console.log('✅ Embedding field created: 768 dimensions');
    console.log('✅ All required fields initialized\n');

    console.log('📋 Collection Schema:');
    console.log('   - title (string)');
    console.log('   - description (string)');
    console.log('   - content (string)');
    console.log('   - source (string): task_success | task_failure | repair_success | repair_failure | system');
    console.log('   - category (string): error_pattern | fix_strategy | api_usage | general_strategy');
    console.log('   - embedding (array): 768-dimensional vector');
    console.log('   - templateId (string|null)');
    console.log('   - taskId (string|null)');
    console.log('   - successRate (number|null): 0.0-1.0');
    console.log('   - timesRetrieved (number)');
    console.log('   - timesUsedInSuccess (number)');
    console.log('   - timesUsedInFailure (number)');
    console.log('   - createdAt (timestamp)');
    console.log('   - updatedAt (timestamp)\n');

    console.log('✅ Memory system initialized successfully!\n');

    console.log('📋 Next Steps:');
    console.log('⚠️  IMPORTANT: You need to create 4 indexes total:\n');
    console.log('   1. Vector index on "embedding" field');
    console.log('   2. Composite index: category + updatedAt');
    console.log('   3. Composite index: templateId + updatedAt');
    console.log('   4. Composite index: successRate + timesRetrieved\n');

    console.log('🔧 How to Create Indexes:\n');

    console.log('   Option A: Firebase CLI (Recommended)');
    console.log('   - Create firestore.indexes.json with all index definitions');
    console.log('   - Run: firebase deploy --only firestore:indexes\n');

    console.log('   Option B: gcloud CLI (Vector Index Only)');
    console.log('   - gcloud firestore fields update embedding \\');
    console.log('       --collection-group=reasoning-memory \\');
    console.log('       --enable-vector-search \\');
    console.log('       --vector-dimension=768 \\');
    console.log('       --vector-index-type=flat \\');
    console.log('       --project=$GOOGLE_CLOUD_PROJECT');
    console.log('   - Note: Still need to create composite indexes separately\n');

    console.log('   Option C: Firebase Console (Manual)');
    console.log('   - Go to: https://console.firebase.google.com');
    console.log('   - Select your project → Firestore Database → Indexes');
    console.log('   - Create each index manually (vector + 3 composite)\n');

    console.log('⏱️  Timeline:');
    console.log('   1. Create all 4 indexes (5-10 minutes)');
    console.log('   2. Wait for index build (10-30 minutes)');
    console.log('   3. Monitor: Firebase Console → Firestore → Indexes');
    console.log('   4. Validate: npm run memory:validate\n');

    return true;
  } catch (error) {
    console.error('\n❌ Failed to initialize memory system:', error.message);
    console.error('\nPossible causes:');
    console.error('- Firestore not initialized (check config/firestore.js)');
    console.error('- Missing service account credentials');
    console.error('- Insufficient permissions\n');
    throw error;
  }
}

if (require.main === module) {
  initializeMemorySystem()
    .then(() => {
      console.log('✅ Initialization complete!\n');
      process.exit(0);
    })
    .catch(error => {
      console.error('Initialization failed:', error);
      process.exit(1);
    });
}

module.exports = { initializeMemorySystem };
