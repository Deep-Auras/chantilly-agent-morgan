#!/usr/bin/env node

/**
 * Script to add Draw.io XML templates to Chantilly's knowledge base
 * This enables the DrawioGenerator tool to use professional examples for agentic generation
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { initializeKnowledgeBase } = require('../services/knowledgeBase');
const { logger } = require('../utils/logger');

// Import the templates
const { knowledgeBaseEntries } = require('../examples/drawio_templates');

async function addDrawioTemplates() {
  try {
    logger.info('Initializing knowledge base service...');
    const knowledgeBase = await initializeKnowledgeBase();
    
    logger.info(`Found ${knowledgeBaseEntries.length} draw.io templates to add`);
    
    const results = [];
    
    for (const [index, entry] of knowledgeBaseEntries.entries()) {
      try {
        logger.info(`Adding template ${index + 1}/${knowledgeBaseEntries.length}: ${entry.title}`);
        
        // Add the knowledge base entry
        const id = await knowledgeBase.addKnowledge({
          title: entry.title,
          content: entry.content,
          category: entry.category,
          tags: entry.tags,
          searchTerms: [
            'draw.io', 'diagram', 'template', 'xml', 'professional', 
            entry.metadata?.diagramType,
            ...entry.tags
          ].filter(Boolean),
          priority: 85, // High priority for templates
          enabled: true
        });
        
        results.push({
          template: entry.title,
          status: 'success',
          id: id,
          category: entry.category,
          tags: entry.tags.length
        });
        
        logger.info(`✅ Successfully added: ${entry.title} (ID: ${id})`);
        
      } catch (error) {
        logger.error(`❌ Failed to add template: ${entry.title}`, error);
        results.push({
          template: entry.title,
          status: 'failed',
          error: error.message
        });
      }
    }
    
    // Summary
    const successful = results.filter(r => r.status === 'success');
    const failed = results.filter(r => r.status === 'failed');
    
    logger.info('\n📊 SUMMARY:');
    logger.info(`✅ Successfully added: ${successful.length} templates`);
    logger.info(`❌ Failed: ${failed.length} templates`);
    
    if (successful.length > 0) {
      logger.info('\n✅ SUCCESSFUL ADDITIONS:');
      successful.forEach(result => {
        logger.info(`  - ${result.template} (ID: ${result.id})`);
        logger.info(`    Category: ${result.category}, Tags: ${result.tags}`);
      });
    }
    
    if (failed.length > 0) {
      logger.info('\n❌ FAILED ADDITIONS:');
      failed.forEach(result => {
        logger.error(`  - ${result.template}: ${result.error}`);
      });
    }
    
    logger.info('\n🎯 Draw.io templates have been added to the knowledge base!');
    logger.info('The DrawioGenerator tool can now use these professional examples for agentic generation.');
    
    return results;
    
  } catch (error) {
    logger.error('Failed to add draw.io templates', error);
    throw error;
  }
}

// Run the script if called directly
if (require.main === module) {
  addDrawioTemplates()
    .then(() => {
      logger.info('Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Script failed', error);
      process.exit(1);
    });
}

module.exports = { addDrawioTemplates };