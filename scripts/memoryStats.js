const { initializeFirestore, getDb } = require('../config/firestore');
const { logger } = require('../utils/logger');

async function getMemoryStats() {
  console.log('📊 ReasoningBank Memory System Statistics\n');

  try {
    // Initialize Firestore first
    await initializeFirestore();
    const db = getDb();
    const memoryCollection = db.collection('reasoning-memory');

    // Get all memories
    console.log('Fetching memories from Firestore...\n');
    const snapshot = await memoryCollection.orderBy('updatedAt', 'desc').limit(1000).get();

    if (snapshot.empty) {
      console.log('⚠️  No memories found. System may not be initialized yet.');
      console.log('Run: npm run memory:init\n');
      return;
    }

    const memories = [];
    snapshot.forEach(doc => {
      memories.push({ id: doc.id, ...doc.data() });
    });

    console.log('='.repeat(60));
    console.log('OVERVIEW');
    console.log('='.repeat(60));
    console.log(`Total Memories: ${memories.length}\n`);

    // Source breakdown
    const sourceBreakdown = {};
    memories.forEach(m => {
      sourceBreakdown[m.source] = (sourceBreakdown[m.source] || 0) + 1;
    });

    console.log('Memories by Source:');
    Object.entries(sourceBreakdown).forEach(([source, count]) => {
      const percentage = ((count / memories.length) * 100).toFixed(1);
      console.log(`  ${source.padEnd(20)} ${count.toString().padStart(4)} (${percentage}%)`);
    });

    // Category breakdown
    const categoryBreakdown = {};
    memories.forEach(m => {
      categoryBreakdown[m.category] = (categoryBreakdown[m.category] || 0) + 1;
    });

    console.log('\nMemories by Category:');
    Object.entries(categoryBreakdown).forEach(([category, count]) => {
      const percentage = ((count / memories.length) * 100).toFixed(1);
      console.log(`  ${category.padEnd(20)} ${count.toString().padStart(4)} (${percentage}%)`);
    });

    // Success rate analysis
    const memoriesWithRate = memories.filter(m => m.successRate !== null && m.successRate !== undefined);

    console.log('\n' + '='.repeat(60));
    console.log('PERFORMANCE METRICS');
    console.log('='.repeat(60));

    if (memoriesWithRate.length > 0) {
      const avgSuccessRate = memoriesWithRate.reduce((sum, m) => sum + m.successRate, 0) / memoriesWithRate.length;
      console.log(`Average Success Rate: ${(avgSuccessRate * 100).toFixed(1)}%`);
      console.log(`Memories with Success Rate: ${memoriesWithRate.length}/${memories.length}\n`);
    } else {
      console.log('No memories have been used yet (no success rate data)\n');
    }

    // Retrieval statistics
    const totalRetrievals = memories.reduce((sum, m) => sum + (m.timesRetrieved || 0), 0);
    const retrievedMemories = memories.filter(m => (m.timesRetrieved || 0) > 0);

    console.log(`Total Retrievals: ${totalRetrievals}`);
    console.log(`Memories Retrieved: ${retrievedMemories.length}/${memories.length}\n`);

    // Usage statistics
    const totalSuccessUses = memories.reduce((sum, m) => sum + (m.timesUsedInSuccess || 0), 0);
    const totalFailureUses = memories.reduce((sum, m) => sum + (m.timesUsedInFailure || 0), 0);
    const totalUses = totalSuccessUses + totalFailureUses;

    console.log(`Times Used in Success: ${totalSuccessUses}`);
    console.log(`Times Used in Failure: ${totalFailureUses}`);
    console.log(`Total Uses: ${totalUses}\n`);

    // Top performers
    const topPerformers = memories
      .filter(m => m.successRate !== null && m.timesRetrieved > 0)
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 5);

    if (topPerformers.length > 0) {
      console.log('='.repeat(60));
      console.log('TOP PERFORMING MEMORIES');
      console.log('='.repeat(60));
      topPerformers.forEach((m, index) => {
        console.log(`\n${index + 1}. ${m.title}`);
        console.log(`   Success Rate: ${(m.successRate * 100).toFixed(1)}%`);
        console.log(`   Retrieved: ${m.timesRetrieved} times`);
        console.log(`   Category: ${m.category}`);
        console.log(`   Source: ${m.source}`);
      });
      console.log();
    }

    // Most retrieved
    const mostRetrieved = memories
      .filter(m => m.timesRetrieved > 0)
      .sort((a, b) => b.timesRetrieved - a.timesRetrieved)
      .slice(0, 5);

    if (mostRetrieved.length > 0) {
      console.log('='.repeat(60));
      console.log('MOST RETRIEVED MEMORIES');
      console.log('='.repeat(60));
      mostRetrieved.forEach((m, index) => {
        console.log(`\n${index + 1}. ${m.title}`);
        console.log(`   Retrieved: ${m.timesRetrieved} times`);
        console.log(`   Success Rate: ${m.successRate !== null ? (m.successRate * 100).toFixed(1) + '%' : 'N/A'}`);
        console.log(`   Category: ${m.category}`);
        console.log(`   Source: ${m.source}`);
      });
      console.log();
    }

    // Recent memories
    const recentMemories = memories.slice(0, 5);

    console.log('='.repeat(60));
    console.log('RECENT MEMORIES');
    console.log('='.repeat(60));
    recentMemories.forEach((m, index) => {
      const createdDate = m.createdAt ? m.createdAt.toDate().toISOString().split('T')[0] : 'Unknown';
      console.log(`\n${index + 1}. ${m.title}`);
      console.log(`   Category: ${m.category}`);
      console.log(`   Source: ${m.source}`);
      console.log(`   Created: ${createdDate}`);
      console.log(`   Retrieved: ${m.timesRetrieved || 0} times`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('✅ Statistics complete!\n');

  } catch (error) {
    console.error('❌ Failed to get memory statistics:', error.message);
    console.error('\nPossible causes:');
    console.error('- Collection does not exist (run npm run memory:init)');
    console.error('- Firestore connection issue');
    console.error('- Missing permissions\n');
    throw error;
  }
}

if (require.main === module) {
  getMemoryStats()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Stats script error:', error);
      process.exit(1);
    });
}

module.exports = { getMemoryStats };
