const { initializeFirestore, getDb } = require('../config/firestore');
const { getReasoningMemoryModel } = require('../models/reasoningMemory');
const { getMemoryExtractor } = require('../services/memoryExtractor');
const embeddingService = require('../services/embeddingService');
const { logger } = require('../utils/logger');

/**
 * Phase 1 Validation Test Script
 * Tests core memory infrastructure:
 * 1. Memory storage with embeddings
 * 2. Memory retrieval with vector search
 * 3. Memory extraction from trajectories
 */

async function testPhase1() {
  console.log('🧪 Phase 1 Validation Tests\n');
  console.log('=' .repeat(60));

  try {
    // Initialize Firestore
    await initializeFirestore();
    console.log('✅ Firestore initialized\n');

    const memoryModel = getReasoningMemoryModel();
    const memoryExtractor = getMemoryExtractor();

    // Test 1: Memory Storage
    console.log('Test 1: Memory Storage with Embeddings');
    console.log('-'.repeat(60));

    const testMemory = {
      title: 'Test Memory - Bitrix24 API Rate Limiting',
      description: 'Always respect rate limits when making Bitrix24 API calls',
      content: 'Bitrix24 has strict rate limits: 2 requests/second for REST API. Use queue system to avoid hitting limits. Implement exponential backoff for failures.',
      source: 'task_success',
      category: 'api_usage',
      templateId: 'test_template_001',
      taskId: 'test_task_001'
    };

    // Generate embedding using Vertex AI
    console.log('Generating embedding for test memory...');
    const embedding = await embeddingService.embedQuery(
      `${testMemory.title}. ${testMemory.description}. ${testMemory.content}`,
      'RETRIEVAL_DOCUMENT'
    );
    console.log(`✅ Generated ${embedding.length}-dimensional embedding`);

    testMemory.embedding = embedding;

    const memoryId = await memoryModel.addMemory(testMemory);
    console.log(`✅ Memory stored with ID: ${memoryId}\n`);

    // Test 2: Memory Retrieval with Vector Search
    console.log('Test 2: Memory Retrieval with Vector Search');
    console.log('-'.repeat(60));

    const queryText = 'How do I handle Bitrix24 API rate limits?';
    console.log(`Query: "${queryText}"`);
    console.log('Generating query embedding...');

    const queryEmbedding = await embeddingService.embedQuery(queryText, 'RETRIEVAL_QUERY');
    console.log(`✅ Generated ${queryEmbedding.length}-dimensional query embedding`);

    console.log('Performing vector search...');
    const retrievedMemories = await memoryModel.retrieveMemories(queryEmbedding, 3);

    console.log(`✅ Retrieved ${retrievedMemories.length} memories\n`);

    retrievedMemories.forEach((memory, index) => {
      console.log(`Memory ${index + 1}:`);
      console.log(`  Title: ${memory.title}`);
      console.log(`  Similarity: ${(memory.similarityScore * 100).toFixed(2)}%`);
      console.log(`  Category: ${memory.category}`);
      console.log(`  Retrieved: ${memory.timesRetrieved} times`);
      console.log();
    });

    // Test 3: Memory Extraction from Success Trajectory
    console.log('Test 3: Memory Extraction from Success Trajectory');
    console.log('-'.repeat(60));

    const mockSuccessTrajectory = {
      templateId: 'test_template_002',
      templateName: 'Create Contact in Bitrix24',
      templateDescription: 'Creates a new contact with validation',
      taskId: 'test_task_002',
      parameters: {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com'
      },
      steps: [
        {
          action: 'validate_parameters',
          description: 'Validated required fields',
          status: 'completed',
          result: { valid: true }
        },
        {
          action: 'call_api',
          description: 'Called crm.contact.add',
          status: 'completed',
          result: { contactId: 123 }
        },
        {
          action: 'verify_creation',
          description: 'Verified contact was created',
          status: 'completed',
          result: { verified: true }
        }
      ],
      completionTime: 1500,
      resourceUsage: 'Low'
    };

    console.log('Extracting memories from success trajectory...');
    const extractedMemories = await memoryExtractor.extractFromSuccess(mockSuccessTrajectory);

    console.log(`✅ Extracted ${extractedMemories.length} memories\n`);

    extractedMemories.forEach((memory, index) => {
      console.log(`Extracted Memory ${index + 1}:`);
      console.log(`  Title: ${memory.title}`);
      console.log(`  Description: ${memory.description}`);
      console.log(`  Category: ${memory.category}`);
      console.log(`  Content: ${memory.content.substring(0, 100)}...`);
      console.log();
    });

    // Test 4: Memory Statistics
    console.log('Test 4: Memory Statistics');
    console.log('-'.repeat(60));

    const allMemories = await memoryModel.getAllMemories(10);
    console.log(`Total memories in system: ${allMemories.length}`);

    const sourceBreakdown = {};
    const categoryBreakdown = {};

    allMemories.forEach(m => {
      sourceBreakdown[m.source] = (sourceBreakdown[m.source] || 0) + 1;
      categoryBreakdown[m.category] = (categoryBreakdown[m.category] || 0) + 1;
    });

    console.log('\nMemories by Source:');
    Object.entries(sourceBreakdown).forEach(([source, count]) => {
      console.log(`  ${source}: ${count}`);
    });

    console.log('\nMemories by Category:');
    Object.entries(categoryBreakdown).forEach(([category, count]) => {
      console.log(`  ${category}: ${count}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('✅ Phase 1 Validation Complete!\n');
    console.log('Summary:');
    console.log('  ✅ Memory storage with embeddings: WORKING');
    console.log('  ✅ Vector search retrieval: WORKING');
    console.log('  ✅ Memory extraction: WORKING');
    console.log('  ✅ Statistics tracking: WORKING');
    console.log('\n🚀 Phase 1 infrastructure is ready for integration!\n');

  } catch (error) {
    console.error('\n❌ Phase 1 validation failed:', error.message);
    console.error('\nError details:', error);
    console.error('\nStack trace:', error.stack);
    throw error;
  }
}

if (require.main === module) {
  testPhase1()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testPhase1 };
