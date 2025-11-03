const { initializeFirestore, getDb, getFieldValue } = require('../config/firestore');

(async () => {
  await initializeFirestore();
  const db = getDb();

  // Get the missed_revenue_opportunity_report template
  const doc = await db.collection('task-templates').doc('missed_revenue_opportunity_report').get();

  if (!doc.exists) {
    console.log('Template not found');
    return;
  }

  const data = doc.data();
  console.log('Template ID:', doc.id);
  console.log('Template Name:', data.name);
  console.log('Description:', data.description);
  console.log('Has embedding:', !!data.embedding);
  console.log('Embedding dimensions:', data.embeddingDimensions || 'unknown');
  console.log('Distance field in doc:', data.distance);

  process.exit(0);
})();
