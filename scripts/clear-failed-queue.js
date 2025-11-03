const { getFirestore } = require('../config/firestore');

async function clearFailedQueue() {
  console.log('Clearing failed queue from Firestore...');

  const db = getFirestore();
  const collection = db.collection('queue').doc('failed').collection('requests');

  let totalDeleted = 0;
  let batch = db.batch();
  let batchCount = 0;

  try {
    // Get all failed requests in batches
    const query = collection.limit(500);
    let snapshot = await query.get();

    while (!snapshot.empty) {
      console.log(`Processing batch of ${snapshot.size} documents...`);

      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        batchCount++;

        // Firestore batch limit is 500
        if (batchCount >= 500) {
          console.log('Committing batch...');
          batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      });

      totalDeleted += snapshot.size;

      // Get next batch
      snapshot = await query.get();
    }

    // Commit any remaining operations
    if (batchCount > 0) {
      await batch.commit();
    }

    console.log(`Successfully deleted ${totalDeleted} failed requests`);
    process.exit(0);

  } catch (error) {
    console.error('Error clearing failed queue:', error);
    process.exit(1);
  }
}

clearFailedQueue();