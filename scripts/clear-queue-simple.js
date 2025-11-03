const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp({
  projectId: 'cx-voice-backup-383016'
});

const db = admin.firestore();

async function clearFailedQueue() {
  console.log('Clearing failed queue from Firestore...');

  const collection = db.collection('queue').doc('failed').collection('requests');

  let totalDeleted = 0;

  try {
    // Get all failed requests in batches
    const query = collection.limit(500);
    let snapshot = await query.get();

    while (!snapshot.empty) {
      console.log(`Processing batch of ${snapshot.size} documents...`);

      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      totalDeleted += snapshot.size;

      console.log(`Deleted ${totalDeleted} documents so far...`);

      // Get next batch
      snapshot = await query.get();
    }

    console.log(`Successfully deleted ${totalDeleted} failed requests`);
    process.exit(0);

  } catch (error) {
    console.error('Error clearing failed queue:', error);
    process.exit(1);
  }
}

clearFailedQueue();