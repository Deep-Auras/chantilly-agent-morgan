#!/usr/bin/env node

/**
 * Fix invoice_from_call_transcript template bugs
 */

const { initializeFirestore, getDb, getFieldValue } = require('../config/firestore');
const fs = require('fs');

async function fixTemplate() {
  console.log('Fetching template from Firestore...');
  await initializeFirestore();
  const db = getDb();

  const docRef = db.collection('task-templates').doc('invoice_from_call_transcript');
  const doc = await docRef.get();

  if (!doc.exists) {
    console.error('Template not found!');
    process.exit(1);
  }

  const data = doc.data();

  // Backup original
  fs.writeFileSync('/tmp/template_backup.json', JSON.stringify(data, null, 2));
  console.log('✅ Original template backed up to /tmp/template_backup.json');

  let script = data.executionScript;

  // Check for bugs
  console.log('\n🔍 Checking for bugs:');
  console.log('- Has CallerNumber (wrong):', script.includes('CallerNumber'));
  console.log('- Has CalleeNumber (wrong):', script.includes('CalleeNumber'));
  console.log('- Has HasTranscription (wrong):', script.includes('HasTranscription'));
  console.log('- Has date(StartTime) (wrong):', script.includes('date(StartTime)'));
  console.log('- Has PR_LOCATION: 4 (wrong):', script.includes('PR_LOCATION: 4'));
  console.log('- Has parseInt truncation (potential):', script.includes('parseInt(recordingId'));

  // Apply fixes
  console.log('\n🔧 Applying fixes...');

  // Fix 1: Wrong field names
  if (script.includes('CallerNumber') || script.includes('CalleeNumber') || script.includes('HasTranscription')) {
    // Replace wrong field names with correct ones
    script = script.replace(/\bCallerNumber\b/g, 'FromCallerNumber');
    script = script.replace(/\bCalleeNumber\b/g, 'ToCallerNumber');
    script = script.replace(/\bHasTranscription\b/g, 'IsTranscribed');
    console.log('✅ Fixed field names: CallerNumber → FromCallerNumber, CalleeNumber → ToCallerNumber, HasTranscription → IsTranscribed');
  }

  // Fix 2: Date filter syntax - replace date() function with proper date range
  if (script.includes('date(StartTime)')) {
    // Find the pattern: date(StartTime) eq ${searchDate}
    // Replace with: StartTime ge ${searchDate}T00:00:00Z and StartTime lt ${nextDay}T00:00:00Z

    // This is complex - need to find the exact pattern and replace it
    const dateFilterPattern = /date\(StartTime\)\s+eq\s+\$\{searchDate\}/g;

    if (dateFilterPattern.test(script)) {
      // Need to add nextDay calculation before the filter
      // Find the line with searchDate definition
      const searchDatePattern = /(const searchDate = [^;]+;)/;
      const searchDateMatch = script.match(searchDatePattern);

      if (searchDateMatch) {
        const searchDateLine = searchDateMatch[1];
        const nextDayCalc = `\n    const nextDay = new Date(new Date(date).getTime() + 24*60*60*1000).toISOString().split('T')[0];`;

        // Insert nextDay calculation after searchDate
        script = script.replace(searchDateLine, searchDateLine + nextDayCalc);

        // Replace the date() filter
        script = script.replace(
          /date\(StartTime\)\s+eq\s+\$\{searchDate\}/g,
          'StartTime ge ${searchDate}T00:00:00Z and StartTime lt ${nextDay}T00:00:00Z'
        );

        console.log('✅ Fixed date filter syntax: date(StartTime) eq → StartTime ge/lt with ISO 8601');
      }
    }
  }

  // Fix 3: PR_LOCATION wrong value
  if (script.includes('PR_LOCATION: 4')) {
    script = script.replace(/PR_LOCATION:\s*4/g, 'PR_LOCATION: 2');
    console.log('✅ Fixed PR_LOCATION: 4 → 2 (production-verified)');
  }

  // Fix 4: parseInt truncation bug (if exists)
  // Look for pattern: parseInt(recordingId, 10) where recordingId might not be numeric
  const parseIntPattern = /const numericId = parseInt\(recordingId,?\s*10\)/;
  if (parseIntPattern.test(script)) {
    // Replace with validation
    script = script.replace(
      parseIntPattern,
      `const numericId = /^\\d+$/.test(recordingId) ? parseInt(recordingId, 10) : null;
    if (numericId === null) {
      throw new Error(\`Invalid recording ID format: expected numeric ID, got "\${recordingId}"\`);
    }`
    );
    console.log('✅ Fixed parseInt truncation: added numeric validation before parsing');
  }

  // Update template
  console.log('\n📝 Updating template in Firestore...');
  await docRef.update({
    executionScript: script,
    updatedAt: getFieldValue().serverTimestamp(),
    version: (data.version || 1) + 1,
    lastModifiedBy: 'claude-code-bug-fix',
    changeLog: `Fixed bugs: wrong field names (CallerNumber→FromCallerNumber, CalleeNumber→ToCallerNumber, HasTranscription→IsTranscribed), date filter syntax (date()→ge/lt), PR_LOCATION (4→2), parseInt validation`
  });

  console.log('✅ Template updated successfully!');
  console.log('\n📊 Summary:');
  console.log('- Old script length:', data.executionScript.length);
  console.log('- New script length:', script.length);
  console.log('- Version:', data.version || 1, '→', (data.version || 1) + 1);

  // Save fixed version
  fs.writeFileSync('/tmp/template_fixed.json', JSON.stringify({ ...data, executionScript: script }, null, 2));
  console.log('- Fixed template saved to /tmp/template_fixed.json');
}

fixTemplate().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
