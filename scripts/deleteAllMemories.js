const { initializeFirestore, getDb } = require('../config/firestore');

async function deleteAll() {
  await initializeFirestore();
  const db = getDb();

  // Delete all documents in reasoning-memory
  const snapshot = await db.collection('reasoning-memory').get();
  console.log(`Found ${snapshot.size} documents to delete`);

  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
  console.log('✅ All documents deleted');
}

deleteAll()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
