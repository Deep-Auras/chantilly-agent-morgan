const template = require('./examples/taskTemplates/bitrixOpenInvoicesTemplate');
const tmpl = template.bitrixOpenInvoicesTemplate;

// Basic template structure validation
console.log('Template Structure Validation:');
console.log('✓ templateId:', tmpl.templateId ? 'PRESENT' : 'MISSING');
console.log('✓ name:', tmpl.name ? 'PRESENT' : 'MISSING');
console.log('✓ executionScript:', tmpl.executionScript ? 'PRESENT' : 'MISSING');

// Check for required class structure
const script = tmpl.executionScript;
console.log('\nExecution Script Validation:');
console.log('✓ Contains class:', script.includes('class') ? 'YES' : 'NO');
console.log('✓ Extends BaseTaskExecutor:', script.includes('extends BaseTaskExecutor') ? 'YES' : 'NO');
console.log('✓ Has execute method:', script.includes('async execute()') ? 'YES' : 'NO');
console.log('✓ Has updateProgress calls:', script.includes('updateProgress') ? 'YES' : 'NO');
console.log('✓ Has callAPI calls:', script.includes('callAPI') ? 'YES' : 'NO');
console.log('✓ Has generateHTMLReport method:', script.includes('generateHTMLReport') ? 'YES' : 'NO');
console.log('✓ Uses this.log():', script.includes('this.log(') ? 'YES' : 'NO');

// Check for security issues
console.log('\nSecurity Validation:');
console.log('✓ No process access:', script.includes('process.') ? 'VIOLATION' : 'SAFE');
console.log('✓ No fs module:', script.includes('require("fs")') ? 'VIOLATION' : 'SAFE');
console.log('✓ No eval:', script.includes('eval(') ? 'VIOLATION' : 'SAFE');
console.log('✓ Script size:', script.length < 50000 ? `OK (${script.length} chars)` : 'TOO LARGE');

// Parameter schema validation
console.log('\nParameter Schema:');
const schema = tmpl.definition && tmpl.definition.parameterSchema;
console.log('✓ Has parameter schema:', schema ? 'YES' : 'NO');
console.log('✓ Schema type object:', schema && schema.type === 'object' ? 'YES' : 'NO');

// Template metadata validation
console.log('\nTemplate Metadata:');
console.log('✓ Has triggers:', tmpl.triggers ? 'YES' : 'NO');
console.log('✓ Has category:', tmpl.category ? 'YES' : 'NO');
console.log('✓ Enabled:', tmpl.enabled ? 'YES' : 'NO');

console.log('\n=== VALIDATION COMPLETE ===');

// Summary
const issues = [];
if (!tmpl.templateId) {issues.push('Missing templateId');}
if (!tmpl.name) {issues.push('Missing name');}
if (!tmpl.executionScript) {issues.push('Missing executionScript');}
if (!script.includes('class')) {issues.push('Missing class definition');}
if (!script.includes('extends BaseTaskExecutor')) {issues.push('Class must extend BaseTaskExecutor');}
if (!script.includes('async execute()')) {issues.push('Missing execute method');}
if (!script.includes('updateProgress')) {issues.push('Missing updateProgress calls');}
if (!script.includes('callAPI')) {issues.push('Missing callAPI calls');}
if (!script.includes('generateHTMLReport')) {issues.push('Missing generateHTMLReport method');}
if (script.includes('process.')) {issues.push('Security violation: process access');}
if (script.includes('require("fs")')) {issues.push('Security violation: fs module');}
if (script.includes('eval(')) {issues.push('Security violation: eval usage');}
if (script.length >= 50000) {issues.push('Script too large');}

if (issues.length === 0) {
  console.log('\n🟢 VALIDATION PASSED: Template is valid and ready for deployment');
} else {
  console.log('\n🔴 VALIDATION FAILED:');
  issues.forEach(issue => console.log(`  - ${issue}`));
}