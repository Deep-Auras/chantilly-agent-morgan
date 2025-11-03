const { initializeFirestore, getDb, getFieldValue } = require('../config/firestore');
const embeddingService = require('../services/embeddingService');
const { FieldValue } = require('@google-cloud/firestore');

async function addTestDocument() {
  await initializeFirestore();
  const db = getDb();

  // Generate a real embedding
  const testText = 'This is a test memory for vector search validation';
  const embedding = await embeddingService.embedQuery(testText, 'RETRIEVAL_DOCUMENT');

  // Add document with real embedding wrapped in FieldValue.vector()
  const docRef = await db.collection('reasoning-memory').add({
    title: 'Test Vector Search Document',
    description: 'Used to validate vector search functionality',
    content: testText,
    source: 'system',
    category: 'general_strategy',
    embedding: FieldValue.vector(embedding),
    templateId: null,
    taskId: null,
    successRate: null,
    timesRetrieved: 0,
    timesUsedInSuccess: 0,
    timesUsedInFailure: 0,
    createdAt: getFieldValue().serverTimestamp(),
    updatedAt: getFieldValue().serverTimestamp()
  });

  console.log('✅ Test document added:', docRef.id);
}

addTestDocument()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
