/**
 * Bitrix24 API Integration Knowledge Base for Chantilly Agent System
 * 
 * This knowledge base document provides comprehensive guidance for complex task 
 * execution system on leveraging services/queue.js to call Bitrix24 API endpoints.
 * 
 * Category: system_information (hidden from users, high priority for AI)
 * Priority: 95 (Critical for Gemini AI task template generation)
 */

const bitrix24ApiGuide = `# Bitrix24 API Integration Guide for Complex Task Templates

## Overview

This document provides comprehensive guidance for Chantilly Agent's complex task execution system on how to leverage the \`services/queue.js\` service to call any Bitrix24 API endpoint efficiently and reliably. This information is specifically for AI task template generation and execution.

## 🚨 CRITICAL: Gemini Model Validation (DETERMINISTIC)

**IMPORTANT: BaseTaskExecutor automatically validates ALL Gemini model names before API calls.**

### How Model Validation Works

When you call \`this.callGemini(prompt, { model: 'model-name' })\`, the system:

1. **Checks against INVALID_MODELS list** → Auto-corrects to \`gemini-2.5-pro\`
2. **Checks against VALID_MODELS list** → Allows if valid
3. **Unknown/invalid models** → Auto-corrects to \`gemini-2.5-pro\` (STRICT)

### Valid Models (2025)
\`\`\`javascript
// ✅ VALID - Use any of these:
'gemini-2.5-pro'          // DEFAULT - Current flagship (Feb 2025)
'gemini-2.0-flash-exp'    // Experimental fast model
'gemini-1.5-pro-latest'   // Latest stable 1.5
'gemini-1.5-flash-latest' // Latest fast 1.5
\`\`\`

### Invalid Models (Auto-Corrected)
\`\`\`javascript
// ❌ INVALID - These do NOT exist in v1beta API:
'gemini-1.5-pro-002'      // → Auto-corrected to gemini-2.5-pro
'gemini-1.5-flash-002'    // → Auto-corrected to gemini-2.5-pro
'gemini-1.5-pro'          // → Deprecated (use gemini-1.5-pro-latest)
'gemini-1.5-flash'        // → Deprecated (use gemini-1.5-flash-latest)
\`\`\`

### Best Practice: Omit Model Parameter

**RECOMMENDED: Let the system use the default model:**
\`\`\`javascript
// ✅ BEST PRACTICE - No model specified, uses default (gemini-2.5-pro)
const analysis = await this.callGemini(prompt, {
  temperature: 0.1,
  maxTokens: 2048
});
\`\`\`

**Only specify model if you need a specific one:**
\`\`\`javascript
// ✅ OK - Explicitly using fast model
const quickAnalysis = await this.callGemini(prompt, {
  model: 'gemini-2.0-flash-exp', // Valid model
  temperature: 0.3
});
\`\`\`

**❌ NEVER hardcode invalid models:**
\`\`\`javascript
// ❌ BAD - This model doesn't exist (but will be auto-corrected)
const result = await this.callGemini(prompt, {
  model: 'gemini-1.5-pro-002' // Invalid → auto-corrected to gemini-2.5-pro
});
\`\`\`

### Auto-Repair Impact

**Before validation layer:** Templates with invalid models would fail with 404 errors, triggering expensive auto-repair cycles.

**After validation layer:** Invalid models are silently corrected to default, preventing failures and saving tokens.

### Validation Log Messages

The system logs model validation decisions:
\`\`\`
[ERROR] Unknown/invalid model specified - rejecting
  requestedModel: "gemini-1.5-pro-002"
  validModels: ["gemini-2.5-pro", "gemini-2.0-flash-exp", ...]
  correctedModel: "gemini-2.5-pro"
  action: "Using default model instead"
\`\`\`

**SUMMARY: You don't need to validate models yourself - the system does it deterministically. ANY invalid or unknown model is automatically corrected to gemini-2.5-pro.**

## 🚨 CRITICAL: Customer vs Company Entity Mapping

**MANDATORY: When users mention "customer", determine whether they mean a contact (individual) or company (organization).**

### Customer ID Context Detection

**When user says "customer ID 158" or "customer 158":**

1. **If context suggests individual person** → Use **Contact entity**:
   \`\`\`javascript
   // Get contact details
   const contact = await this.callAPI('crm.contact.get', { ID: customerId });
   
   // Find invoices for this contact
   const invoices = await this.callAPI('crm.invoice.list', {
     filter: { 'UF_CONTACT_ID': customerId },
     select: ['ID', 'ACCOUNT_NUMBER', 'PRICE', 'STATUS_ID']
   });
   
   // Find activities for this contact  
   const activities = await this.callAPI('crm.activity.list', {
     filter: { 
       'OWNER_TYPE_ID': 3, // 3 = Contact
       'OWNER_ID': customerId 
     }
   });
   \`\`\`

2. **If context suggests organization** → Use **Company entity**:
   \`\`\`javascript
   // Get company details
   const company = await this.callAPI('crm.company.get', { ID: customerId });
   
   // Find invoices for this company
   const invoices = await this.callAPI('crm.invoice.list', {
     filter: { 'UF_COMPANY_ID': customerId },
     select: ['ID', 'ACCOUNT_NUMBER', 'PRICE', 'STATUS_ID']
   });
   
   // Find activities for this company
   const activities = await this.callAPI('crm.activity.list', {
     filter: { 
       'OWNER_TYPE_ID': 4, // 4 = Company
       'OWNER_ID': customerId 
     }
   });
   \`\`\`

### Context Clues for Detection

**Individual/Contact indicators:**
- "customer John Smith", "customer contact", "person", "individual"
- Requests about personal activities, calls, meetings
- Context mentioning names, email addresses, phone numbers

**Organization/Company indicators:**  
- "customer ABC Corp", "client company", "business", "organization"
- Context mentioning company revenue, employees, business activities
- B2B context, corporate relationships

### Default Behavior
**If unclear from context, ASK THE USER for clarification:**
\`\`\`javascript
if (!this.parameters.entityType) {
  throw new Error('Please clarify: Is customer ID \${customerId} a contact (individual person) or company (organization)?');
}
\`\`\`

### Owner Type IDs for Activities
- **1** = Lead
- **2** = Deal
- **3** = Contact (individual customer)
- **4** = Company (organization customer)

**CRITICAL: The user's complaint about "did you look up company id or customer id?" suggests the system incorrectly used company entity when they meant contact entity.**

## 🚨 CRITICAL: Activity Fetching & HTML Rendering Anti-Patterns

### ❌ ANTI-PATTERN 1: Relying Only on API Limit Parameter

**PROBLEM: Bitrix24's \`limit\` parameter is UNRELIABLE - it often returns more items than requested!**

**User Bug Report:** "activities are still not limited to the last 4 recent entries"

**Root Cause:** Missing \`.slice()\` in HTML rendering after \`.map()\`

**WRONG - No HTML-level limiting:**
\`\`\`javascript
// ❌ This will display ALL activities returned by API (could be 10-20+)
generateHTMLReport(reportData) {
  return \`
    <div class="activities">
      \${entity.activities.map(activity => \`
        <div class="activity-item">
          <h4>\${activity.SUBJECT}</h4>
          <p>\${activity.DESCRIPTION}</p>
        </div>
      \`).join('')}
    </div>
  \`;
}
\`\`\`

**✅ CORRECT - Double-limiting (API + HTML):**
\`\`\`javascript
// Step 1: Fetch with limit parameter
const activities = await this.callAPI('crm.activity.list', {
  filter: { OWNER_TYPE_ID: 4, OWNER_ID: entityId },
  order: { 'DATE_TIME': 'DESC' },
  start: 0,
  limit: 4  // API limit (may return more!)
});

// Step 2: Store in reportData
reportData.activities = activities?.result || [];

// Step 3: ALWAYS use .slice() in HTML rendering
generateHTMLReport(reportData) {
  return \`
    <div class="activities">
      \${reportData.activities.slice(0, 4).map(activity => \`
        <div class="activity-item">
          <h4>\${activity.SUBJECT}</h4>
          <p>\${activity.DESCRIPTION}</p>
        </div>
      \`).join('')}
    </div>
  \`;
}
\`\`\`

**Why Double-Limiting is Required:**
1. Bitrix24 API \`limit\` parameter is unreliable (documented bug)
2. API may return 10-50 results even with \`limit: 4\`
3. HTML MUST explicitly limit with \`.slice(0, N)\` before \`.map()\`
4. This is the #1 cause of "showing too many items" bugs

### ❌ ANTI-PATTERN 2: Fetching Activities from Single Owner Only

**PROBLEM: In reports that aggregate by entity (Best Customers, Top Companies), each entity may have BOTH company AND contact relationships!**

**WRONG - Only checking primary entity:**
\`\`\`javascript
// ❌ This only fetches activities from the company (misses contact activities)
async enrichEntities(entities, type) {
  for (const entity of entities) {
    const ownerTypeId = type === 'company' ? 4 : 3;

    const activities = await this.callAPI('crm.activity.list', {
      filter: {
        'OWNER_TYPE_ID': ownerTypeId,
        'OWNER_ID': entity.id
      },
      select: ['SUBJECT', 'DATE_TIME'],
      limit: 4
    });

    entity.activities = activities?.result || [];
  }
}
\`\`\`

**✅ CORRECT - Fetching from BOTH company AND contact:**
\`\`\`javascript
async enrichEntities(entities, type, invoices) {
  const isCompany = type === 'company';
  const enriched = [];

  for (const entity of entities) {
    await this.checkCancellation();

    let allActivities = [];

    // Step 1: Fetch from primary entity
    try {
      const primaryActivities = await this.callAPI('crm.activity.list', {
        filter: {
          'OWNER_TYPE_ID': isCompany ? 4 : 3,
          'OWNER_ID': entity.id
        },
        select: [
          'ID', 'TYPE_ID', 'SUBJECT', 'DESCRIPTION', 'DIRECTION',
          'DATE_TIME', 'CREATED', 'AUTHOR_ID', 'RESPONSIBLE_ID',
          'RESULT_STATUS', 'RESULT_TEXT'
        ],
        order: { 'DATE_TIME': 'DESC' },
        start: 0,
        limit: 50  // Fetch more, limit later
      });

      if (primaryActivities?.result) {
        allActivities = allActivities.concat(primaryActivities.result);
      }
    } catch (error) {
      this.log('warn', 'Failed to fetch primary activities', {
        entityId: entity.id,
        error: error.message
      });
    }

    // Step 2: Fetch from related entity (if exists)
    // For companies, also check related contacts
    // For contacts, also check related companies
    if (entity.invoiceIds && entity.invoiceIds.length > 0) {
      try {
        const invoiceDetails = await this.callAPI('crm.invoice.get', {
          id: entity.invoiceIds[0]
        });

        const relatedId = isCompany
          ? invoiceDetails?.result?.UF_CONTACT_ID
          : invoiceDetails?.result?.UF_COMPANY_ID;

        if (relatedId && relatedId !== '0') {
          const relatedActivities = await this.callAPI('crm.activity.list', {
            filter: {
              'OWNER_TYPE_ID': isCompany ? 3 : 4,
              'OWNER_ID': relatedId
            },
            select: [
              'ID', 'TYPE_ID', 'SUBJECT', 'DESCRIPTION', 'DIRECTION',
              'DATE_TIME', 'CREATED', 'AUTHOR_ID', 'RESPONSIBLE_ID',
              'RESULT_STATUS', 'RESULT_TEXT'
            ],
            order: { 'DATE_TIME': 'DESC' },
            start: 0,
            limit: 50
          });

          if (relatedActivities?.result) {
            allActivities = allActivities.concat(relatedActivities.result);
          }
        }
      } catch (error) {
        this.log('warn', 'Failed to fetch related activities', {
          error: error.message
        });
      }
    }

    // Step 3: Sort combined activities and limit
    if (allActivities.length > 0) {
      allActivities.sort((a, b) => new Date(b.DATE_TIME) - new Date(a.DATE_TIME));
      allActivities = allActivities.slice(0, 4);
    }

    enriched.push({
      ...entity,
      activities: allActivities
    });
  }

  return enriched;
}
\`\`\`

### ❌ ANTI-PATTERN 3: Missing Critical Activity Fields

**PROBLEM: Minimal field selection prevents proper activity categorization and display!**

**WRONG - Insufficient fields:**
\`\`\`javascript
// ❌ Missing DIRECTION, TYPE_ID, RESULT_STATUS, and other critical fields
const activities = await this.callAPI('crm.activity.list', {
  filter: { OWNER_TYPE_ID: 4, OWNER_ID: entityId },
  select: ['SUBJECT', 'DESCRIPTION', 'DATE_TIME'],
  limit: 4
});
\`\`\`

**✅ CORRECT - Complete field selection:**
\`\`\`javascript
const activities = await this.callAPI('crm.activity.list', {
  filter: {
    'OWNER_TYPE_ID': 4,
    'OWNER_ID': entityId
  },
  select: [
    'ID',                // ✅ Activity identifier
    'TYPE_ID',           // ✅ CRITICAL: 1=Call, 2=Meeting, 3=Email, 4=Task
    'SUBJECT',           // ✅ Activity title
    'DESCRIPTION',       // ✅ Activity details
    'DIRECTION',         // ✅ CRITICAL: 1=Incoming (from customer), 2=Outgoing (to customer)
    'DATE_TIME',         // ✅ CRITICAL: Actual activity timestamp (use for sorting)
    'CREATED',           // ✅ When logged in system (fallback)
    'AUTHOR_ID',         // ✅ Who created the activity
    'RESPONSIBLE_ID',    // ✅ Who is responsible
    'RESULT_STATUS',     // ✅ CRITICAL: Completion status
    'RESULT_TEXT'        // ✅ Result description
  ],
  order: { 'DATE_TIME': 'DESC' },  // ✅ Sort by actual activity time (NOT CREATED)
  start: 0,                         // ✅ CRITICAL: Start from beginning of pagination
  limit: 50                         // ✅ Fetch more than needed, limit in code later
});
\`\`\`

**Missing Fields Impact:**
- No \`DIRECTION\`: Can't distinguish incoming vs outgoing communications
- No \`TYPE_ID\`: Can't categorize calls vs meetings vs emails
- No \`RESULT_STATUS\`: Can't show if activity was completed or failed
- No \`start: 0\`: Pagination may start from wrong offset
- Ordering by \`CREATED\`: Shows when activity was logged, not when it occurred

### HTML Rendering Best Practices

**ALWAYS use .slice() before .map() for arrays in HTML:**

\`\`\`javascript
// ✅ CORRECT Examples
\${activities.slice(0, 4).map(a => \`<div>...</div>\`).join('')}
\${products.slice(0, 5).map(p => \`<li>...</li>\`).join('')}
\${invoices.slice(0, 10).map(inv => \`<div>...</div>\`).join('')}
\${topCompanies.slice(0, 10).map(c => \`<div>...</div>\`).join('')}

// ❌ WRONG Examples (will display unlimited items)
\${activities.map(a => \`<div>...</div>\`).join('')}
\${products.map(p => \`<li>...</li>\`).join('')}
\${invoices.map(inv => \`<div>...</div>\`).join('')}
\`\`\`

**Real-World Example from Working Template:**
\`\`\`javascript
// From bitrixOpenInvoicesTemplate.js line 3020
\${invoiceActivities.slice(0, 3).map(activity => \`
  <div class="activity-item">
    <div class="font-medium">\${activity.SUBJECT || 'Activity'}</div>
    <div class="text-sm text-gray-600">\${activity.DESCRIPTION || ''}</div>
    <div class="text-xs text-gray-500">\${new Date(activity.DATE_TIME).toLocaleDateString()}</div>
  </div>
\`).join('')}
\`\`\`

## 🎯 PATTERN RECOGNITION: Few-Shot Examples for Gemini 2.5 Pro

**IMPORTANT: Study these 3 working patterns before generating any code. Each demonstrates the REQUIRED structure for different request types.**

### PATTERN 1: Invoice Product Analysis Request
**Input:** "Analyze invoice line items and rank products for the last 30 days"
**Key Recognition:** "invoice line items" and "products" = PRODUCT_ROWS field

**Output Pattern:**
\`\`\`javascript
// REQUIRED: Always use this exact structure for invoice analysis
class InvoiceAnalysisExecutor extends BaseTaskExecutor {
  async execute() {
    // PATTERN: Parameter extraction with date detection
    const { dateRange } = this.parameters;
    const startDate = dateRange?.start || this.extractDateFromMessage('30 days ago');
    const endDate = dateRange?.end || new Date().toISOString().split('T')[0];
    
    // PATTERN: Invoice list (PRODUCT_ROWS NOT available - use crm.invoice.get)
    const response = await this.callAPI('crm.invoice.list', {
      select: ['ID', 'ACCOUNT_NUMBER', 'DATE_INSERT'],
      filter: { 
        '>=DATE_INSERT': startDate,
        '<=DATE_INSERT': endDate 
      }
    });
    
    // CRITICAL: Always extract .result from Bitrix24 API response
    const invoices = response?.result || [];
    
    // PATTERN: Always log actual counts, not variables
    this.log('info', \`Found \${invoices.length} invoices\`, {
      dateRange: { startDate, endDate },
      responseStructure: { hasResult: !!response?.result, total: response?.total }
    });
    
    // PATTERN: PRODUCT_ROWS analysis (invoice line items/products)  
    const productStats = {};
    for (const invoice of invoices || []) {
      // CRITICAL: invoice.PRODUCT_ROWS contains all "products", "line items", "items"
      if (invoice.PRODUCT_ROWS?.length > 0) {
        for (const row of invoice.PRODUCT_ROWS) {
          const productId = row.PRODUCT_ID;
          const productName = row.PRODUCT_NAME || 'Unknown Product';
          const quantity = parseFloat(row.QUANTITY || 0);
          const revenue = quantity * parseFloat(row.PRICE || 0);
          
          if (!productStats[productId]) {
            productStats[productId] = {
              name: productName,
              totalQuantity: 0,
              totalRevenue: 0,
              invoiceCount: 0
            };
          }
          productStats[productId].totalQuantity += quantity;
          productStats[productId].totalRevenue += revenue;
          productStats[productId].invoiceCount++;
        }
      } else {
        // Log when invoices have no product data
        this.log('debug', \`Invoice \${invoice.ID} has no PRODUCT_ROWS data\`);
      }
    }
    
    // PATTERN: HTML report generation (REQUIRED)
    const reportHtml = this.buildReportHtml(productStats, startDate, endDate);
    const finalReport = await this.generateHTMLReport('Product Ranking Analysis', reportHtml);
    const attachment = await this.uploadReport(finalReport, \`product_ranking_\${Date.now()}.html\`);
    
    return {
      success: true,
      summary: \`Analyzed \${invoices?.length || 0} invoices and ranked products by performance.\`,
      attachments: [attachment]
    };
  }
}
\`\`\`

### PATTERN 2: Company Performance Request  
**Input:** "Generate company performance analysis for Q1"

**Output Pattern:**
\`\`\`javascript
// REQUIRED: Always use this exact structure for company analysis
class CompanyPerformanceExecutor extends BaseTaskExecutor {
  async execute() {
    // PATTERN: Quarter date extraction
    const { dateRange } = this.parameters;
    const startDate = dateRange?.start || '2024-01-01'; // Q1 start
    const endDate = dateRange?.end || '2024-03-31';   // Q1 end
    
    // PATTERN: Company list with CRITICAL response handling
    const companyResponse = await this.callAPI('crm.company.list', {
      select: ['ID', 'TITLE', 'COMPANY_TYPE', 'REVENUE'],
      filter: { 'ACTIVE': 'Y' }
    });
    
    // CRITICAL: Always extract .result from Bitrix24 API response
    const companies = companyResponse?.result || [];
    
    // PATTERN: Deal analysis per company with proper response handling
    const companyStats = {};
    for (const company of companies) {
      const dealResponse = await this.callAPI('crm.deal.list', {
        select: ['ID', 'OPPORTUNITY', 'STAGE_ID', 'DATE_CREATE'],
        filter: {
          'COMPANY_ID': company.ID,
          '>=DATE_CREATE': startDate,
          '<=DATE_CREATE': endDate
        }
      });
      
      // CRITICAL: Always extract .result from Bitrix24 API response
      const deals = dealResponse?.result || [];
      
      companyStats[company.ID] = {
        name: company.TITLE,
        dealCount: deals.length,
        totalOpportunity: deals.reduce((sum, deal) => sum + parseFloat(deal.OPPORTUNITY || 0), 0)
      };
    }
    
    // PATTERN: Performance ranking and HTML generation
    const rankedCompanies = Object.values(companyStats)
      .sort((a, b) => b.totalOpportunity - a.totalOpportunity);
    
    const reportHtml = this.buildCompanyReportHtml(rankedCompanies, startDate, endDate);
    const finalReport = await this.generateHTMLReport('Company Performance Q1', reportHtml);
    const attachment = await this.uploadReport(finalReport, \`company_performance_\${Date.now()}.html\`);
    
    return {
      success: true,
      summary: \`Analyzed \${companies?.length || 0} companies for Q1 performance.\`,
      attachments: [attachment]
    };
  }
}
\`\`\`

### PATTERN 3: Activity Timeline Request
**Input:** "Create activity timeline report for recent deals"

**Output Pattern:**
\`\`\`javascript
// REQUIRED: Always use this exact structure for activity timeline
class ActivityTimelineExecutor extends BaseTaskExecutor {
  async execute() {
    // PATTERN: Recent timeframe detection  
    const { dateRange } = this.parameters;
    const startDate = dateRange?.start || this.extractDateFromMessage('recent', -30); // 30 days ago
    const endDate = dateRange?.end || new Date().toISOString().split('T')[0];
    
    // PATTERN: Deal list with CRITICAL response handling
    const dealResponse = await this.callAPI('crm.deal.list', {
      select: ['ID', 'TITLE', 'STAGE_ID', 'DATE_CREATE'],
      filter: {
        '>=DATE_CREATE': startDate,
        '<=DATE_CREATE': endDate
      }
    });
    
    // CRITICAL: Always extract .result from Bitrix24 API response
    const deals = dealResponse?.result || [];
    
    // PATTERN: Activity enrichment for each deal with proper response handling
    const dealActivities = {};
    for (const deal of deals) {
      const activityResponse = await this.callAPI('crm.activity.list', {
        select: ['ID', 'SUBJECT', 'TYPE_ID', 'DATE_TIME', 'RESPONSIBLE_ID'],
        filter: {
          'OWNER_ID': deal.ID,
          'OWNER_TYPE_ID': '2' // Deals
        }
      });
      
      // CRITICAL: Always extract .result from Bitrix24 API response
      const activities = activityResponse?.result || [];
      
      dealActivities[deal.ID] = {
        dealTitle: deal.TITLE,
        stage: deal.STAGE_ID,
        activities: activities
      };
    }
    
    // PATTERN: Timeline HTML generation
    const timelineHtml = this.buildTimelineHtml(dealActivities, startDate, endDate);
    const finalReport = await this.generateHTMLReport('Activity Timeline Report', timelineHtml);
    const attachment = await this.uploadReport(finalReport, \`activity_timeline_\${Date.now()}.html\`);
    
    return {
      success: true,
      summary: \`Generated timeline for \${deals?.length || 0} recent deals.\`,
      attachments: [attachment]
    };
  }
}
\`\`\`

## 🚨 CRITICAL: Invoice Product/Line Item Terminology

**MANDATORY: When users ask about "products", "line items", "invoice items", "product rows", or "items" on invoices, they are referring to the PRODUCT_ROWS field in Bitrix24 invoices.**

### User Request → PRODUCT_ROWS Field Mapping

**User Says** → **Bitrix24 Field**
- "analyze products" → PRODUCT_ROWS array
- "invoice line items" → PRODUCT_ROWS array  
- "product rows" → PRODUCT_ROWS array
- "invoice items" → PRODUCT_ROWS array
- "items on invoices" → PRODUCT_ROWS array
- "products sold" → PRODUCT_ROWS array
- "what was purchased" → PRODUCT_ROWS array

### CRITICAL: How to Access Invoice Products

**MANDATORY 3-STEP PATTERN: crm.invoice.list does NOT return PRODUCT_ROWS. You must use crm.invoice.get for each invoice.**

\`\`\`javascript
// ✅ STEP 1: Get invoice IDs only (PRODUCT_ROWS not available in list)
const response = await this.callAPI('crm.invoice.list', {
  select: ['ID', 'ACCOUNT_NUMBER', 'DATE_INSERT'],
  filter: { 'PAYED': 'Y' }
});
const invoices = response?.result || [];

// ✅ STEP 2: Get detailed invoice data with PRODUCT_ROWS for each invoice
const allProducts = [];
for (const invoice of invoices) {
  await this.checkCancellation();
  
  // Get full invoice details including PRODUCT_ROWS
  const fullInvoice = await this.callAPI('crm.invoice.get', {
    id: invoice.ID
  });
  
  if (fullInvoice?.result?.PRODUCT_ROWS) {
    for (const product of fullInvoice.result.PRODUCT_ROWS) {
      const productData = {
        invoiceId: invoice.ID,
        invoiceNumber: invoice.ACCOUNT_NUMBER,
        productId: product.PRODUCT_ID,
        productName: product.PRODUCT_NAME,
        quantity: parseFloat(product.QUANTITY || 0),
        price: parseFloat(product.PRICE || 0)
      };
      
      // ✅ STEP 3: Get detailed product info if needed
      if (product.PRODUCT_ID && product.PRODUCT_ID !== '0') {
        const productDetails = await this.callAPI('crm.product.get', {
          id: product.PRODUCT_ID,
          select: ['NAME', 'DESCRIPTION', 'SECTION_ID']
        });
        if (productDetails?.result) {
          productData.productDescription = productDetails.result.DESCRIPTION;
          productData.productSection = productDetails.result.SECTION_ID;
        }
      }
      
      allProducts.push(productData);
    }
  }
}
\`\`\`

**❌ NEVER USE THESE NON-EXISTENT ENDPOINTS:**
- crm.invoice.productrows.get - DOES NOT EXIST
- crm.invoice.items.list - DOES NOT EXIST  
- crm.invoice.products.get - DOES NOT EXIST
- crm.invoice.lineitems.list - DOES NOT EXIST

## 🚨 CRITICAL: Bitrix24 API Response Structure

**MANDATORY: Every Bitrix24 API call returns a response object with .result property. You MUST extract .result to get the actual data.**

### Response Structure Pattern

\`\`\`javascript
// ❌ WRONG - This will cause "not iterable" errors
const invoices = await this.callAPI('crm.invoice.list', { ... });

// ✅ CORRECT - Always extract .result from response
const response = await this.callAPI('crm.invoice.list', { ... });
const invoices = response?.result || [];
\`\`\`

### Actual Response Structure
All Bitrix24 API calls return:
\`\`\`javascript
{
  "result": [ /* Your actual data array here */ ],
  "total": 3,
  "time": {
    "start": 1760076732,
    "finish": 1760076732.197236,
    "duration": 0.1972360610961914,
    "processing": 0,
    "date_start": "2025-10-10T09:12:12+03:00",
    "date_finish": "2025-10-10T09:12:12+03:00"
  }
}
\`\`\`

### Required Response Handling Pattern

\`\`\`javascript
// STEP 1: Call API and store full response (PRODUCT_ROWS not available in list)
const response = await this.callAPI('crm.invoice.list', {
  select: ['ID', 'ACCOUNT_NUMBER'],
  filter: { 'PAYED': 'Y' }
});

// STEP 2: Extract .result array (this is your actual data)
const invoices = response?.result || [];

// STEP 3: Log meaningful information including response structure
this.log('info', \`Found \${invoices.length} invoices\`, {
  responseStructure: { 
    hasResult: !!response?.result, 
    total: response?.total,
    actualCount: invoices.length
  }
});

// STEP 4: Safely iterate over extracted data
for (const invoice of invoices) {
  // Process each invoice...
}
\`\`\`

### Common Response Handling Errors to Avoid

**❌ ERROR 1: Using response object directly**
\`\`\`javascript
const invoices = await this.callAPI('crm.invoice.list', { ... });
for (const invoice of invoices) { // CRASHES: "invoices is not iterable"
\`\`\`

**❌ ERROR 2: Assuming data structure**
\`\`\`javascript
const invoices = response.result; // CRASHES: if response is undefined
\`\`\`

**❌ ERROR 3: Wrong array checks**
\`\`\`javascript
if (!invoices || invoices.length === 0) { // WRONG: invoices is object, not array
\`\`\`

**✅ CORRECT: Proper response handling**
\`\`\`javascript
const response = await this.callAPI('crm.invoice.list', { ... });
const invoices = response?.result || [];
if (!Array.isArray(invoices) || invoices.length === 0) {
  // Handle no data case
}
\`\`\`

## 🔧 REQUIRED API PATTERNS

**CRITICAL: Every template MUST follow these exact patterns. Deviation will cause failures.**

### API Call Pattern (MANDATORY)
\`\`\`javascript
// REQUIRED: Always use this.callAPI() with proper error handling
const result = await this.callAPI('endpoint.method', {
  select: ['required', 'fields'],
  filter: { /* proper filters */ }
});

// REQUIRED: Always validate results
if (!result || result.length === 0) {
  this.log('warn', 'No data found for criteria');
  // Continue with empty data handling
}
\`\`\`

### Logging Pattern (MANDATORY)
\`\`\`javascript
// REQUIRED: Always log counts using array length, never the variable itself
this.log('info', \`Found \${invoices?.length || 0} invoices\`); // ✅ CORRECT
this.log('info', \`Found \${invoices} invoices\`);              // ❌ WRONG - shows "undefined"
\`\`\`

### HTML Report Pattern (MANDATORY)
\`\`\`javascript
// REQUIRED: Always follow this exact sequence
const reportHtml = this.buildReportHtml(data, startDate, endDate);
const finalReport = await this.generateHTMLReport('Title', reportHtml);

// CRITICAL: uploadReport parameter order is (htmlContent, fileName, metadata)
const attachment = await this.uploadReport(
  finalReport,                    // HTML content FIRST
  \`filename_\${Date.now()}.html\`, // Filename SECOND  
  { taskId: this.taskId }         // Metadata THIRD (optional)
);

// REQUIRED: Always return attachments array with Google Cloud Storage links
return {
  success: true,
  summary: 'Description of results',
  attachments: [attachment]  // CRITICAL: Contains publicUrl for download link
};

// WRONG: Swapped parameters (common error causing file upload failures)
// const attachment = await this.uploadReport('filename.html', finalReport); // ❌ WRONG ORDER

// CRITICAL: Check upload success and trigger auto-repair for failures
const attachment = await this.uploadReport(finalReport, \`filename_\${Date.now()}.html\`);

// Auto-repair trigger pattern for upload failures
if (attachment.storage === 'inline_truncated' || attachment.storage === 'inline') {
  this.log('error', 'File upload failed, attachment fallback used', {
    storage: attachment.storage,
    hasNote: !!attachment.note
  });
  
  // Trigger auto-repair by throwing error in testing mode
  if (this.isTestingMode()) {
    throw new Error(\`File upload failed: \${attachment.note || 'Upload service unavailable'}\`);
  }
}

// The uploadReport() method returns:
// {
//   name: 'filename.html',
//   publicUrl: 'https://storage.googleapis.com/bucket/file.html',  // Download link
//   storage: 'cloud_storage',
//   size: 12345
// }
\`\`\`

## ⚠️ CRITICAL: API Endpoint Restrictions (Anti-Hallucination Grounding)

**YOU MUST ONLY USE ENDPOINTS EXPLICITLY DOCUMENTED IN THIS GUIDE. YOUR KNOWLEDGE IS CONFINED TO THIS DATA.**

**Step-by-Step Endpoint Validation Process:**
1. **STOP**: Before using ANY endpoint, search this document for exact match
2. **VERIFY**: Confirm the endpoint exists in the documented list below  
3. **USE**: Only proceed if found in documentation
4. **NEVER**: Invent, assume, or hallucinate endpoint names

**Allowed Endpoints (EXACTLY 18 - NO MORE):**
- ✅ crm.invoice.list
- ✅ crm.invoice.get  
- ✅ crm.invoice.add
- ✅ crm.invoice.update
- ✅ crm.invoice.delete
- ✅ crm.company.list
- ✅ crm.company.get
- ✅ crm.contact.list
- ✅ crm.contact.get
- ✅ crm.deal.list
- ✅ crm.deal.get
- ✅ crm.activity.list
- ✅ crm.activity.get
- ✅ crm.product.list
- ✅ crm.product.get
- ✅ crm.product.fields
- ✅ crm.product.add
- ✅ crm.product.update
- ✅ user.get
- ✅ im.message.add
- ✅ imbot.message.add
- ✅ imbot.message.delete
- ✅ imbot.chat.sendTyping
- ✅ im.dialog.messages.get
- ✅ im.dialog.get
- ✅ im.chat.get
- ✅ im.chat.user.list
- ✅ im.dialog.users.list

**Forbidden Actions (WILL CAUSE 404 ERRORS):**
- ❌ Do NOT use non-existent endpoints like crm.invoice.productrows.get, crm.invoice.items.list, etc.
- ❌ Do NOT combine or modify endpoint names - use exactly as documented
- ❌ Do NOT assume endpoints exist based on other CRM entities
- ❌ Do NOT invent new methods or variations

**If you need product/line item data from invoices:**
- STEP 1: Use \`crm.invoice.list\` to get invoice IDs (PRODUCT_ROWS not available)
- STEP 2: Use \`crm.invoice.get\` for each invoice to get PRODUCT_ROWS data
- STEP 3: Use \`crm.product.get\` if you need detailed product information
- Do NOT call non-existent product-specific endpoints like \`crm.invoice.productrows.get\`
- Do NOT call non-existent endpoints like \`crm.invoice.items.list\` or \`crm.invoice.products.get\`

**CRITICAL: crm.invoice.get returns PRODUCT_ROWS by default (no select parameter needed):**

\`\`\`javascript
// ✅ CORRECT: Get all invoice fields including PRODUCT_ROWS
const invoiceDetails = await this.callAPI('crm.invoice.get', {
  id: invoiceId
  // No select parameter needed - PRODUCT_ROWS included by default
});

// Access product data from response
if (invoiceDetails?.result?.PRODUCT_ROWS && Array.isArray(invoiceDetails.result.PRODUCT_ROWS)) {
  for (const row of invoiceDetails.result.PRODUCT_ROWS) {
    const productName = row.PRODUCT_NAME || 'Unknown Product';
    const productId = row.PRODUCT_ID || null;
    const quantity = parseFloat(row.QUANTITY || 0);
    // Process product data...
  }
}

// ✅ ALSO CORRECT: Explicitly select fields if needed
const invoiceDetails = await this.callAPI('crm.invoice.get', {
  id: invoiceId,
  select: ['ID', 'DATE_INSERT', 'PRODUCT_ROWS'] // Optional select
});
\`\`\`

## PRODUCT_ROWS Response Schema

**Complete PRODUCT_ROWS structure returned by crm.invoice.get:**

\`\`\`javascript
// Example PRODUCT_ROWS array from actual Bitrix24 API response:
"PRODUCT_ROWS": [
  {
    "ID": "12345",
    "OWNER_ID": "6789",
    "OWNER_TYPE": "D",
    "PRODUCT_ID": "987",
    "PRODUCT_NAME": "Product Name Here",
    "ORIGINAL_PRODUCT_NAME": "Product Name Here", 
    "PRODUCT_DESCRIPTION": "",
    "PRICE": "100.00",
    "PRICE_EXCLUSIVE": "100.00",
    "PRICE_NETTO": "100.00", 
    "PRICE_BRUTTO": "100.00",
    "QUANTITY": "2",
    "DISCOUNT_TYPE_ID": "2",
    "DISCOUNT_RATE": "0",
    "DISCOUNT_SUM": "0",
    "TAX_RATE": "0.00",
    "TAX_INCLUDED": "N",
    "CUSTOMIZED": "Y",
    "MEASURE_CODE": "796",
    "MEASURE_NAME": "Piece",
    "SORT": "10"
  }
]

// Key fields for analysis:
// - PRODUCT_ID: Use for crm.product.get lookups  
// - PRODUCT_NAME: Display name for reports
// - PRICE: Unit price (use PRICE_EXCLUSIVE for tax-exclusive)
// - QUANTITY: Number of units
// - DISCOUNT_RATE/DISCOUNT_SUM: Discount information
// - TAX_RATE: Tax percentage (0.00 = no tax)
// - TAX_INCLUDED: "Y" or "N" 
\`\`\`

## crm.product.get Endpoint

**Use crm.product.get for additional product details:**

\`\`\`javascript
// Get detailed product information using PRODUCT_ID from PRODUCT_ROWS
const productDetails = await this.callAPI('crm.product.get', {
  id: row.PRODUCT_ID,
  select: ['ID', 'NAME', 'DESCRIPTION', 'PRICE', 'CURRENCY_ID', 'SECTION_ID', 'ACTIVE']
});

// Product response structure:
// {
//   "ID": "987",
//   "NAME": "Product Name",
//   "DESCRIPTION": "Product description text",
//   "PRICE": "100.00", 
//   "CURRENCY_ID": "USD",
//   "SECTION_ID": "123", // Product catalog section
//   "ACTIVE": "Y"
// }

// Example: Enrich product data from invoice
for (const row of invoiceDetails.PRODUCT_ROWS) {
  // Get additional product details if needed
  const productInfo = await this.callAPI('crm.product.get', {
    id: row.PRODUCT_ID,
    select: ['NAME', 'DESCRIPTION', 'SECTION_ID']
  });
  
  const enrichedProduct = {
    id: row.PRODUCT_ID,
    name: row.PRODUCT_NAME,
    description: productInfo?.DESCRIPTION || '',
    quantity: parseFloat(row.QUANTITY),
    unitPrice: parseFloat(row.PRICE),
    totalPrice: parseFloat(row.QUANTITY) * parseFloat(row.PRICE),
    sectionId: productInfo?.SECTION_ID,
    hasDiscount: parseFloat(row.DISCOUNT_RATE || 0) > 0
  };
  
  // Process enriched product data...
}
\`\`\`

## crm.product.list Endpoint

**⚠️ DEPRECATED: This endpoint is marked as outdated. Bitrix24 recommends using catalog.product.* methods instead. However, it remains functional for legacy integrations.**

**Use crm.product.list to retrieve products with filtering:**

\`\`\`javascript
// List all products with pagination
const productsResponse = await this.callAPI('crm.product.list', {
  filter: {
    CATALOG_ID: 123, // Filter by catalog ID
    ACTIVE: 'Y'      // Only active products
  },
  select: ['ID', 'NAME', 'PRICE', 'CURRENCY_ID', 'DESCRIPTION', 'ACTIVE'],
  start: 0           // Pagination offset (0 = first page)
});

// IMPORTANT: Extract .result to get data
const products = productsResponse?.result || [];

// Process products
for (const product of products) {
  this.log('info', 'Product found', {
    id: product.ID,
    name: product.NAME,
    price: product.PRICE,
    currency: product.CURRENCY_ID
  });
}

// Pagination: Handle multiple pages (50 records per page)
let allProducts = [];
let start = 0;
let hasMore = true;

while (hasMore) {
  const response = await this.callAPI('crm.product.list', {
    filter: { CATALOG_ID: 123 },
    select: ['ID', 'NAME', 'PRICE'],
    start: start
  });

  const products = response?.result || [];
  allProducts = allProducts.concat(products);

  // Check if more records exist
  hasMore = products.length === 50; // 50 = page size
  start += 50;
}
\`\`\`

## crm.product.fields Endpoint

**⚠️ DEPRECATED: This endpoint is marked as outdated. However, it remains functional for determining product field requirements.**

**Use crm.product.fields to get field definitions and determine required fields:**

\`\`\`javascript
// Get all product field definitions
const fieldsResponse = await this.callAPI('crm.product.fields', {});

// Extract field definitions
const fields = fieldsResponse?.result || {};

this.log('info', 'Product fields retrieved', {
  fieldCount: Object.keys(fields).length
});

// Example: Check which fields are required
const requiredFields = [];
for (const [fieldName, fieldDef] of Object.entries(fields)) {
  if (fieldDef.isRequired) {
    requiredFields.push({
      name: fieldName,
      type: fieldDef.type,
      title: fieldDef.title
    });
  }
}

// Use this information before calling crm.product.add
this.log('info', 'Required fields for product creation', {
  fields: requiredFields
});
\`\`\`

## crm.product.add Endpoint

**⚠️ DEPRECATED: This endpoint is marked as outdated. Bitrix24 recommends using catalog.product.add instead. However, it remains functional for legacy integrations.**

**Use crm.product.add to create new products:**

\`\`\`javascript
// STEP 1: Get field definitions to understand requirements (recommended)
const fieldsResponse = await this.callAPI('crm.product.fields', {});
const fields = fieldsResponse?.result || {};

// STEP 2: Create new product
const newProductResponse = await this.callAPI('crm.product.add', {
  fields: {
    NAME: 'New Product Name',
    PRICE: 99.99,
    CURRENCY_ID: 'USD',
    DESCRIPTION: 'Product description',
    ACTIVE: 'Y',
    CATALOG_ID: 123,           // Catalog/section ID
    SECTION_ID: 456,           // Optional: product section
    VAT_ID: 1,                 // Optional: VAT/tax rate ID
    VAT_INCLUDED: 'Y',         // Optional: tax included flag
    MEASURE: 5,                // Optional: unit of measure
    DETAIL_PICTURE: null       // Optional: product image
  }
});

// Extract new product ID
const newProductId = newProductResponse?.result;

if (newProductId) {
  this.log('info', 'Product created successfully', {
    productId: newProductId
  });

  return {
    success: true,
    productId: newProductId,
    message: 'Product created successfully'
  };
} else {
  throw new Error('Failed to create product - no ID returned');
}
\`\`\`

**Common product creation patterns:**

\`\`\`javascript
// Pattern 1: Simple product with minimal fields
const simpleProduct = await this.callAPI('crm.product.add', {
  fields: {
    NAME: 'Basic Product',
    PRICE: 49.99,
    CURRENCY_ID: 'USD'
  }
});

// Pattern 2: Product with full details
const detailedProduct = await this.callAPI('crm.product.add', {
  fields: {
    NAME: 'Premium Product',
    DESCRIPTION: 'Detailed product description with features',
    PRICE: 199.99,
    CURRENCY_ID: 'USD',
    ACTIVE: 'Y',
    CATALOG_ID: 123,
    SECTION_ID: 456,
    VAT_ID: 1,
    VAT_INCLUDED: 'Y',
    MEASURE: 5
  }
});
\`\`\`

## crm.product.update Endpoint

**⚠️ DEPRECATED: This endpoint is marked as outdated. Bitrix24 recommends using catalog.product.update instead. However, it remains functional for legacy integrations.**

**Use crm.product.update to modify existing products:**

\`\`\`javascript
// Update existing product
const updateResponse = await this.callAPI('crm.product.update', {
  id: '987',  // REQUIRED: Product ID to update
  fields: {
    NAME: 'Updated Product Name',
    PRICE: 129.99,
    DESCRIPTION: 'Updated description',
    ACTIVE: 'N'  // Deactivate product
  }
});

// Check if update succeeded
const updateSuccess = updateResponse?.result === true;

if (updateSuccess) {
  this.log('info', 'Product updated successfully', {
    productId: '987'
  });
} else {
  throw new Error('Failed to update product');
}
\`\`\`

**Common update patterns:**

\`\`\`javascript
// Pattern 1: Update price only
const priceUpdate = await this.callAPI('crm.product.update', {
  id: productId,
  fields: {
    PRICE: 149.99,
    CURRENCY_ID: 'USD'
  }
});

// Pattern 2: Deactivate product
const deactivate = await this.callAPI('crm.product.update', {
  id: productId,
  fields: {
    ACTIVE: 'N'
  }
});

// Pattern 3: Update multiple fields
const fullUpdate = await this.callAPI('crm.product.update', {
  id: productId,
  fields: {
    NAME: 'Renamed Product',
    DESCRIPTION: 'New description',
    PRICE: 99.99,
    SECTION_ID: 789,
    ACTIVE: 'Y'
  }
});

// Pattern 4: Bulk update multiple products
const productsToUpdate = ['123', '456', '789'];

for (const productId of productsToUpdate) {
  await this.callAPI('crm.product.update', {
    id: productId,
    fields: {
      PRICE: 199.99,
      CURRENCY_ID: 'USD'
    }
  });
}
\`\`\`

**Common Hallucinated Endpoints (DO NOT USE):**
- ❌ \`crm.invoice.productrows.get\` - DOES NOT EXIST
- ❌ \`crm.invoice.items.list\` - DOES NOT EXIST
- ❌ \`crm.invoice.products.get\` - DOES NOT EXIST
- ❌ \`crm.invoice.lineitems.list\` - DOES NOT EXIST

## HTML Report Generation Requirements

**CRITICAL: All templates MUST generate HTML reports and file attachments**

\`\`\`javascript
// CORRECT: Complete HTML report generation workflow
async execute() {
  try {
    // ... your business logic here ...

    await this.updateProgress(90, 'Generating HTML report...');

    // Step 1: Generate HTML content (required method)
    const reportContent = this.buildReportHtml(data, startDate, endDate);
    
    // Step 2: Call generateHTMLReport (mandatory method)
    const finalReportHtml = await this.generateHTMLReport(
      \`Report Title\`,
      reportContent
    );

    // Step 3: Upload and get file link (mandatory for attachments)
    const reportFileName = \`report_\${Date.now()}.html\`;
    const attachment = await this.uploadReport(finalReportHtml, reportFileName, {
      taskId: this.taskId,
      templateId: this.template?.templateId
    });

    // Log the attachment info for debugging
    this.log('info', 'Report attachment created', {
      fileName: attachment.fileName || attachment.name,
      storage: attachment.storage,
      hasPublicUrl: !!attachment.publicUrl
    });

    await this.updateProgress(100, 'Task complete. Report generated.');

    // Step 4: Return result with Google Cloud Storage download links
    return {
      success: true,
      summary: \`Successfully processed data. Report generated.\`,
      attachments: [attachment], // Critical: Contains publicUrl for download
      htmlReport: finalReportHtml
    };
    
    // attachment object structure:
    // {
    //   name: 'report.html',
    //   publicUrl: 'https://storage.googleapis.com/bucket/report.html',
    //   storage: 'cloud_storage',
    //   size: 12345
    // }

  } catch (error) {
    await this.handleError(error);
    throw error;
  }
}

// WRONG: Missing generateHTMLReport call and attachments
async execute() {
  // ... business logic ...
  
  // Missing generateHTMLReport call
  // Missing uploadReport call
  // Missing attachments in return
  
  return \`Report completed\`; // String return won't create attachments
}
\`\`\`

## Invoice Count Debugging

**CRITICAL: Always log invoice counts and results for debugging:**

\`\`\`javascript
// CORRECT: Proper invoice count handling and logging
const invoices = await this.callAPI('crm.invoice.list', {
  select: ['ID', 'ACCOUNT_NUMBER', 'DATE_INSERT'],
  filter: dateFilter
});

// Always log the actual count
this.log('info', 'Invoice query completed', {
  totalInvoices: invoices?.length || 0,
  hasResults: !!invoices && invoices.length > 0,
  filterUsed: JSON.stringify(dateFilter)
});

// Check for results before processing
if (!invoices || invoices.length === 0) {
  this.log('warn', 'No invoices found matching criteria', {
    dateFilter,
    suggestion: 'Check date range or filter criteria'
  });
  
  // Still generate report but indicate no data
  const noDataHtml = this.buildNoDataReport(dateFilter);
  const finalReport = await this.generateHTMLReport('Invoice Analysis - No Data', noDataHtml);
  const attachment = await this.uploadReport(finalReport, 'no_invoices_report.html');
  
  return {
    success: true,
    summary: \`No invoices found for the specified criteria.\`,
    attachments: [attachment],
    dataFound: false
  };
}

// WRONG: Don't use string interpolation that shows "undefined"
this.log('info', \`Found \${invoices} invoices\`); // Will show "Found undefined invoices"

// CORRECT: Proper count extraction
this.log('info', \`Found \${invoices?.length || 0} invoices\`); // Shows actual count

// CRITICAL: Always validate PRODUCT_ROWS data and log findings
let totalProductRows = 0;
for (const invoice of invoices) {
  if (invoice.PRODUCT_ROWS && Array.isArray(invoice.PRODUCT_ROWS)) {
    totalProductRows += invoice.PRODUCT_ROWS.length;
  }
}

this.log('info', \`Found \${totalProductRows} total product line items across \${invoices.length} invoices\`, {
  hasProductData: totalProductRows > 0,
  invoicesWithProducts: invoices.filter(i => i.PRODUCT_ROWS?.length > 0).length
});

// If no product data found, check if PRODUCT_ROWS was properly requested
if (totalProductRows === 0) {
  this.log('warn', 'No PRODUCT_ROWS found in invoices. Check if select parameter includes PRODUCT_ROWS', {
    sampleInvoice: invoices[0] ? Object.keys(invoices[0]) : 'No invoices'
  });
}
\`\`\`

// COMMON ERROR: Wrong parameter order in uploadReport
async execute() {
  // ... business logic ...
  
  const reportFileName = \`report_\${Date.now()}.html\`;
  const finalReportHtml = await this.generateHTMLReport('Title', content);
  
  // WRONG: Parameters in wrong order (fileName, htmlContent instead of htmlContent, fileName)
  const reportUrl = await this.uploadReport(reportFileName, finalReportHtml);
  
  // WRONG: Returning string instead of object with attachments
  return \`Report available at: \${reportUrl}\`;
}

// CORRECT: Proper parameter order and return structure
async execute() {
  // ... business logic ...
  
  const reportFileName = \`report_\${Date.now()}.html\`;
  const finalReportHtml = await this.generateHTMLReport('Title', content);
  
  // CORRECT: uploadReport(htmlContent, fileName, metadata)
  const attachment = await this.uploadReport(finalReportHtml, reportFileName, {
    taskId: this.taskId,
    templateId: this.template?.templateId
  });
  
  // CORRECT: Return object with attachments array
  return {
    success: true,
    summary: \`Report generated successfully\`,
    attachments: [attachment],
    htmlReport: finalReportHtml
  };
}
\`\`\`

**HTML Report Upload Process:**
1. \`this.generateHTMLReport(title, content)\` - Formats HTML with Chantilly styling
2. \`this.uploadReport(html, filename, metadata)\` - Uploads to Cloud Storage and returns attachment info
3. Return object with \`attachments\` array containing file info
4. Worker will detect \`hasAttachments: true\` and include download links in notifications

## Cloud Tasks Integration Requirements

**CRITICAL: All task execution must include proper user context for retry mechanisms**

\`\`\`javascript
// CORRECT: Task creation with user ID properly stored
const taskData = {
  taskId,
  templateId,
  templateVersion: template.version,
  type: template.category,
  status: 'pending',
  priority: options.priority || 50,
  definition: {
    ...template.definition,
    parameters,
    executionScript: template.executionScript
  },
  createdBy: userId, // CRITICAL: Store user ID for retry mechanisms
  userId: userId,    // Additional field for Cloud Tasks payload
  userMessage: options.userMessage,
  messageContext: options.messageContext
};

// CORRECT: Cloud Tasks payload with userId field
const cloudTaskName = await this.cloudTasksQueue.enqueueTask({
  taskId: actualTaskId,
  templateId,
  parameters: parameters,
  userId: userId, // CRITICAL: Include userId in Cloud Tasks payload
  priority: options.priority || template.priority || 50
});

// WRONG: Missing userId in task data or Cloud Tasks payload
const taskData = {
  taskId,
  templateId,
  // Missing createdBy and userId fields
};

const cloudTaskName = await this.cloudTasksQueue.enqueueTask({
  taskId: actualTaskId,
  templateId,
  parameters: parameters,
  // Missing userId field - will cause retry failures
});
\`\`\`

**Retry Task Requirements:**
- Original task must have \`createdBy\` field with user ID
- Retry tasks must inherit \`userId\` from original task's \`createdBy\` field
- Cloud Tasks payload must always include \`userId\` field
- Missing \`userId\` will cause "Missing required fields" errors in worker

## Template Generation Rules (Anti-Hallucination Protocol)

**REASONING TEMPERATURE: 0.2** - Use precise, deterministic code generation for API endpoints.

**Chain-of-Thought Validation Process:**

**Step 1: Endpoint Verification**
- Search this document for the EXACT endpoint name
- Count: Does it appear in the 17 allowed endpoints list?
- If NO → STOP and use documented alternative
- If YES → Proceed to Step 2

**Step 2: Parameter Validation**  
- Check documented parameter examples
- Use ONLY parameters shown in examples
- Do NOT invent new parameter names

**Step 3: Code Generation**
- Copy exact patterns from documented examples
- Replace only data values, not structure
- Maintain exact \`context.queueService.add()\` format

**Template Repair Protocol:**
1. **Identify**: Locate the failing API call
2. **Validate**: Check if endpoint exists in allowed list
3. **Replace**: If not found, substitute with documented equivalent:
   - \`crm.invoice.productrows.get\` → \`crm.invoice.get\` with \`PRODUCT_ROWS\`
   - \`crm.invoice.items.list\` → \`crm.invoice.get\` with \`select: ['*']\`
4. **Test**: Verify against documented examples

**Confidence Verification:**
- If you cannot find an exact endpoint match in this document, YOU MUST NOT USE IT
- When in doubt, use \`crm.invoice.get\` for invoice data retrieval
- This document contains your complete allowed knowledge - nothing exists outside it

## Core Architecture

### Queue Service Integration (\`services/queue.js\`)

The queue service handles all outbound Bitrix24 API calls with:
- **Rate limiting**: Respects Bitrix24 limits (2 req/sec, 10K/10min)
- **Authentication**: Uses bot tokens from webhook data (auto-refreshed)
- **Error handling**: Automatic retries and cooldown management
- **Request throttling**: FIFO processing with concurrency control

### Standard Usage Pattern in Complex Tasks

\`\`\`javascript
// Standard pattern for any Bitrix24 API call in task templates
const result = await context.queueService.add({
  method: 'api.method.name',
  params: {
    // API-specific parameters
  }
});
\`\`\`

## Bitrix24 API Reference

### CRM - Invoices (Financial Data)

\`\`\`javascript
// List invoices with advanced filtering
await context.queueService.add({
  method: 'crm.invoice.list',
  params: {
    filter: {
      'STATUS_ID': ['N', 'S'],           // N=New, S=Sent, P=Paid, D=Draft
      '>=DATE_INSERT': '2025-01-01',
      '<=DATE_INSERT': '2025-12-31',
      'UF_COMPANY_ID': companyId         // Filter by company
    },
    select: [
      'ID', 'INVOICE_ID', 'STATUS_ID', 'PRICE', 'CURRENCY', 
      'DATE_CREATE', 'DATE_INSERT', 'DATE_UPDATE',
      'UF_COMPANY_ID', 'UF_CONTACT_ID', 'TITLE', 'COMMENTS'
    ],
    order: { 'DATE_INSERT': 'DESC' },
    start: 0,
    limit: 50
  }
});

// Get specific invoice with all details INCLUDING PRODUCT ROWS
await context.queueService.add({
  method: 'crm.invoice.get',
  params: { 
    id: invoiceId,
    select: ['*', 'PRODUCT_ROWS']  // Include product line items
  }
});

// IMPORTANT: Invoice product rows are included in crm.invoice.get response
// The PRODUCT_ROWS field contains an array of line items with:
// - PRODUCT_ID: Product identifier
// - PRODUCT_NAME: Product/service name  
// - QUANTITY: Quantity ordered
// - PRICE: Unit price
// - TOTAL: Line total (QUANTITY * PRICE)
// 
// Example invoice with product rows:
// {
//   "ID": "17724",
//   "PRODUCT_ROWS": [
//     {
//       "ID": "1",
//       "PRODUCT_ID": "123",
//       "PRODUCT_NAME": "Consulting Services",
//       "QUANTITY": "40",
//       "PRICE": "150.00",
//       "TOTAL": "6000.00"
//     }
//   ]
// }
//
// DO NOT USE: crm.invoice.productrows.get - This method does not exist!
// ALWAYS USE: crm.invoice.get with PRODUCT_ROWS in select fields

// Update invoice status and comments
await context.queueService.add({
  method: 'crm.invoice.update',
  params: {
    id: invoiceId,
    fields: {
      STATUS_ID: 'P',              // Mark as paid
      COMMENTS: 'Payment received via wire transfer',
      PAY_VOUCHER_NUM: 'PMT-2025-001'
    }
  }
});

// Create new invoice
await context.queueService.add({
  method: 'crm.invoice.add',
  params: {
    fields: {
      ORDER_TOPIC: 'Professional Services Invoice',
      STATUS_ID: 'N',
      UF_COMPANY_ID: companyId,
      UF_CONTACT_ID: contactId,
      PRICE: 2500.00,
      CURRENCY: 'USD'
    }
  }
});
\`\`\`

### Complete Bitrix24 CRM Invoice API Reference

NOTE: These methods are marked as deprecated in Bitrix24 documentation, but they are still functional and widely used.
For new implementations, consider using universal invoice methods when available.

#### 🚨 CRITICAL: Invoice Creation Requirements (crm.invoice.add)

MANDATORY Fields (will cause 400 error if missing):

1. Invoice Identification:
   - ACCOUNT_NUMBER (string) - Invoice number
   - ORDER_TOPIC (string) - Invoice subject/title (appears as "Subject" in error messages)

2. Payment Configuration:
   - PAY_SYSTEM_ID (integer) - Payment system identifier (2 for Company, 4 for Contact)
   - PERSON_TYPE_ID (integer) - Payer type ID (2 for Company, 4 for Contact)
   - **CRITICAL**: BOTH fields must match the customer entity type (production-verified)

3. Seller and Buyer (CRITICAL - per official docs):
   - UF_MYCOMPANY_ID (integer) - Seller company ID (REQUIRED - use 2 for this instance)
   - UF_COMPANY_ID (integer) - Buyer company ID (if buyer is a company)
   - UF_CONTACT_ID (integer) - Buyer contact ID (if buyer is a contact)
   - NOTE: Must have UF_MYCOMPANY_ID=2 AND (UF_COMPANY_ID OR UF_CONTACT_ID)

   HOW TO DETERMINE BUYER ID:
   a) If you have a customer ID, first try to look it up as a company:
      const company = await this.callAPI('crm.company.get', { id: customerId });
      If successful, use: UF_COMPANY_ID: customerId

   b) If company lookup fails (404/400), try as a contact:
      const contact = await this.callAPI('crm.contact.get', { id: customerId });
      If successful, use: UF_CONTACT_ID: customerId

   c) If both fail, customer ID is invalid - cannot create invoice

4. Product Line Items:
   - PRODUCT_ROWS (array) - Must contain at least one product/service item
   - Error if missing: "There are no product items on the invoice"

Account-Specific Required Fields (your-domain.bitrix24.com instance):

Based on crm.invoice.fields API response, these fields are MANDATORY for this instance:

**Core Required Fields:**
- ACCOUNT_NUMBER (string) - Invoice number
- ORDER_TOPIC (string) - Subject/title
- PAY_SYSTEM_ID (integer) - Payment system ID (displays as "Invoice print form" in errors)
- PERSON_TYPE_ID (integer) - Payer type
- STATUS_ID (string, size 1) - Invoice status (e.g., 'N' for new, 'P' for paid)

**Date Fields (all required):**
- DATE_BILL (date) - Invoice date
- DATE_INSERT (datetime) - Created on
- DATE_MARKED (datetime) - Status comment date
- DATE_PAY_BEFORE (date) - Payment due date
- PAY_VOUCHER_DATE (date) - Payment date

**Payment & Tracking:**
- PAY_VOUCHER_NUM (string, size 20) - Payment reference number
- REASON_MARKED (string) - Status comment
- RESPONSIBLE_ID (integer) - Responsible person ID

**CRM Relations (all required):**
- UF_MYCOMPANY_ID (integer) - Seller company (use 2 for this instance)
- UF_COMPANY_ID (integer) - Buyer company ID (if company)
- UF_CONTACT_ID (integer) - Buyer contact ID (if contact)
- UF_DEAL_ID (integer) - Related deal ID
- UF_QUOTE_ID (integer) - Related quote ID

**Location & Description:**
- PR_LOCATION (integer) - Location ID (**This is the "Location" field in errors**)
- USER_DESCRIPTION (string, size 2000) - Comment/description

**Product Data:**
- PRODUCT_ROWS (array) - Invoice line items (at least 1 required)
- INVOICE_PROPERTIES (array) - Invoice properties

Common Errors and Solutions:

Error: "There are no product items on the invoice"
Solution: Add at least one item to PRODUCT_ROWS array

Error: "The field 'Subject' is required"
Solution: Set ORDER_TOPIC field

Error: "The field 'Location' is required"
Solution: Set PR_LOCATION field to an integer value (location ID)
- Field name: PR_LOCATION
- Type: integer
- Get valid location IDs from your Bitrix24 instance

Error: "The field 'Invoice print form' is required"
Solution: Set PAY_SYSTEM_ID field to an integer value (payment system ID)
- Field name: PAY_SYSTEM_ID
- Type: integer
- **VALUE DEPENDS ON CUSTOMER TYPE** (see critical section below)

Error: "Payment system was not found"
Solution: Ensure PERSON_TYPE_ID and PAY_SYSTEM_ID match the customer entity type
- This error occurs when values don't match customer type (company vs contact)
- See production-verified values in the critical section below

### 🔥 CRITICAL: PERSON_TYPE_ID and PAY_SYSTEM_ID Requirements (PRODUCTION-VERIFIED)

**MANDATORY: These two fields MUST match the customer entity type or invoice creation will fail with "Payment system was not found" error.**

**Production-Verified Values from Invoices #17878 (company) and #17870 (contact):**

**For COMPANY customers** (when UF_COMPANY_ID is set):
- \`PERSON_TYPE_ID: 2\`
- \`PAY_SYSTEM_ID: 2\`
- \`UF_COMPANY_ID\`: Set to company ID
- \`UF_CONTACT_ID: 0\`

**For CONTACT customers** (when UF_CONTACT_ID is set):
- \`PERSON_TYPE_ID: 4\`
- \`PAY_SYSTEM_ID: 4\`
- \`UF_COMPANY_ID: 0\`
- \`UF_CONTACT_ID\`: Set to contact ID

**Correct Implementation Pattern:**

\\\`\\\`\\\`javascript
// Determine customer type and set matching values
const isCompany = customerInfo.companyId && customerInfo.companyId !== '0';
const personTypeId = isCompany ? 2 : 4;
const paySystemId = isCompany ? 2 : 4;

const invoiceFields = {
  PERSON_TYPE_ID: personTypeId,
  PAY_SYSTEM_ID: paySystemId,
  UF_COMPANY_ID: isCompany ? customerInfo.companyId : 0,
  UF_CONTACT_ID: isCompany ? 0 : customerInfo.contactId,
  CURRENCY: 'USD',
  // ... other fields
};
\\\`\\\`\\\`

**Common Mistakes That Cause "Payment system was not found" Error:**

\\\`\\\`\\\`javascript
// ❌ WRONG #1: Inverted logic (checks contactId instead of companyId)
const personTypeId = customerInfo.contactId ? 2 : 3;
// This assigns company values when contact exists, causing error

// ❌ WRONG #2: Wrong person type value for contacts
const personTypeId = customerInfo.companyId ? 2 : 3;
// Should be 4 for contacts, not 3

// ❌ WRONG #3: Hardcoded PAY_SYSTEM_ID without matching PERSON_TYPE_ID
const paySystemId = 2; // Always 2
const personTypeId = customerInfo.companyId ? 2 : 4;
// PAY_SYSTEM_ID must match (both 2 or both 4)

// ❌ WRONG #4: Hardcoded values without checking customer type
const invoiceFields = {
  PERSON_TYPE_ID: 2,
  PAY_SYSTEM_ID: 2,
  // ... will fail if customer is a contact
};
\\\`\\\`\\\`

**Production Evidence:**

Company Invoice #17878:
\\\`\\\`\\\`json
{
  "PERSON_TYPE_ID": "2",
  "PAY_SYSTEM_ID": "2",
  "UF_COMPANY_ID": "354",
  "UF_CONTACT_ID": "0",
  "CURRENCY": "USD"
}
\\\`\\\`\\\`

Contact Invoice #17870:
\\\`\\\`\\\`json
{
  "PERSON_TYPE_ID": "4",
  "PAY_SYSTEM_ID": "4",
  "UF_COMPANY_ID": "0",
  "UF_CONTACT_ID": "75806",
  "CURRENCY": "USD"
}
\\\`\\\`\\\`

**Why This Matters:**
- Incorrect values cause "Payment system was not found" error
- Invoice creation fails completely
- Template auto-repair may loop without this knowledge
- BOTH fields must be set correctly based on customer entity type

**Detection Checklist When Reviewing Invoice Templates:**
1. ✅ Check if \`personTypeId\` calculation uses \`companyId\` (NOT \`contactId\`)
2. ✅ Verify values are 2 for companies, 4 for contacts (NOT 3)
3. ✅ Confirm \`PAY_SYSTEM_ID\` matches \`PERSON_TYPE_ID\` (both 2 or both 4)
4. ✅ Ensure customer type check: \`customerInfo.companyId\` determines which path to use

### COMPLETE Working Example for your-domain.bitrix24.com

**This example includes ALL required fields to avoid "field required" errors:**

\`\`\`javascript
// Complete invoice creation with all required fields
const invoiceResult = await this.callAPI('crm.invoice.add', {
  fields: {
    // Core identification
    ACCOUNT_NUMBER: 'INV-2025-001',
    ORDER_TOPIC: 'Professional Services Invoice',

    // Payment configuration
    PAY_SYSTEM_ID: 2,  // Required - 2 for Company, 4 for Contact (must match PERSON_TYPE_ID)
    CURRENCY: 'USD',   // Required - Payment systems are currency-specific
    PERSON_TYPE_ID: 2, // Required - 2 for Company, 4 for Contact (must match PAY_SYSTEM_ID)
    STATUS_ID: 'N',    // Required - 'N' = new invoice

    // Date fields (use current date or specify)
    DATE_BILL: new Date().toISOString().split('T')[0],  // Today's date YYYY-MM-DD
    DATE_INSERT: new Date().toISOString(),              // Current datetime
    DATE_MARKED: new Date().toISOString(),              // Current datetime
    DATE_PAY_BEFORE: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0], // 30 days from now
    PAY_VOUCHER_DATE: new Date().toISOString().split('T')[0],

    // Payment tracking
    PAY_VOUCHER_NUM: '',        // Can be empty string
    REASON_MARKED: '',          // Can be empty string

    // Responsible person
    RESPONSIBLE_ID: 1,  // Current user ID or default to 1 (admin)

    // CRM relations
    UF_MYCOMPANY_ID: 2,         // Seller (always 2 for this instance)
    UF_COMPANY_ID: companyId,   // Buyer company ID
    UF_CONTACT_ID: 0,           // 0 if using company, or contactId if using contact
    UF_DEAL_ID: 0,              // 0 if no related deal, or dealId
    UF_QUOTE_ID: 0,             // 0 if no related quote, or quoteId

    // Location and description
    PR_LOCATION: 1,  // Required - Location ID (use 1 as default or query available locations)
    USER_DESCRIPTION: 'Invoice generated from call transcript analysis',

    // Invoice properties (can be empty array if no custom properties needed)
    INVOICE_PROPERTIES: [],

    // Product rows - at least ONE required
    PRODUCT_ROWS: [
      {
        PRODUCT_ID: 0,  // 0 for custom product (not from catalog)
        PRODUCT_NAME: 'Microsoft 365 Business Subscription',
        QUANTITY: 1,
        PRICE: 175.00,
        DISCOUNT_PRICE: 0
      },
      {
        PRODUCT_ID: 0,
        PRODUCT_NAME: 'Migration Services',
        QUANTITY: 1,
        PRICE: 275.00,
        DISCOUNT_PRICE: 0
      }
    ]
  }
});

// Response contains invoice ID
const invoiceId = invoiceResult.ID;
\`\`\`

### Field Value Discovery Patterns

**For PR_LOCATION (if you need to query available locations):**
\`\`\`javascript
// Query location list (this may vary by instance)
const locations = await this.callAPI('crm.catalog.section.list', {
  filter: { CATALOG_ID: 1 }
});
// Use first location ID or specific one based on your needs
const locationId = locations[0]?.ID || 1;
\`\`\`

**For PAY_SYSTEM_ID (if you need to query available payment systems):**
\`\`\`javascript
// Query payment systems
const paySystems = await this.callAPI('sale.paysystem.list', {});
// Use first payment system ID
const paySystemId = paySystems[0]?.ID || 1;
\`\`\`

**Default Values Strategy:**
- PR_LOCATION: Use 4 (verified from production invoice #17878)
- PAY_SYSTEM_ID: Use 2 (ONLY valid payment system for your-domain.bitrix24.com)
- UF_DEAL_ID: Use 0 if no deal related
- UF_QUOTE_ID: Use 0 if no quote related
- Empty strings for optional text fields: PAY_VOUCHER_NUM, REASON_MARKED
- Current date for all date fields
- RESPONSIBLE_ID: Use 1 (admin) or current user ID

Working Example from Official Bitrix24 Documentation:
From https://apidocs.bitrix24.com/api-reference/crm/outdated/invoice/crm-invoice-add.html

\`\`\`javascript
// STRUCTURE EXAMPLE - Do NOT hardcode these values!
// Product names, quantities, and prices should be dynamically generated based on:
// - AI analysis of call transcripts
// - User input
// - Actual billable services/items
const invoiceFields = {
  ACCOUNT_NUMBER: 'INV-001',              // Generate unique number
  ORDER_TOPIC: 'Invoice for services',    // Descriptive subject based on context
  STATUS_ID: 'N',
  PAY_SYSTEM_ID: 2,
  CURRENCY: 'USD',                        // Required for payment system validation
  PERSON_TYPE_ID: 2,
  UF_COMPANY_ID: 123,                     // Actual buyer company ID
  UF_MYCOMPANY_ID: 2,                     // Seller company (REQUIRED - always use 2)
  PRODUCT_ROWS: [                         // Dynamically generate from AI analysis or user input
    {
      PRODUCT_NAME: 'Consulting services',  // Actual service/product name
      QUANTITY: 1,                          // Actual quantity
      PRICE: 1000                           // Actual price
    }
    // Add more items as needed based on context
  ]
};
\`\`\`

Complete Working Example - Creating Invoice with Buyer Lookup:

\`\`\`javascript
// STEP 1: Determine if customer ID is a company or contact
async function createInvoiceForCustomer(customerId, lineItems) {
  let buyerField = {};

  // Try company first
  try {
    const company = await this.callAPI('crm.company.get', { id: customerId });
    if (company) {
      buyerField.UF_COMPANY_ID = customerId;
      this.log('info', \`Customer \${customerId} is a company\`);
    }
  } catch (error) {
    // Not a company, try contact
    try {
      const contact = await this.callAPI('crm.contact.get', { id: customerId });
      if (contact) {
        buyerField.UF_CONTACT_ID = customerId;
        this.log('info', \`Customer \${customerId} is a contact\`);
      }
    } catch (contactError) {
      throw new Error(\`Customer ID \${customerId} not found as company or contact\`);
    }
  }

  // STEP 2: Create invoice with determined buyer field
  const invoiceResult = await this.callAPI('crm.invoice.add', {
    fields: {
      ACCOUNT_NUMBER: \`INV-\${Date.now()}\`,
      ORDER_TOPIC: 'Invoice for Services',
      PAY_SYSTEM_ID: 2,
      CURRENCY: 'USD',
      PERSON_TYPE_ID: 2,
      UF_MYCOMPANY_ID: 2,           // Always 2 for seller
      ...buyerField,                 // UF_COMPANY_ID or UF_CONTACT_ID
      PRODUCT_ROWS: lineItems        // From AI analysis
    }
  });

  return invoiceResult;
}
\`\`\`

### AI-Powered Invoice Generation from Transcripts

CRITICAL: When creating invoices from call transcripts, use Gemini AI to analyze the conversation and extract billable services. This section shows the complete pattern.

#### 🚨 CRITICAL: Write Permissive AI Analysis Prompts, NOT Strict Ones

**THE PROBLEM**: Using strict language like "agreed upon", "explicitly confirmed", or "client accepted" in AI analysis prompts causes the AI to return ZERO services even when recommendations were clearly discussed.

**REAL EXAMPLE - Same Call Transcript, Different Results**:
- ❌ **Strict prompt** ("services that were agreed upon"): Returns 0 services, summary: "No billable services agreed upon"
- ✅ **Permissive prompt** ("services discussed or recommended"): Returns 3 services ($450 total)

**WHY THIS HAPPENS**: Sales and support calls rarely have explicit "I agree to purchase X" statements. Instead, they discuss needs, recommend solutions, and propose services. A strict AI prompt misses all of this.

**THE FIX**: Use permissive language that captures ALL potential billable items:

**✅ GOOD WORDS** (use these):
- "discussed", "recommended", "proposed", "mentioned"
- "suggested", "offered", "presented", "brought up"
- "talked about", "identified needs for"

**❌ BAD WORDS** (avoid these):
- "agreed upon", "explicitly confirmed", "client accepted"
- "formally approved", "signed off on", "committed to"
- "only if client said yes"

**PHILOSOPHY**: The goal is to identify POTENTIAL billable items for human review, not to act as a legal contract parser. It's better to capture 10 items for review than to miss 3 legitimate services because the AI was too conservative.

**TEMPLATE VALIDATION**: When creating or modifying invoice-from-transcript templates, CHECK the AI analysis prompt:
- Does it say "discussed" or "recommended"? ✅ Good
- Does it say "agreed upon" or "confirmed"? ❌ Bad - will return zero items
- Does it have examples of what to include? ✅ Good
- Does it say "be inclusive not exclusive"? ✅ Good

#### Step 1: Analyze Transcript with Gemini

Use callGemini() to extract services, quantities, and prices from the call transcript:

\`\`\`javascript
async function analyzeTranscriptForInvoice(transcript) {
  // Prompt Gemini to extract structured line items
  const prompt = \`Analyze this call transcript and identify ALL billable services, products, or recommendations that were discussed, proposed, or mentioned.

TRANSCRIPT:
\${transcript}

Extract the following information in JSON format:
{
  "services": [
    {
      "name": "Service name",
      "description": "Brief description",
      "quantity": 1,
      "price": 100.00,
      "unit": "hour/license/item/etc"
    }
  ],
  "totalAmount": 450.00,
  "summary": "Brief summary of what was agreed"
}

IMPORTANT RULES FOR EXTRACTING BILLABLE SERVICES:
- Include ALL services, products, or recommendations that were discussed, proposed, or mentioned during the call
- Capture items even if they were only recommended or suggested (DO NOT require explicit agreement or confirmation)
- Include services mentioned by EITHER the caller OR the representative
- Include upgrades, migrations, subscriptions, licenses, labor, and one-time services
- If specific pricing was mentioned, use those exact values; otherwise estimate based on context and industry standards
- Include items discussed as options or possibilities - the invoice can be reviewed before sending
- If absolutely NO billable items or services were mentioned at all, return empty services array
- All prices must be numbers (not strings)

EXAMPLES OF WHAT TO INCLUDE:
✅ "We recommend upgrading to M365" → Include as billable service
✅ "You'll need a new license for that" → Include as service
✅ "That migration would cost around $X" → Include with price $X
✅ "Let me set that up for you" → Include as service
✅ "We can handle that security update" → Include as service
✅ "The annual subscription is $Y" → Include with price $Y
✅ Representative proposes a solution to customer's problem → Include as service

EXAMPLES OF WHAT NOT TO INCLUDE:
❌ "What services do you offer?" (just asking, no specific service discussed)
❌ "Call me back later to discuss options" (no specific services mentioned)
❌ Pure account balance inquiries with no services discussed
❌ Password resets or basic support with no billable component

CRITICAL: Be INCLUSIVE not EXCLUSIVE. Better to capture 10 potential items for review than to miss 3 real services because you were too conservative.

Return ONLY valid JSON, no other text.\`;

  // Call Gemini with structured output
  const response = await this.callGemini(prompt, {
    temperature: 0.1,  // Low temperature for consistent extraction
    maxTokens: 2048
  });

  // Parse JSON response
  let analysis;
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = response.match(/\`\`\`json\s*([\s\S]*?)\`\`\`/) ||
                      response.match(/\`\`\`\s*([\s\S]*?)\`\`\`/) ||
                      [null, response];
    const jsonText = jsonMatch[1] || response;
    analysis = JSON.parse(jsonText.trim());
  } catch (error) {
    this.log('error', 'Failed to parse Gemini response as JSON', {
      error: error.message,
      response: response.substring(0, 200)
    });
    throw new Error('AI analysis returned invalid format');
  }

  // Validate structure
  if (!analysis.services || !Array.isArray(analysis.services)) {
    throw new Error('AI analysis missing services array');
  }

  return analysis;
}
\`\`\`

Example Gemini Response (Good):
\`\`\`json
{
  "services": [
    {
      "name": "M365 & Windows Security Update Package",
      "description": "Includes labor for data migration from personal OneDrive, procurement and installation of new Microsoft 365 license, and Windows OS security update/upgrade",
      "quantity": 1,
      "price": 275.00,
      "unit": "service"
    },
    {
      "name": "Microsoft 365 Annual Subscription",
      "description": "Annual license for Microsoft 365 Business service",
      "quantity": 1,
      "price": 175.00,
      "unit": "license"
    }
  ],
  "totalAmount": 450.00,
  "summary": "Comprehensive M365 migration and security package accepted by client"
}
\`\`\`

#### Step 2: Convert AI Analysis to PRODUCT_ROWS

Transform the AI-extracted services into Bitrix24 PRODUCT_ROWS format:

\`\`\`javascript
function convertServicesToProductRows(services) {
  if (!services || services.length === 0) {
    // No services identified - create placeholder
    return [{
      PRODUCT_NAME: 'Services - See Notes',
      QUANTITY: 1,
      PRICE: 0,
      MEASURE_CODE: 796,
      MEASURE_NAME: 'Service'
    }];
  }

  return services.map(service => ({
    PRODUCT_NAME: service.name,                    // From AI analysis
    QUANTITY: service.quantity || 1,               // From AI analysis
    PRICE: parseFloat(service.price) || 0,         // From AI analysis
    MEASURE_CODE: 796,                             // Standard service code
    MEASURE_NAME: service.unit || 'Service',       // From AI analysis
    VAT_RATE: 0.00,                                // Adjust as needed
    VAT_INCLUDED: 'N'
  }));
}

// Usage
const analysis = await analyzeTranscriptForInvoice(transcript);
const productRows = convertServicesToProductRows(analysis.services);
\`\`\`

#### Step 3: Create Invoice with AI-Generated Line Items

\`\`\`javascript
async function createInvoiceFromTranscript(customerId, transcript) {
  // Analyze transcript
  const analysis = await this.analyzeTranscriptForInvoice(transcript);

  if (analysis.services.length === 0) {
    this.log('warn', 'No billable services found in transcript');
  }

  // Convert to PRODUCT_ROWS
  const productRows = this.convertServicesToProductRows(analysis.services);

  // Determine buyer field
  let buyerField = {};
  try {
    const company = await this.callAPI('crm.company.get', { id: customerId });
    buyerField.UF_COMPANY_ID = customerId;
  } catch (error) {
    const contact = await this.callAPI('crm.contact.get', { id: customerId });
    buyerField.UF_CONTACT_ID = customerId;
  }

  // Create invoice
  const invoiceResult = await this.callAPI('crm.invoice.add', {
    fields: {
      ACCOUNT_NUMBER: \`INV-\${Date.now()}\`,
      ORDER_TOPIC: analysis.summary || 'Services from Call',
      PAY_SYSTEM_ID: 2,
      CURRENCY: 'USD',
      PERSON_TYPE_ID: 2,
      UF_MYCOMPANY_ID: 2,
      ...buyerField,
      PRODUCT_ROWS: productRows,
      COMMENTS: 'Generated from call transcript analysis'
    }
  });

  return {
    invoiceId: invoiceResult.result,
    analysis,
    productRows
  };
}
\`\`\`

#### Step 4: Generate Invoice Link

CRITICAL: After creating an invoice, generate the user-facing link using this pattern:

\`\`\`javascript
function getInvoiceLink(invoiceId) {
  // Bitrix24 invoice URL pattern
  return \`https://your-domain.bitrix24.com/crm/invoice/show/\${invoiceId}\`;
}

// Usage after invoice creation
const { invoiceId, analysis } = await createInvoiceFromTranscript(customerId, transcript);

#### 🚨 CRITICAL: Production-Verified Invoice Creation Pattern (your-domain.bitrix24.com)

**IMPORTANT: Based on working invoice #17878, use these EXACT hardcoded values for your-domain.bitrix24.com instance.**

##### Configuration Values (VERIFIED from Production Invoice #17878)

\`\`\`javascript
// ✅ PRODUCTION-VERIFIED CONFIGURATION (your-domain.bitrix24.com)
const INVOICE_CONFIG = {
  PAY_SYSTEM_ID: 2,        // ✅ HARDCODED - Always 2 (verified from production)
  PR_LOCATION: 4,          // ✅ HARDCODED - Location ID 4 (verified from production)
  UF_MYCOMPANY_ID: 2,      // ✅ HARDCODED - Seller company (constant)
  STATUS_ID: 'N',          // ✅ HARDCODED - New invoice status
  CURRENCY: 'USD'          // ✅ HARDCODED - Default currency
};

// ⚠️ PERSON_TYPE_ID is DYNAMIC based on buyer type:
// - If buyer is CONTACT (UF_CONTACT_ID set): PERSON_TYPE_ID = 2
// - If buyer is COMPANY (UF_COMPANY_ID set): PERSON_TYPE_ID = 3
\`\`\`

**Hardcoded values (never change):**
- PAY_SYSTEM_ID: **2** (NOT 1!)
- CURRENCY: **'USD'** (REQUIRED for payment system validation)
- PR_LOCATION: **4**
- UF_MYCOMPANY_ID: **2** (seller company)
- STATUS_ID: **'N'**

**Dynamic value (determined by buyer type):**
- PERSON_TYPE_ID: **2** if buyer is Contact, **3** if buyer is Company

##### Production-Verified PRODUCT_ROWS Structure

From invoice #17878, PRODUCT_ROWS MUST have this EXACT structure:

\`\`\`javascript
{
  "PRODUCT_ID": "176",           // Product catalog ID, or 0 for custom
  "QUANTITY": "1.0000",          // ✅ STRING with exactly 4 decimals
  "PRICE": "1485.0000",          // ✅ STRING with exactly 4 decimals
  "DISCOUNT_PRICE": "0.0000",    // ✅ REQUIRED - STRING with 4 decimals
  "VAT_RATE": "0.0000",          // ✅ REQUIRED - STRING with 4 decimals
  "VAT_INCLUDED": "N",           // ✅ REQUIRED - "Y" or "N" string
  "MEASURE_CODE": "796",         // ✅ REQUIRED - "796" = pieces
  "MEASURE_NAME": "pcs.",        // ✅ REQUIRED - measurement unit name
  "PRODUCT_NAME": "Digital Services 5 users CLOUD Network",
  "CUSTOMIZED": "Y"              // ✅ REQUIRED - "Y" for custom products
}
\`\`\`

**Key Points:**
1. ALL numeric fields (QUANTITY, PRICE, DISCOUNT_PRICE, VAT_RATE) are **STRINGS with 4 decimal places**
2. MEASURE_CODE is always **"796"** (pieces)
3. VAT_RATE is **"0.0000"** (no tax)
4. VAT_INCLUDED is **"N"** (tax not included)
5. CUSTOMIZED is **"Y"** for non-catalog products

##### Complete Production-Ready Invoice Creation Pattern

\`\`\`javascript
/**
 * Create invoice using PRODUCTION-VERIFIED configuration
 * Based on working invoice #17878 from your-domain.bitrix24.com
 */
async function createInvoiceFromCallTranscript(customerId, aiLineItems, aiSummary) {
  // STEP 1: Get customer info - CRITICAL: Try CONTACT first, then COMPANY
  let customerInfo = {};
  let isContact = false;

  try {
    const contactResponse = await this.callAPI('crm.contact.get', { id: customerId });
    if (contactResponse?.result) {
      customerInfo = {
        id: contactResponse.result.ID,
        name: \`\${contactResponse.result.NAME || ''} \${contactResponse.result.LAST_NAME || ''}\`.trim(),
        contactId: contactResponse.result.ID,
        companyId: contactResponse.result.COMPANY_ID || 0,
        responsibleId: contactResponse.result.ASSIGNED_BY_ID
      };
      isContact = true;
      this.log('info', 'Found customer as Contact', { customerId });
    }
  } catch (contactError) {
    // Not a contact, try as company
    this.log('info', 'Customer not found as Contact, trying Company', { customerId });
    try {
      const companyResponse = await this.callAPI('crm.company.get', { id: customerId });
      if (companyResponse?.result) {
        customerInfo = {
          id: companyResponse.result.ID,
          name: companyResponse.result.TITLE,
          contactId: 0,
          companyId: companyResponse.result.ID,
          responsibleId: companyResponse.result.ASSIGNED_BY_ID
        };
        this.log('info', 'Found customer as Company', { customerId });
      }
    } catch (companyError) {
      throw new Error(\`Customer ID \${customerId} not found as Contact or Company\`);
    }
  }

  // STEP 2: Format product rows with EXACT production structure
  const productRows = aiLineItems.map(item => ({
    PRODUCT_ID: 0,  // 0 for custom (non-catalog) products
    PRODUCT_NAME: item.PRODUCT_NAME,
    QUANTITY: String(parseFloat(item.QUANTITY || 1).toFixed(4)),      // ✅ "1.0000"
    PRICE: String(parseFloat(item.PRICE || 0).toFixed(4)),            // ✅ "125.0000"
    DISCOUNT_PRICE: "0.0000",                                         // ✅ Always string
    VAT_RATE: "0.0000",                                               // ✅ No tax
    VAT_INCLUDED: "N",                                                // ✅ Tax not included
    MEASURE_CODE: "796",                                              // ✅ 796 = pieces
    MEASURE_NAME: "pcs.",                                             // ✅ Display name
    CUSTOMIZED: "Y"                                                   // ✅ Custom product
  }));

  // STEP 3: Build invoice with PRODUCTION-VERIFIED configuration
  const now = new Date();
  const dueDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

  // ✅ PERSON_TYPE_ID is determined by buyer type:
  // - Contact (UF_CONTACT_ID set): PERSON_TYPE_ID = 2
  // - Company (UF_COMPANY_ID set): PERSON_TYPE_ID = 3
  const personTypeId = customerInfo.contactId ? 2 : 3;

  const invoiceFields = {
    // Core identification
    ACCOUNT_NUMBER: \`INV-\${Date.now()}\`,
    ORDER_TOPIC: (aiSummary || 'Services from Call Transcript').substring(0, 255),

    // ✅ HARDCODED - Verified from production
    PAY_SYSTEM_ID: 2,          // Always 2 (verified from invoice #17878)
    PERSON_TYPE_ID: personTypeId,  // ✅ 2 for Contact, 3 for Company
    STATUS_ID: 'N',            // N = New invoice
    PR_LOCATION: 4,            // Location ID 4 (verified from production)

    // Dates
    DATE_BILL: now.toISOString().split('T')[0],                       // YYYY-MM-DD
    DATE_PAY_BEFORE: dueDate.toISOString().split('T')[0],            // YYYY-MM-DD

    // Responsible person
    RESPONSIBLE_ID: customerInfo.responsibleId || this.context.userId || 1,

    // ✅ CRM Relations - CONTACT FIRST (primary), then COMPANY (fallback)
    UF_MYCOMPANY_ID: 2,                      // Seller company (constant)
    UF_CONTACT_ID: customerInfo.contactId || 0,   // CONTACT FIRST
    UF_COMPANY_ID: customerInfo.companyId || 0,   // COMPANY SECOND
    UF_DEAL_ID: 0,                                // 0 if no deal

    // Description
    USER_DESCRIPTION: 'Invoice generated automatically from 3CX call transcript analysis',

    // Invoice properties (can be empty)
    INVOICE_PROPERTIES: [],

    // ✅ Product rows with EXACT production structure
    PRODUCT_ROWS: productRows
  };

  // STEP 4: Validate required fields
  if (!invoiceFields.UF_CONTACT_ID && !invoiceFields.UF_COMPANY_ID) {
    throw new Error('Invoice requires either UF_CONTACT_ID or UF_COMPANY_ID');
  }

  if (!invoiceFields.PRODUCT_ROWS || invoiceFields.PRODUCT_ROWS.length === 0) {
    throw new Error('Invoice requires at least one product row');
  }

  // STEP 5: Create invoice
  const response = await this.callAPI('crm.invoice.add', { fields: invoiceFields });

  if (!response?.result) {
    const errorDetail = response?.error_description || 'Unknown error';
    this.log('error', 'Invoice creation failed', {
      error: errorDetail,
      response: response
    });
    throw new Error(\`Invoice creation failed: \${errorDetail}\`);
  }

  return response.result;  // Returns invoice ID
}
\`\`\`

##### 🚨 Common Invoice Creation Errors and Quick Fixes

**CRITICAL: If auto-repair encounters these errors, apply the exact fix shown below**

---

### Error 1: "Payment system was not found"

**Error Details:**
- **Full error message**: \`"ERROR_CORE: Payment system was not found"\`
- **API method**: \`crm.invoice.add\`
- **HTTP status**: 400 (Bad Request)

**Root Causes (check BOTH):**
1. Using \`PAY_SYSTEM_ID: 1\` which doesn't exist in this Bitrix24 instance
2. **MISSING CURRENCY field** - Payment systems are currency-specific and require CURRENCY to be set

**The Fix (TWO REQUIRED CHANGES):**
\`\`\`javascript
// ❌ WRONG - Missing CURRENCY and wrong PAY_SYSTEM_ID:
PAY_SYSTEM_ID: 1,
// (no CURRENCY field)

// ✅ CORRECT - Both PAY_SYSTEM_ID and CURRENCY required:
PAY_SYSTEM_ID: 2,
CURRENCY: 'USD',
\`\`\`

**Why This Works:**
- PAY_SYSTEM_ID: 2 is the only valid payment system for your-domain.bitrix24.com (verified from production invoice #17878)
- CURRENCY: 'USD' is required because payment systems are currency-specific - without it, Bitrix24 cannot validate the payment system

**Auto-Repair Instructions:**
1. Search template for: \`PAY_SYSTEM_ID: 1\` or \`PAY_SYSTEM_ID:1\`
2. Replace with: \`PAY_SYSTEM_ID: 2\`
3. **CRITICAL**: Add \`CURRENCY: 'USD',\` on the line immediately after PAY_SYSTEM_ID
4. DO NOT add any other code
5. DO NOT modify AI analysis logic
6. Keep all other invoice fields unchanged

**Complete Working Invoice Fields Example:**
\`\`\`javascript
const invoiceFields = {
  ACCOUNT_NUMBER: \`INV-\${Date.now()}\`,
  ORDER_TOPIC: 'Services Invoice',
  PAY_SYSTEM_ID: 2,           // ✅ REQUIRED - Always 2
  CURRENCY: 'USD',             // ✅ REQUIRED - Must specify currency for payment system
  PERSON_TYPE_ID: personTypeId, // 2 for Contact, 3 for Company
  STATUS_ID: 'N',
  PR_LOCATION: 4,
  // ... rest of fields
}
\`\`\`

---

### Error 2: "Person type not found"

**Error Details:**
- **Full error message**: \`"ERROR_CORE: Person type not found"\`
- **API method**: \`crm.invoice.add\`

**Root Cause:**
Using wrong PERSON_TYPE_ID or hardcoding it to 1

**The Fix:**
Set dynamically based on buyer entity type:
\`\`\`javascript
// ✅ CORRECT - Dynamic selection:
const personTypeId = customerInfo.contactId ? 2 : 3;  // 2 for Contact, 3 for Company

// Then use in invoice fields:
PERSON_TYPE_ID: personTypeId
\`\`\`

---

### Error 3: "Invalid PRODUCT_ROWS format"

**Error Details:**
- **Error message**: Contains "PRODUCT_ROWS" and "format" or "invalid"
- **API method**: \`crm.invoice.add\`

**Root Cause:**
Using numbers instead of strings for QUANTITY/PRICE

**The Fix:**
\`\`\`javascript
// ❌ WRONG:
QUANTITY: 1.5,
PRICE: 100.25

// ✅ CORRECT:
QUANTITY: "1.5000",  // String with 4 decimals
PRICE: "100.2500"    // String with 4 decimals

// Use this pattern:
QUANTITY: String(parseFloat(item.quantity || 1).toFixed(4)),
PRICE: String(parseFloat(item.price || 0).toFixed(4))
\`\`\`

---

### Error 4: "Missing required fields in PRODUCT_ROWS"

**Error Details:**
- **Error message**: Contains "required field" and PRODUCT_ROWS field name

**Root Cause:**
Missing VAT_RATE, VAT_INCLUDED, MEASURE_CODE, MEASURE_NAME, or CUSTOMIZED

**The Fix:**
Include ALL required fields:
\`\`\`javascript
PRODUCT_ROWS: [{
  PRODUCT_ID: 0,
  PRODUCT_NAME: "Service Name",
  QUANTITY: "1.0000",
  PRICE: "100.0000",
  DISCOUNT_PRICE: "0.0000",     // ✅ Required
  VAT_RATE: "0.0000",           // ✅ Required
  VAT_INCLUDED: "N",            // ✅ Required
  MEASURE_CODE: "796",          // ✅ Required
  MEASURE_NAME: "pcs.",         // ✅ Required
  CUSTOMIZED: "Y"               // ✅ Required for custom products
}]
\`\`\`

---

### Error 5: "Customer not found"

**Error Details:**
- Template can't find customer with given ID
- Happens during crm.contact.get or crm.company.get

**Root Cause:**
Checking COMPANY before CONTACT (wrong order)

**The Fix:**
Check CONTACT first (most IDs are contacts):
\`\`\`javascript
// ✅ CORRECT order:
try {
  const contactResponse = await this.callAPI('crm.contact.get', { id: customerId });
  // Found as contact, PERSON_TYPE_ID: 2
} catch (e) {
  // Not a contact, try company
  const companyResponse = await this.callAPI('crm.company.get', { id: customerId });
  // Found as company, PERSON_TYPE_ID: 3
}
\`\`\`

---

### Error 6: "missing ) after argument list" or "Unexpected token" in Template Literals

**Error Details:**
- **Error message**: "missing ) after argument list", "Unexpected token '.'", or "Unexpected identifier"
- **Happens during**: Template validation or compilation
- **Location**: Usually in \`this.log()\` or \`this.updateProgress()\` calls

**Root Cause:**
Improperly escaped backticks or template literals inside log statements, causing syntax errors

**Common Pattern That Fails:**
\`\`\`javascript
// ❌ WRONG - Unescaped template literal inside template literal
this.log('info', \`Fetched transcript for recording ID \${recordingId}. Length: \${transcript.length}\`);

// ❌ WRONG - Missing closing backtick
this.log('info', \`Processing customer \${customerId}...);

// ❌ WRONG - Mixed quotes and backticks
this.updateProgress(50, \`Analyzing data for \${itemCount} items...);
\`\`\`

**The Fix - Use Simple Strings for Logs:**
\`\`\`javascript
// ✅ CORRECT - Use simple string concatenation or structured objects
this.log('info', 'Fetched transcript for recording ID ' + recordingId + '. Length: ' + transcript.length);

// ✅ BETTER - Use structured logging with object
this.log('info', 'Fetched transcript', {
  recordingId: recordingId,
  transcriptLength: transcript.length
});

// ✅ CORRECT - Simple strings for progress updates
this.updateProgress(10, 'Fetching call recording...');
this.updateProgress(30, 'Analyzing transcript with AI...');
this.updateProgress(60, 'Creating invoice in Bitrix24...');

// ✅ ACCEPTABLE - If you must use template literals, ensure proper escaping
this.log('info', 'Processing customer ' + customerId);
\`\`\`

**Template Generation Guidance:**
When generating task templates, PREFER simple strings over template literals for:
- \`this.log()\` messages
- \`this.updateProgress()\` messages
- Error messages
- Log descriptions

Only use template literals when absolutely necessary, and ensure they are properly escaped.

---

##### Complete Working Example

\`\`\`javascript
// Example: Create invoice from AI-analyzed call transcript
async execute() {
  const { recordingId, customerId } = this.parameters;

  // Get 3CX recording with transcript
  const recording = await threecx.getRecording(recordingId);

  // Analyze transcript with AI
  const aiAnalysis = await this.analyzeTranscriptForBilling(recording.Transcription);

  // Create invoice using production-verified pattern
  const newInvoiceId = await this.createInvoiceFromCallTranscript(
    customerId,
    aiAnalysis.lineItems,
    aiAnalysis.summary
  );

  this.log('info', 'Invoice created successfully', {
    invoiceId: newInvoiceId,
    customerId,
    itemCount: aiAnalysis.lineItems.length
  });

  return {
    success: true,
    invoiceId: newInvoiceId,
    invoiceUrl: \`https://your-domain.bitrix24.com/crm/invoice/show/\${newInvoiceId}\`
  };
}
\`\`\`

**CRITICAL TAKEAWAYS:**
1. ✅ Use PAY_SYSTEM_ID: **2** (hardcoded, NOT 1!)
2. ✅ Use PERSON_TYPE_ID: **2 for Contact, 3 for Company** (determined dynamically)
3. ✅ Use PR_LOCATION: **4** (hardcoded, from production)
4. ✅ Use UF_MYCOMPANY_ID: **2** (hardcoded, seller company)
5. ✅ ALL PRODUCT_ROWS numeric fields are **STRINGS with 4 decimals** (not numbers!)
6. ✅ Check **CONTACT first**, then COMPANY (most customers are contacts)
7. ✅ Include ALL required PRODUCT_ROWS fields: VAT_RATE, VAT_INCLUDED, MEASURE_CODE, MEASURE_NAME, CUSTOMIZED
const invoiceLink = getInvoiceLink(invoiceId);

this.log('info', 'Invoice created successfully', {
  invoiceId,
  link: invoiceLink,
  lineItems: analysis.services.length
});
\`\`\`

#### Step 5: Generate HTML Report with Transcript and Analysis

Create a comprehensive HTML report with separate panels for transcript, AI analysis, and invoice link:

\`\`\`javascript
function generateInvoiceReport(transcript, analysis, invoiceId, recordingId) {
  const invoiceLink = \`https://your-domain.bitrix24.com/crm/invoice/show/\${invoiceId}\`;

  const html = \`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invoice from Call Transcript - Recording \${recordingId}</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 p-8">
    <div class="max-w-6xl mx-auto space-y-6">
        <!-- Header -->
        <div class="bg-white p-6 rounded-lg shadow-lg">
            <h1 class="text-3xl font-bold text-blue-600 mb-2">
                Invoice Generated from Call Transcript
            </h1>
            <p class="text-gray-600">Recording ID: \${recordingId}</p>
            <p class="text-gray-600">Invoice ID: \${invoiceId}</p>
        </div>

        <!-- Invoice Link Button -->
        <div class="bg-blue-50 border-2 border-blue-200 p-6 rounded-lg">
            <h2 class="text-xl font-semibold text-blue-800 mb-3">
                📄 Invoice Created
            </h2>
            <a href="\${invoiceLink}"
               target="_blank"
               class="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition">
                🔗 View Invoice in Bitrix24
            </a>
            <p class="text-sm text-gray-600 mt-3">
                Total Amount: $\${analysis.totalAmount.toFixed(2)}
            </p>
        </div>

        <!-- AI Analysis Panel -->
        <div class="bg-white p-6 rounded-lg shadow-lg">
            <h2 class="text-2xl font-bold text-gray-800 mb-4">
                🤖 AI Analysis
            </h2>

            <div class="mb-4 p-4 bg-green-50 border-l-4 border-green-500 rounded">
                <p class="text-gray-700">\${analysis.summary}</p>
            </div>

            <h3 class="text-xl font-semibold text-gray-700 mb-3">
                Identified Services:
            </h3>

            <div class="space-y-3">
                \${analysis.services.map((service, index) => \`
                    <div class="border border-gray-200 p-4 rounded-lg bg-gray-50">
                        <div class="flex justify-between items-start">
                            <div class="flex-1">
                                <h4 class="font-semibold text-gray-800">
                                    \${index + 1}. \${service.name}
                                </h4>
                                <p class="text-gray-600 text-sm mt-1">
                                    \${service.description}
                                </p>
                            </div>
                            <div class="text-right ml-4">
                                <p class="font-bold text-blue-600">
                                    $\${service.price.toFixed(2)}
                                </p>
                                <p class="text-sm text-gray-500">
                                    Qty: \${service.quantity} \${service.unit}
                                </p>
                            </div>
                        </div>
                    </div>
                \`).join('')}
            </div>

            <div class="mt-4 pt-4 border-t-2 border-gray-300">
                <div class="flex justify-between items-center">
                    <span class="text-xl font-bold text-gray-800">Total:</span>
                    <span class="text-2xl font-bold text-blue-600">
                        $\${analysis.totalAmount.toFixed(2)}
                    </span>
                </div>
            </div>
        </div>

        <!-- Call Transcript Panel -->
        <div class="bg-white p-6 rounded-lg shadow-lg">
            <h2 class="text-2xl font-bold text-gray-800 mb-4">
                📞 Call Transcript
            </h2>
            <div class="bg-gray-100 p-4 rounded-lg border border-gray-300
                        max-h-96 overflow-y-auto">
                <pre class="whitespace-pre-wrap font-mono text-sm text-gray-700">\${transcript}</pre>
            </div>
        </div>

        <!-- Footer -->
        <div class="text-center text-gray-500 text-sm mt-8">
            <p>Generated by Chantilly Agent • \${new Date().toLocaleString()}</p>
        </div>
    </div>
</body>
</html>\`;

  return html;
}

// Complete usage example
async function execute() {
  const { recordingId, customerId } = this.parameters;

  // Fetch transcript
  const recording = await threecx.getRecording(recordingId);
  const transcript = recording.Transcription;

  // Analyze with AI
  const analysis = await this.analyzeTranscriptForInvoice(transcript);

  // Create invoice
  const { invoiceId } = await this.createInvoiceFromTranscript(customerId, transcript);

  // Generate report
  const reportHtml = this.generateInvoiceReport(transcript, analysis, invoiceId, recordingId);

  // Upload report
  const attachment = await this.uploadReport(
    reportHtml,
    \`invoice-transcript-\${recordingId}.html\`,
    { invoiceId, recordingId }
  );

  return {
    success: true,
    invoiceId,
    invoiceLink: \`https://your-domain.bitrix24.com/crm/invoice/show/\${invoiceId}\`,
    analysis,
    attachments: [attachment]
  };
}
\`\`\`

#### Core Invoice Methods

\`\`\`javascript
// crm.invoice.add - Create new invoice
await context.queueService.add({
  method: 'crm.invoice.add',
  params: {
    fields: {
      // REQUIRED FIELDS
      ACCOUNT_NUMBER: 'INV-2025-001',       // Invoice number (string)
      ORDER_TOPIC: 'Professional Services', // Invoice subject (string)
      PAY_SYSTEM_ID: 2,                     // ALWAYS 2 for your-domain.bitrix24.com (verified)
      CURRENCY: 'USD',                      // Currency code (REQUIRED for payment system validation)
      PERSON_TYPE_ID: 2,                    // Payer type: 2=Contact, 3=Company

      // BUYER INFORMATION (one required)
      UF_COMPANY_ID: companyId,             // For company buyers
      UF_CONTACT_ID: contactId,             // For individual buyers

      // SELLER INFORMATION (required)
      UF_MYCOMPANY_ID: 2,                   // Seller company ID (REQUIRED - always use 2)

      // OPTIONAL FIELDS
      STATUS_ID: 'N',                       // N=New, S=Sent, P=Paid, D=Draft
      DATE_BILL: '2025-10-09',              // Invoice date (YYYY-MM-DD)
      PRICE: 2500.00,                       // Total amount (calculated from PRODUCT_ROWS)
      COMMENTS: 'Net 30 payment terms',     // Additional comments
      RESPONSIBLE_ID: userId,               // Responsible person ID
      
      // PRODUCT LINE ITEMS (dynamically generate from AI analysis or user input)
      PRODUCT_ROWS: [
        {
          PRODUCT_NAME: 'Consulting Services',  // Actual service name from context
          QUANTITY: 40,                         // Actual quantity from analysis
          PRICE: 150.00,                        // Actual price
          MEASURE_CODE: 796,                    // Units of measure code
          MEASURE_NAME: 'Hours',
          VAT_RATE: 0.00,                       // VAT rate (0.00 = no VAT)
          VAT_INCLUDED: 'Y'                     // Y/N - VAT included in price
        },
        {
          PRODUCT_NAME: 'Software License',     // Another item if needed
          QUANTITY: 1,
          PRICE: 500.00,
          MEASURE_CODE: 796,
          MEASURE_NAME: 'License',
          VAT_RATE: 0.10,                       // 10% VAT
          VAT_INCLUDED: 'N'
        }
      ],
      
      // INVOICE PROPERTIES (billing/shipping details)
      INVOICE_PROPERTIES: {
        COMPANY: 'Client Company Name',
        CONTACT_PERSON: 'John Smith',
        EMAIL: 'john@client.com',
        PHONE: '+1-555-0123',
        ADDRESS: '123 Client St, City, State 12345'
      }
    }
  }
});

// crm.invoice.get - Get invoice with all details including product rows
await context.queueService.add({
  method: 'crm.invoice.get',
  params: {
    id: invoiceId,                          // Invoice ID (required integer)
    // No select parameter - returns all fields by default including PRODUCT_ROWS
  }
});

// crm.invoice.list - List invoices with filtering and pagination
await context.queueService.add({
  method: 'crm.invoice.list',
  params: {
    // FILTERING OPTIONS
    filter: {
      // Date filters (use YYYY-MM-DD format)
      '>=DATE_INSERT': '2025-01-01',        // Created after date
      '<=DATE_INSERT': '2025-12-31',        // Created before date
      '>=DATE_BILL': '2025-09-01',          // Invoice date after
      '<=DATE_BILL': '2025-10-31',          // Invoice date before
      
      // Status filters
      'STATUS_ID': ['N', 'S'],              // Multiple statuses: New, Sent
      '!STATUS_ID': 'D',                    // Exclude drafts
      
      // Amount filters  
      '>PRICE': 100.00,                     // Amount greater than
      '<=PRICE': 10000.00,                  // Amount less than or equal
      
      // Company/Contact filters
      'UF_COMPANY_ID': [123, 456],          // Specific company IDs
      'UF_CONTACT_ID': contactId,           // Specific contact
      'RESPONSIBLE_ID': userId,             // Assigned to user
      
      // Text search
      '%ORDER_TOPIC': 'consulting',         // Subject contains text
      'ACCOUNT_NUMBER': 'INV-2025-%'        // Invoice number pattern
    },
    
    // FIELD SELECTION
    select: [
      'ID', 'ACCOUNT_NUMBER', 'ORDER_TOPIC', 'STATUS_ID',
      'PRICE', 'CURRENCY', 'DATE_BILL', 'DATE_INSERT',
      'UF_COMPANY_ID', 'UF_CONTACT_ID', 'RESPONSIBLE_ID',
      'COMMENTS', 'PAY_VOUCHER_NUM'
      // NOTE: PRODUCT_ROWS not included in list - use crm.invoice.get for line items
    ],
    
    // SORTING
    order: {
      'DATE_INSERT': 'DESC',                // Most recent first
      'PRICE': 'ASC'                        // Then by amount ascending
    },
    
    // PAGINATION
    start: 0,                               // Starting record (0-based)
    limit: 50                               // Max records (default: 50, max: 500)
  }
});

// crm.invoice.update - Update existing invoice
await context.queueService.add({
  method: 'crm.invoice.update',
  params: {
    id: invoiceId,                          // Invoice ID (required)
    fields: {
      STATUS_ID: 'P',                       // Update status to Paid
      COMMENTS: 'Payment received via wire transfer',
      PAY_VOUCHER_NUM: 'PMT-2025-001',      // Payment reference
      DATE_PAYED: '2025-10-09 14:30:00',    // Payment timestamp
      
      // Update product rows (replaces existing)
      PRODUCT_ROWS: [
        {
          PRODUCT_NAME: 'Updated Service',
          QUANTITY: 45,
          PRICE: 160.00
        }
      ]
    }
  }
});

// crm.invoice.delete - Delete invoice
await context.queueService.add({
  method: 'crm.invoice.delete',
  params: {
    id: invoiceId                           // Invoice ID (required)
  }
});

// crm.invoice.fields - Get field definitions and constraints
await context.queueService.add({
  method: 'crm.invoice.fields',
  params: {}                                // No parameters needed
});
// Returns complete field schema with types, requirements, and allowed values

// crm.invoice.getexternallink - Get public invoice link
await context.queueService.add({
  method: 'crm.invoice.getexternallink',
  params: {
    id: invoiceId                           // Invoice ID (required)
  }
});
\`\`\`

#### Recurring Invoice Methods

\`\`\`javascript
// crm.invoice.recurring.add - Create recurring invoice template
await context.queueService.add({
  method: 'crm.invoice.recurring.add',
  params: {
    fields: {
      NAME: 'Monthly Consulting Invoice',
      ACTIVE: 'Y',                          // Y/N - template active
      LIMIT_REPEAT: 12,                     // Number of repetitions (0 = unlimited)
      IS_LIMIT: 'Y',                        // Y/N - use repetition limit
      NEXT_EXECUTION: '2025-11-01 09:00:00', // Next invoice creation time
      PERIOD_TYPE: 'month',                 // day, week, month, year
      PERIOD_VALUE: 1,                      // Every N periods
      
      // Invoice template fields (same as crm.invoice.add)
      INVOICE_FIELDS: {
        ORDER_TOPIC: 'Monthly Consulting - [month] [year]',
        UF_COMPANY_ID: companyId,
        PRODUCT_ROWS: [
          {
            PRODUCT_NAME: 'Monthly Retainer',
            QUANTITY: 1,
            PRICE: 5000.00
          }
        ]
      }
    }
  }
});

// crm.invoice.recurring.list - List recurring templates
await context.queueService.add({
  method: 'crm.invoice.recurring.list',
  params: {
    filter: {
      'ACTIVE': 'Y',                        // Only active templates
      'UF_COMPANY_ID': companyId            // For specific company
    },
    select: ['ID', 'NAME', 'ACTIVE', 'NEXT_EXECUTION', 'PERIOD_TYPE']
  }
});

// crm.invoice.recurring.get - Get recurring template details
await context.queueService.add({
  method: 'crm.invoice.recurring.get',
  params: {
    id: templateId                          // Template ID (required)
  }
});

// crm.invoice.recurring.update - Update recurring template
await context.queueService.add({
  method: 'crm.invoice.recurring.update',
  params: {
    id: templateId,
    fields: {
      ACTIVE: 'N',                          // Disable template
      NEXT_EXECUTION: '2025-12-01 09:00:00' // Change next execution
    }
  }
});

// crm.invoice.recurring.expose - Create invoice from template
await context.queueService.add({
  method: 'crm.invoice.recurring.expose',
  params: {
    id: templateId                          // Template ID (required)
  }
});

// crm.invoice.recurring.delete - Delete recurring template
await context.queueService.add({
  method: 'crm.invoice.recurring.delete',
  params: {
    id: templateId                          // Template ID (required)
  }
});

// crm.invoice.recurring.fields - Get recurring template field definitions
await context.queueService.add({
  method: 'crm.invoice.recurring.fields',
  params: {}
});
\`\`\`

#### Custom Field Methods

\`\`\`javascript
// crm.invoice.userfield.add - Create custom field for invoices
await context.queueService.add({
  method: 'crm.invoice.userfield.add',
  params: {
    fields: {
      FIELD_NAME: 'UF_PROJECT_CODE',        // Field name (must start with UF_)
      USER_TYPE_ID: 'string',               // string, integer, double, datetime, boolean
      LABEL: 'Project Code',                // Display label
      LIST_COLUMN: 'Y',                     // Y/N - show in list view
      LIST_FILTER: 'Y',                     // Y/N - allow filtering
      IS_REQUIRED: 'N',                     // Y/N - required field
      SHOW_FILTER: 'Y',                     // Y/N - show in filter
      SETTINGS: {
        DEFAULT_VALUE: 'PROJ-',             // Default value
        SIZE: 20                            // Field size for strings
      }
    }
  }
});

// crm.invoice.userfield.list - List custom fields
await context.queueService.add({
  method: 'crm.invoice.userfield.list',
  params: {
    order: { SORT: 'ASC' }                  // Sort by display order
  }
});

// crm.invoice.userfield.get - Get custom field details
await context.queueService.add({
  method: 'crm.invoice.userfield.get',
  params: {
    id: fieldId                             // Field ID (required)
  }
});

// crm.invoice.userfield.update - Update custom field
await context.queueService.add({
  method: 'crm.invoice.userfield.update',
  params: {
    id: fieldId,
    fields: {
      LABEL: 'Updated Project Code',
      IS_REQUIRED: 'Y'
    }
  }
});

// crm.invoice.userfield.delete - Delete custom field
await context.queueService.add({
  method: 'crm.invoice.userfield.delete',
  params: {
    id: fieldId                             // Field ID (required)
  }
});
\`\`\`

#### Invoice Status Codes Reference

- **N** - New (unpaid invoice)
- **S** - Sent (invoice sent to client)
- **P** - Paid (payment received)
- **D** - Draft (not yet finalized)
- **A** - Approved (approved for sending)
- **R** - Rejected (payment declined)

#### Common Invoice Analysis Patterns

\`\`\`javascript
// Get all invoices with product details for analysis
const analyzeInvoiceProducts = async (dateRange) => {
  // Step 1: Get invoice list
  const invoices = await context.queueService.add({
    method: 'crm.invoice.list',
    params: {
      filter: {
        '>=DATE_INSERT': dateRange.start,
        '<=DATE_INSERT': dateRange.end,
        'STATUS_ID': ['N', 'S', 'P']          // Exclude drafts
      },
      select: ['ID', 'ACCOUNT_NUMBER', 'PRICE', 'STATUS_ID'],
      order: { 'DATE_INSERT': 'DESC' }
    }
  });
  
  // Step 2: Get detailed invoice data with product rows
  const productData = [];
  for (const invoice of invoices.result) {
    const fullInvoice = await context.queueService.add({
      method: 'crm.invoice.get',
      params: { id: invoice.ID }
    });
    
    // Extract product information
    if (fullInvoice.result?.PRODUCT_ROWS) {
      fullInvoice.result.PRODUCT_ROWS.forEach(product => {
        productData.push({
          invoiceId: invoice.ID,
          invoiceNumber: invoice.ACCOUNT_NUMBER,
          productName: product.PRODUCT_NAME,
          quantity: parseFloat(product.QUANTITY || 0),
          price: parseFloat(product.PRICE || 0),
          total: parseFloat(product.QUANTITY || 0) * parseFloat(product.PRICE || 0)
        });
      });
    }
  }
  
  return productData;
};
\`\`\`

### CRM - Companies (Client Management)

\`\`\`javascript
// List companies with comprehensive data
await context.queueService.add({
  method: 'crm.company.list',
  params: {
    filter: { 
      ID: [123, 456, 789],           // Specific company IDs
      'COMPANY_TYPE': 'CLIENT'       // Filter by type
    },
    select: [
      'ID', 'TITLE', 'COMPANY_TYPE', 'INDUSTRY', 'EMPLOYEES', 
      'REVENUE', 'PHONE', 'EMAIL', 'WEB', 'ADDRESS',
      'DATE_CREATE', 'DATE_MODIFY', 'ASSIGNED_BY_ID'
    ]
  }
});

// Get detailed company information
await context.queueService.add({
  method: 'crm.company.get',
  params: {
    id: companyId,
    select: ['*']  // All fields including custom fields
  }
});

// Create new company with full details
await context.queueService.add({
  method: 'crm.company.add',
  params: {
    fields: {
      TITLE: 'Tech Solutions Inc',
      COMPANY_TYPE: 'CLIENT',
      INDUSTRY: 'Technology',
      EMPLOYEES: 'EMPLOYEES_51_100',
      PHONE: [{ VALUE: '+1-555-123-4567', VALUE_TYPE: 'WORK' }],
      EMAIL: [{ VALUE: 'contact@techsolutions.com', VALUE_TYPE: 'WORK' }],
      WEB: [{ VALUE: 'https://techsolutions.com', VALUE_TYPE: 'WORK' }],
      ADDRESS: '123 Tech Street, San Francisco, CA 94105'
    }
  }
});

// Update company information
await context.queueService.add({
  method: 'crm.company.update',
  params: {
    id: companyId,
    fields: {
      REVENUE: 'REVENUE_1000000_5000000',
      COMMENTS: 'Upgraded to enterprise client status'
    }
  }
});
\`\`\`

### CRM - Contacts (People Management)

\`\`\`javascript
// List contacts with filtering
await context.queueService.add({
  method: 'crm.contact.list',
  params: {
    filter: { 
      COMPANY_ID: companyId,
      'TYPE_ID': 'CLIENT'
    },
    select: [
      'ID', 'NAME', 'LAST_NAME', 'SECOND_NAME', 'POST', 
      'PHONE', 'EMAIL', 'COMPANY_ID', 'ASSIGNED_BY_ID',
      'DATE_CREATE', 'DATE_MODIFY'
    ]
  }
});

// Get contact with all information
await context.queueService.add({
  method: 'crm.contact.get',
  params: { 
    id: contactId,
    select: ['*']
  }
});

// Create new contact
await context.queueService.add({
  method: 'crm.contact.add',
  params: {
    fields: {
      NAME: 'John',
      LAST_NAME: 'Smith',
      POST: 'CTO',
      COMPANY_ID: companyId,
      PHONE: [{ VALUE: '+1-555-987-6543', VALUE_TYPE: 'WORK' }],
      EMAIL: [{ VALUE: 'john.smith@company.com', VALUE_TYPE: 'WORK' }]
    }
  }
});
\`\`\`

### CRM - Activities (Interaction Tracking)

\`\`\`javascript
// List activities for entity with comprehensive filtering
await context.queueService.add({
  method: 'crm.activity.list',
  params: {
    filter: {
      'OWNER_TYPE_ID': 4,            // 1=Lead, 2=Deal, 3=Contact, 4=Company, 7=Invoice
      'OWNER_ID': entityId,
      '>=DATE_TIME': '2025-01-01',
      'TYPE_ID': [1, 2, 3]          // 1=Call, 2=Meeting, 3=Email
    },
    select: [
      'ID', 'TYPE_ID', 'SUBJECT', 'DESCRIPTION', 'DIRECTION',
      'DATE_TIME', 'CREATED', 'AUTHOR_ID', 'RESPONSIBLE_ID',
      'RESULT_STATUS', 'RESULT_TEXT', 'DURATION'
    ],
    order: { 'DATE_TIME': 'DESC' },
    limit: 20
  }
});

// Create comprehensive activity record
await context.queueService.add({
  method: 'crm.activity.add',
  params: {
    fields: {
      TYPE_ID: 2,                    // Meeting
      SUBJECT: 'Q4 Business Review',
      DESCRIPTION: 'Quarterly review of account performance and 2025 planning',
      OWNER_TYPE_ID: 4,              // Company
      OWNER_ID: companyId,
      DATE_TIME: '2025-10-15 14:00:00',
      RESPONSIBLE_ID: 1,
      DIRECTION: 2,                  // 1=Incoming, 2=Outgoing
      PRIORITY: 2,                   // 1=Low, 2=Normal, 3=High
      LOCATION: 'Conference Room A / Zoom Meeting'
    }
  }
});

// Update activity result
await context.queueService.add({
  method: 'crm.activity.update',
  params: {
    id: activityId,
    fields: {
      RESULT_STATUS: 'COMPLETED',
      RESULT_TEXT: 'Successfully discussed Q4 goals. Client approved budget increase.',
      COMPLETED: 'Y'
    }
  }
});
\`\`\`

### CRM - Deals (Sales Pipeline)

\`\`\`javascript
// List deals in pipeline
await context.queueService.add({
  method: 'crm.deal.list',
  params: {
    filter: {
      'STAGE_ID': ['NEW', 'PREPARATION', 'PROPOSAL', 'NEGOTIATION'],
      '>=DATE_CREATE': '2025-01-01',
      'COMPANY_ID': companyId
    },
    select: [
      'ID', 'TITLE', 'STAGE_ID', 'OPPORTUNITY', 'CURRENCY_ID',
      'COMPANY_ID', 'CONTACT_ID', 'PROBABILITY', 'DATE_CREATE', 'CLOSEDATE'
    ]
  }
});

// Create new deal
await context.queueService.add({
  method: 'crm.deal.add',
  params: {
    fields: {
      TITLE: 'Enterprise Software License',
      STAGE_ID: 'PREPARATION',
      COMPANY_ID: companyId,
      CONTACT_ID: contactId,
      OPPORTUNITY: 50000,
      CURRENCY_ID: 'USD',
      PROBABILITY: 75,
      CLOSEDATE: '2025-12-31'
    }
  }
});
\`\`\`

### CRM - Leads (Lead Management)

\`\`\`javascript
// List active leads
await context.queueService.add({
  method: 'crm.lead.list',
  params: {
    filter: { 
      STATUS_ID: ['NEW', 'IN_PROCESS'],
      'SOURCE_ID': 'WEB'
    },
    select: [
      'ID', 'TITLE', 'NAME', 'LAST_NAME', 'COMPANY_TITLE', 
      'SOURCE_ID', 'STATUS_ID', 'OPPORTUNITY', 'DATE_CREATE'
    ]
  }
});

// Convert lead to deal
await context.queueService.add({
  method: 'crm.lead.convert',
  params: {
    id: leadId,
    fields: {
      CREATE_COMPANY: 'Y',
      CREATE_CONTACT: 'Y',
      CREATE_DEAL: 'Y'
    }
  }
});
\`\`\`

### Messaging & Communication

\`\`\`javascript
// Send bot message to chat or user
await context.queueService.add({
  method: 'imbot.message.add',
  params: {
    DIALOG_ID: 'chat2900',          // or user ID for direct message
    MESSAGE: 'Report generation completed! 📊\\n\\nYour financial analysis is ready for review.'
  }
});

// Get chat message history
// ⚠️ CRITICAL: im.dialog.messages.get does NOT support LAST_ID parameter
// Response is an OBJECT not array - use Object.values() to convert
await context.queueService.add({
  method: 'im.dialog.messages.get',
  params: {
    DIALOG_ID: 'chat2900',
    LIMIT: 100  // Max 100 messages, returns in reverse chronological order
    // NO LAST_ID - parameter not supported by this method
  }
});

// Response structure requires Object.values conversion:
const response = await this.callAPI('im.dialog.messages.get', {
  DIALOG_ID: chatId,
  LIMIT: 100
});

// CRITICAL: result.messages is an OBJECT like {"123": {...}, "124": {...}}
const messagesObj = response?.result?.messages || {};
const messagesArray = Object.values(messagesObj);  // Convert to array

// Delete a bot message (only works for messages sent by the bot itself)
// Use case: Clean up test messages, remove outdated bot responses, implement self-moderation
// NOTE: Requires bot authentication context (not webhook auth). BOT_ID can be omitted if only one bot exists.
await context.queueService.add({
  method: 'imbot.message.delete',
  params: {
    // BOT_ID: Optional - can be omitted if only one bot exists in the portal
    MESSAGE_ID: messageId,  // Message ID to delete
    COMPLETE: 'Y'  // 'Y' = delete completely without traces, 'N' = delete but leave traces (default)
  }
});

// Example: Batch delete multiple bot messages in executionScript
const messagesToDelete = [123, 456, 789];
for (const msgId of messagesToDelete) {
  await this.callAPI('imbot.message.delete', {
    MESSAGE_ID: msgId,
    COMPLETE: 'Y'  // Delete without leaving traces
  });
  this.log('info', 'Bot message deleted', { messageId: msgId });
}

// Start typing indicator
await context.queueService.add({
  method: 'imbot.chat.sendTyping',
  params: {
    DIALOG_ID: 'chat2900'
  }
});

// Stop typing indicator
await context.queueService.add({
  method: 'imbot.chat.stopTyping',
  params: {
    DIALOG_ID: 'chat2900'
  }
});
\`\`\`

### News Feed / Blog Posts

**API Reference**: https://apidocs.bitrix24.com/api-reference/log/index.html

\`\`\`javascript
// Post to company news feed
// 🚨 CRITICAL: OMIT the DEST parameter - bot posts work without it
await context.queueService.add({
  method: 'log.blogpost.add',
  params: {
    POST_TITLE: 'Automated Report Generated',
    POST_MESSAGE: 'Report completed: Q4 Financial Analysis\\n\\nSummary:\\n- Total records: 150\\n- Generated: ' + new Date().toLocaleString(),
    CATEGORY_ID: '1',           // Optional: General category
    // NOTE: Omit DEST parameter entirely - specifying DEST causes 400 errors
    // The bot will post to the feed without explicit destination
    FILES: [fileId1, fileId2]  // Optional: Attach files by their Bitrix24 file IDs
  }
});

// Get news feed posts
await context.queueService.add({
  method: 'log.blogpost.get',
  params: {
    filter: {
      '>DATE_PUBLISH': '2025-01-01',
      '<DATE_PUBLISH': '2025-12-31'
    },
    order: { 'DATE_PUBLISH': 'DESC' },
    start: 0,
    limit: 50
  }
});
\`\`\`

**Why DEST parameter must be omitted:**
- Including \`DEST: ['UA']\` (all users) causes permission error: "Conversation cannot be addressed to all"
- Including \`DEST: ['U<ID>']\` for specific users also fails
- Bot posts work correctly when DEST is completely omitted
- Bitrix24 automatically handles the post destination when DEST is not specified

### User Management & Information

\`\`\`javascript
// Get user information (for attribution and notifications)
await context.queueService.add({
  method: 'user.get',
  params: {
    ID: [594, 686],                // Array of user IDs
    select: [
      'ID', 'NAME', 'LAST_NAME', 'EMAIL', 'WORK_POSITION', 
      'UF_DEPARTMENT', 'ACTIVE', 'LAST_LOGIN'
    ]
  }
});

// Get current user context
await context.queueService.add({
  method: 'user.current',
  params: {}
});

// Search users
await context.queueService.add({
  method: 'user.search',
  params: {
    FILTER: {
      NAME: 'John',
      ACTIVE: 'Y'
    }
  }
});
\`\`\`

### Tasks & Project Management

\`\`\`javascript
// List tasks with comprehensive filtering
await context.queueService.add({
  method: 'tasks.task.list',
  params: {
    filter: {
      'RESPONSIBLE_ID': userId,
      'STATUS': [1, 2, 3],          // New, Pending, In Progress
      '>=DEADLINE': '2025-10-01'
    },
    select: [
      'ID', 'TITLE', 'DESCRIPTION', 'STATUS', 'DEADLINE', 
      'CREATED_BY', 'RESPONSIBLE_ID', 'PRIORITY', 'GROUP_ID'
    ]
  }
});

// Create comprehensive task
await context.queueService.add({
  method: 'tasks.task.add',
  params: {
    fields: {
      TITLE: 'Complete Q4 Financial Analysis',
      DESCRIPTION: 'Analyze revenue trends and prepare executive summary report',
      RESPONSIBLE_ID: userId,
      CREATED_BY: 1,
      DEADLINE: '2025-10-20',
      PRIORITY: 2,                  // 0=Low, 1=Normal, 2=High
      GROUP_ID: projectId,
      TAGS: ['finance', 'quarterly', 'analysis']
    }
  }
});

// Update task progress
await context.queueService.add({
  method: 'tasks.task.update',
  params: {
    taskId: taskId,
    fields: {
      STATUS: 3,                    // In Progress
      ACCOMPLICES: [userId2, userId3], // Additional participants
      AUDITORS: [managerId]         // Observers
    }
  }
});

// Add task comment
await context.queueService.add({
  method: 'task.commentitem.add',
  params: {
    TASKID: taskId,
    FIELDS: {
      POST_MESSAGE: 'Financial data collection completed. Moving to analysis phase.'
    }
  }
});
\`\`\`

### Other Bitrix24 API endpoints, specification, and details here: apidocs.bitrix24.com. Extract the class="dc-toc__content" div fot the table of contents. 

## BaseTaskExecutor Methods Reference

### Core Methods Available in Task Templates

All complex task templates extend \`BaseTaskExecutor\` and have access to these essential methods:

\`\`\`javascript
// Task parameters access - CRITICAL: Always use this.parameters (NOT this.params)
const params = this.getParameters();                    // Get all task parameters
const value = this.parameters.paramName;                // Direct parameter access
const { dateRange } = this.parameters;                  // Destructuring example - use this.parameters

// Progress tracking and logging
await this.updateProgress(percentage, message, step);   // Update execution progress
this.log(level, message, metadata);                     // Structured logging with context
await this.createCheckpoint(stepName, data);            // Create recovery checkpoint

// API calls with rate limiting and tracking
const result = await this.callAPI(method, params);      // Bitrix24 API via queue service
const text = await this.callGemini(prompt, options);    // Gemini AI for analysis

// ⚠️ CRITICAL: callGemini() Model Options (Anti-Hallucination)
// DEFAULT: gemini-2.5-pro (configured in GEMINI_MODEL env var - DO NOT override unless necessary)
// VALID models (2025): gemini-2.5-pro, gemini-2.0-flash-exp, gemini-1.5-pro-latest, gemini-1.5-flash-latest
// ❌ NEVER use: gemini-1.5-pro-002, gemini-1.5-flash-002 (do NOT exist in v1beta API - cause 404 errors)
// ❌ DO NOT hardcode model names - use the default unless you have a specific reason to override
// Examples:
await this.callGemini(prompt);                                         // ✅ CORRECT: Uses default gemini-2.5-pro
await this.callGemini(prompt, { temperature: 0.1, maxTokens: 8192 }); // ✅ CORRECT: Custom params with default
await this.callGemini(prompt, { model: 'gemini-1.5-pro-002' });       // ❌ WRONG: Model doesn't exist, causes 404
await this.callGemini(prompt, { model: 'gemini-2.0-flash-exp' });     // ⚠️  AVOID: Only override if you need faster/cheaper

// Data fetching with automatic pagination
const data = await this.streamingFetch(method, query, {
  batchSize: 50,
  progressCallback: (processed, total) => { /* ... */ }
});

// Task lifecycle management
await this.validateParameters();                        // Validate input parameters
await this.checkCancellation();                         // Check if task was cancelled
const summary = this.getExecutionSummary();             // Get execution metrics

// File upload and storage
const attachment = await this.uploadReport(htmlContent, fileName, metadata);

// Error handling with auto-repair
await this.handleError(error, step);                    // Handle errors with repair
const shouldRepair = this.shouldAttemptAutoRepair(error);

// Custom error throwing
throw new this.TaskError(message, code, step, data);    // Custom task error with metadata

// Testing mode utilities (ONLY for error handling, NOT for limiting data)
const isTestMode = this.isTestingMode();                // Check if in testing mode (for error recovery only)
// NOTE: Do NOT use applyTestingLimits() - testing mode should process FULL data
// Testing mode is ONLY for enabling auto-repair when errors occur
\`\`\`

### Essential BaseTaskExecutor Properties

\`\`\`javascript
// Task context
this.taskId                    // Unique task identifier
this.parameters               // Task input parameters object
this.context                  // Execution context with services
this.template                 // Template definition and metadata
this.testing                  // Boolean: true if in testing mode

// Execution state
this.startTime               // Task start timestamp
this.currentStep             // Current execution step name
this.stepsCompleted         // Number of completed steps
this.stepsTotal             // Total estimated steps

// Resource tracking
this.resourceUsage          // Memory, API calls, tokens, errors
this.resourceUsage.peakMemory
this.resourceUsage.totalApiCalls
this.resourceUsage.geminiTokens
this.resourceUsage.errorCount

// Service connections (available in this.context)
this.queueService           // Bitrix24 API queue service
this.db                     // Firestore database client
this.genAI                  // Google Gemini AI client
this.fileStorage            // Cloud Storage service
this.tools                  // Available tool instances
this.rateLimiters           // Rate limiting services
\`\`\`

### Template Structure Requirements

\`\`\`javascript
// All templates must extend BaseTaskExecutor
class MyTaskExecutor extends BaseTaskExecutor {
  async execute() {
    try {
      // CRITICAL: Always use this.parameters (NOT this.params) for parameter access
      const { dateRange } = this.parameters;  // Correct destructuring

      // Step 1: Validate inputs
      await this.validateParameters();

      // Step 2: Update progress and fetch data
      await this.updateProgress(20, "Fetching data", "fetch_data");
      const data = await this.streamingFetch(/* ... */);

      // Step 3: Process and analyze
      await this.updateProgress(60, "Processing", "analyze");
      const results = this.processData(data);

      // Step 4: Generate output
      await this.updateProgress(90, "Generating report", "generate");
      const report = this.generateHTMLReport(results, this.parameters);
      const attachment = await this.uploadReport(report, 'report.html');

      return {
        success: true,
        summary: "Task completed successfully",
        attachments: [attachment],
        executionTime: Date.now() - this.startTime
      };

    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  // REQUIRED: All templates MUST implement their own generateHTMLReport method
  // This method should return a COMPLETE HTML document (<!DOCTYPE html> to </html>)
  // DO NOT call this.generateHTMLReport() from BaseTaskExecutor - create your own method
  generateHTMLReport(data, params) {
    const { invoices, companies, summary } = data;

    // Build COMPLETE HTML document with TailwindCSS
    const html = \`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Report Title</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        'bitrix-blue': '#0066CC',
                        'bitrix-gray': '#F5F7FA'
                    }
                }
            }
        }
    </script>
</head>
<body class="bg-bitrix-gray p-8">
    <div class="max-w-7xl mx-auto bg-white p-8 rounded-xl shadow-lg">
        <h1 class="text-4xl font-bold text-bitrix-blue mb-6">Report Title</h1>

        <!-- Your report content here -->
        <div class="space-y-6">
            \${invoices.slice(0, 10).map(inv => \`
                <div class="border p-4 rounded">
                    <h3>\${inv.TITLE}</h3>
                    <p>Price: \${inv.PRICE}</p>
                </div>
            \`).join('')}
        </div>
    </div>
</body>
</html>\`;

    // Add testing mode banner if needed
    return this.isTestingMode() ? this.addTestingNotice(html) : html;
  }
}
\`\`\`

### 🚨 CRITICAL: HTML Report Generation Anti-Pattern

**❌ WRONG - DO NOT DO THIS:**
\`\`\`javascript
// This creates nested HTML documents and breaks the report!
buildReportHtml(data) {
  return \`<!DOCTYPE html><html>...</html>\`;  // Complete HTML document
}

async execute() {
  const reportContent = this.buildReportHtml(data);
  // ❌ WRONG: Passing complete HTML to base class method wraps it in ANOTHER HTML document!
  const finalReport = await this.generateHTMLReport('Title', reportContent);
  const attachment = await this.uploadReport(finalReport, 'report.html');
}
\`\`\`

**✅ CORRECT - Create your own generateHTMLReport method:**
\`\`\`javascript
// Pattern 1: Custom generateHTMLReport method (RECOMMENDED)
generateHTMLReport(data, params) {
  const html = \`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Report</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
    <!-- Complete report content -->
    \${data.items.slice(0, 10).map(item => \`<div>...</div>\`).join('')}
</body>
</html>\`;

  return this.isTestingMode() ? this.addTestingNotice(html) : html;
}

async execute() {
  const data = await this.fetchData();
  const report = this.generateHTMLReport(data, this.parameters);  // Call YOUR method
  const attachment = await this.uploadReport(report, 'report.html');
  return { success: true, attachments: [attachment] };
}
\`\`\`

**Why This Matters:**
- BaseTaskExecutor's \`this.generateHTMLReport()\` expects CONTENT, not complete HTML
- If you pass \`<!DOCTYPE html>...\` to it, you get nested HTML documents
- The result is broken HTML where only the testing banner shows
- ALWAYS create your own \`generateHTMLReport()\` method for custom reports

### Testing Mode Behavior

\`\`\`javascript
// Testing mode is ONLY for error recovery/auto-repair
// Testing mode does NOT limit data - always process full datasets
// Testing mode enables automatic template repair when errors occur

if (this.isTestingMode()) {
  // Add small development banner to reports (data is still FULL)
  const htmlWithBanner = this.addTestingNotice(htmlContent);

  // Generate next step prompts after completion
  const prompts = this.generateTestingPrompts(results);

  // When errors occur, auto-repair will trigger automatically
  // No need to manually handle - BaseTaskExecutor handles it
}

// WRONG - DO NOT DO THIS:
// const limitedData = this.applyTestingLimits(data, 10); // ❌ This method was removed
// Testing mode processes FULL data, not limited data
\`\`\`

## Template Integration Patterns

### 1. Streaming Data Fetching for Large Datasets

\`\`\`javascript
// In your task template execution script - use built-in streamingFetch
const invoices = await this.streamingFetch('crm.invoice.list', {
  filter: {
    'STATUS_ID': ['N', 'S'],
    '>=DATE_INSERT': params.dateRange.start,
    '<=DATE_INSERT': params.dateRange.end
  },
  select: ['ID', 'INVOICE_ID', 'STATUS_ID', 'PRICE', 'CURRENCY', 'DATE_CREATE']
}, {
  batchSize: 50,                   // Fetch 50 records at a time
  progressCallback: (processed, estimated) => {
    this.updateProgress(
      20 + (processed / estimated) * 30, 
      \`Processed \${processed} invoices\`, 
      "fetch_invoices"
    );
  }
});
\`\`\`

### 2. Direct API Calls for Single Operations

\`\`\`javascript
// Direct call through context.queueService
const response = await context.queueService.add({
  method: 'crm.company.get',
  params: { id: companyId }
});

// Or using the callAPI helper method
const company = await this.callAPI('crm.company.get', {
  id: companyId,
  select: ['TITLE', 'INDUSTRY', 'PHONE', 'EMAIL']
});
\`\`\`

### 3. Efficient Batch Operations

\`\`\`javascript
// Step 1: Extract unique IDs from primary dataset
const companyIds = [...new Set(invoices.map(inv => inv.UF_COMPANY_ID).filter(Boolean))];
const contactIds = [...new Set(invoices.map(inv => inv.UF_CONTACT_ID).filter(Boolean))];

// Step 2: Batch fetch related entities in parallel
const [companies, contacts] = await Promise.all([
  this.streamingFetch('crm.company.list', {
    filter: { ID: companyIds },
    select: ['ID', 'TITLE', 'INDUSTRY', 'PHONE', 'EMAIL']
  }, { batchSize: 50 }),
  
  this.streamingFetch('crm.contact.list', {
    filter: { ID: contactIds },
    select: ['ID', 'NAME', 'LAST_NAME', 'POST', 'PHONE', 'EMAIL']
  }, { batchSize: 50 })
]);

// Step 3: Create lookup maps for fast O(1) access
const companyMap = new Map(companies.map(comp => [comp.ID, comp]));
const contactMap = new Map(contacts.map(contact => [contact.ID, contact]));

// Step 4: Enrich original data efficiently
const enrichedInvoices = invoices.map(invoice => ({
  ...invoice,
  company: companyMap.get(invoice.UF_COMPANY_ID),
  contact: contactMap.get(invoice.UF_CONTACT_ID)
}));
\`\`\`

### 4. Conditional API Processing

\`\`\`javascript
// Only fetch activities if explicitly requested
if (params.includeActivities) {
  for (let i = 0; i < invoices.length; i++) {
    const invoice = invoices[i];
    
    // Check for cancellation during long operations
    await this.checkCancellation();
    
    if (invoice.UF_COMPANY_ID) {
      try {
        const activities = await this.callAPI('crm.activity.list', {
          filter: {
            'OWNER_TYPE_ID': 4,      // Company
            'OWNER_ID': invoice.UF_COMPANY_ID
          },
          select: ['ID', 'TYPE_ID', 'SUBJECT', 'DATE_TIME'],
          order: { 'DATE_TIME': 'DESC' },
          limit: params.activityLimit || 3
        });
        
        invoice.activities = activities.result || [];
      } catch (error) {
        this.log('warn', 'Failed to fetch activities', { 
          invoiceId: invoice.ID, 
          error: error.message 
        });
        invoice.activities = [];
      }
    }
    
    // Update progress periodically
    if (i % 10 === 0) {
      const progress = 70 + ((i / invoices.length) * 20);
      await this.updateProgress(progress, 
        \`Processed activities for \${i + 1}/\${invoices.length} invoices\`, 
        "fetch_activities");
    }
  }
}
\`\`\`

## Error Handling & Best Practices

### 1. Rate Limit Management

**🚨 CRITICAL: NEVER catch rate limit errors in loops - ALWAYS propagate them!**

BaseTaskExecutor's \`callAPI()\` method includes built-in exponential backoff (lines 317-326 in lib/baseTaskExecutor.js). When you catch rate limit errors, you prevent this automatic retry mechanism from working, causing infinite loops.

#### ✅ CORRECT Pattern - Let Rate Limits Propagate

\`\`\`javascript
// ✅ CORRECT: In loops with many API calls, ONLY catch non-rate-limit errors
for (const invoiceId of invoiceIds) {
  // CRITICAL: Add cancellation check in all tight loops
  await this.checkCancellation();

  try {
    const invoice = await this.callAPI('crm.invoice.get', { id: invoiceId });
    // Process invoice data...
  } catch (error) {
    // CRITICAL: NEVER catch rate limit errors - let them propagate!
    if (error.message && (error.message.includes('rate limit') || error.message.includes('429'))) {
      this.log('warn', 'Rate limit hit, propagating for automatic backoff', { invoiceId });
      throw error; // ← CRITICAL: Propagate to trigger exponential backoff
    }

    // Only catch non-rate-limit errors (missing data, permissions, etc.)
    this.log('warn', 'Failed to fetch invoice', { invoiceId, error: error.message });
    // Continue processing other invoices
  }
}
\`\`\`

#### ❌ WRONG Pattern - Catching Rate Limits Causes Infinite Loops

\`\`\`javascript
// ❌ WRONG: Catching ALL errors including rate limits causes infinite loops!
for (const invoiceId of invoiceIds) {
  try {
    const invoice = await this.callAPI('crm.invoice.get', { id: invoiceId });
    // Process invoice...
  } catch (error) {
    // ❌ BUG: This catches rate limit errors and continues looping
    // ❌ Result: Loop retries same invoices forever when rate limited
    this.log('warn', 'Error fetching invoice', { error: error.message });
    // Loop continues, hits rate limit again, catches error, repeats infinitely
  }
}
\`\`\`

**Why This Causes Infinite Loops:**
1. Loop makes rapid API calls → hits Bitrix24 rate limit (2 req/sec)
2. Try/catch catches rate limit error and logs it
3. Loop continues to next iteration immediately
4. Next API call also rate limited → caught → loop continues
5. Progress never advances → infinite loop detected

**Built-in Exponential Backoff (BaseTaskExecutor lines 322-326):**
\`\`\`javascript
// Exponential backoff for rate limits
if (error.message.includes('rate limit') || error.message.includes('429')) {
  await this.exponentialBackoff(processed);
  continue; // Retry same batch after delay
}
\`\`\`

#### Queue Service Rate Limit Handling

\`\`\`javascript
// Queue service errors - these should propagate naturally
try {
  const result = await this.callAPI('crm.invoice.list', params);
  // Process results...
} catch (error) {
  if (error.code === 'QUEUE_FULL') {
    // Queue at capacity - let it propagate
    throw new Error('System temporarily busy. Please try again.');
  }

  // All other errors including rate limits should propagate
  throw error;
}
\`\`\`

### 2. Response Validation & Debugging

\`\`\`javascript
const companies = await this.streamingFetch('crm.company.list', {
  filter: { ID: companyIds }
});

// Always validate API responses
if (!Array.isArray(companies)) {
  throw new Error('Invalid company data received from Bitrix24 API');
}

// Log for debugging and monitoring
this.log('info', 'Companies fetched successfully', { 
  requested: companyIds.length,
  received: companies.length,
  sampleCompany: companies[0] || 'none',
  missingIds: companyIds.filter(id => !companies.find(c => c.ID === id))
});

// Handle partial results gracefully
if (companies.length < companyIds.length) {
  this.log('warn', 'Some companies not found', {
    requested: companyIds.length,
    found: companies.length
  });
}
\`\`\`

### 3. Authentication Context Management

The queue service automatically handles authentication:
- **Bot tokens** from incoming webhooks (refreshed automatically)
- **User context** from the original message
- **Domain-specific** REST endpoints
- **Fallback mechanisms** for token expiration

## Common Data Formats & Extraction

### Phone & Email Field Processing

\`\`\`javascript
// Bitrix24 returns phone/email as arrays - extract helper functions
extractPhoneNumber(phoneData) {
  try {
    if (!phoneData) return '';
    
    // Handle string format
    if (typeof phoneData === 'string') {
      return phoneData;
    }
    
    // Handle array format: [{"ID": "123", "VALUE": "+1234567890", "VALUE_TYPE": "WORK"}]
    if (Array.isArray(phoneData) && phoneData.length > 0) {
      const firstPhone = phoneData[0];
      if (firstPhone && typeof firstPhone === 'object' && firstPhone.VALUE) {
        return firstPhone.VALUE;
      }
    }
    
    return '';
  } catch (error) {
    this.log('warn', 'Phone extraction failed', { phoneData, error: error.message });
    return '';
  }
}

extractEmailAddress(emailData) {
  try {
    if (!emailData) return '';
    
    if (typeof emailData === 'string') {
      return emailData;
    }
    
    if (Array.isArray(emailData) && emailData.length > 0) {
      const firstEmail = emailData[0];
      if (firstEmail && typeof firstEmail === 'object' && firstEmail.VALUE) {
        return firstEmail.VALUE;
      }
    }
    
    return '';
  } catch (error) {
    this.log('warn', 'Email extraction failed', { emailData, error: error.message });
    return '';
  }
}
\`\`\`

### Date Handling & Calculations

\`\`\`javascript
// Safe date parsing with error handling
parseDate(dateString, fallback = null) {
  try {
    if (!dateString) return fallback;
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      this.log('warn', 'Invalid date format', { dateString });
      return fallback;
    }
    
    return date;
  } catch (error) {
    this.log('warn', 'Date parsing error', { dateString, error: error.message });
    return fallback;
  }
}

// Calculate business metrics
calculateDaysOld(createDate) {
  const date = this.parseDate(createDate);
  if (!date) return 0;
  
  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays); // Ensure non-negative
}
\`\`\`

### Status Code & ID Mappings

\`\`\`javascript
// Invoice status mappings
const INVOICE_STATUS = {
  'N': 'New',
  'S': 'Sent', 
  'P': 'Paid',
  'D': 'Draft',
  'C': 'Cancelled'
};

// Entity type IDs for activities
const ENTITY_TYPES = {
  LEAD: 1,
  DEAL: 2, 
  CONTACT: 3,
  COMPANY: 4,
  INVOICE: 7
};

// Activity types
const ACTIVITY_TYPES = {
  CALL: 1,
  MEETING: 2,
  EMAIL: 3,
  TASK: 4
};

// Deal stages (customizable per Bitrix24 instance)
const DEAL_STAGES = {
  'NEW': 'New Opportunity',
  'PREPARATION': 'Preparing Proposal',
  'PROPOSAL': 'Proposal Sent',
  'NEGOTIATION': 'In Negotiation',
  'CONTRACT': 'Contract Stage',
  'WON': 'Closed Won',
  'LOST': 'Closed Lost'
};
\`\`\`

## Complete Template Structure Example

Based on the working \`bitrixOpenInvoicesTemplate.js\`:

\`\`\`javascript
const myCustomTemplate = {
  templateId: 'my_custom_bitrix_report',
  name: 'My Custom Bitrix Report',
  description: 'Custom financial analysis with client data integration',
  
  triggers: {
    patterns: [/custom.*report/i, /financial.*analysis/i],
    keywords: ['custom', 'report', 'financial', 'analysis'],
    contexts: ['financial', 'reporting']
  },
  
  definition: {
    estimatedDuration: 1200000, // 20 minutes
    requiredServices: ['queueService', 'fileStorage'],
    memoryRequirement: '1GB'
  },
  
  executionScript: \`
class MyCustomReportExecutor extends BaseTaskExecutor {
  async execute() {
    try {
      // CRITICAL: Always use this.parameters (NOT this.params) for parameter access
      const { dateRange } = this.parameters;  // Correct destructuring
      
      await this.validateParameters();
      
      // Step 1: Fetch primary data with progress tracking
      await this.updateProgress(20, "Fetching invoice data", "fetch_invoices");
      
      const invoices = await this.streamingFetch('crm.invoice.list', {
        filter: {
          'STATUS_ID': ['N', 'S'],
          '>=DATE_INSERT': this.parameters.dateRange.start,
          '<=DATE_INSERT': this.parameters.dateRange.end
        },
        select: ['ID', 'PRICE', 'STATUS_ID', 'UF_COMPANY_ID', 'UF_CONTACT_ID']
      }, {
        batchSize: 50,
        progressCallback: (processed, total) => {
          this.updateProgress(20 + (processed / total) * 20, 
            \`Processed \${processed} invoices\`, "fetch_invoices");
        }
      });
      
      // Step 2: Enrich with related data
      await this.updateProgress(50, "Enriching with client data", "enrich_data");
      
      const companyIds = [...new Set(invoices.map(inv => inv.UF_COMPANY_ID).filter(Boolean))];
      const companies = await this.streamingFetch('crm.company.list', {
        filter: { ID: companyIds },
        select: ['ID', 'TITLE', 'INDUSTRY', 'PHONE', 'EMAIL']
      });
      
      // Step 3: Process and analyze
      await this.updateProgress(80, "Processing analysis", "analyze");
      
      const results = this.processData(invoices, companies);
      
      // Step 4: Generate output
      await this.updateProgress(95, "Generating report", "generate");
      
      const report = this.generateReport(results);
      const attachment = await this.uploadReport(report, 'custom_report.html');
      
      return {
        success: true,
        summary: \`Analyzed \${invoices.length} invoices across \${companies.length} companies\`,
        attachments: [attachment],
        executionTime: Date.now() - this.startTime
      };
      
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }
  
  processData(invoices, companies) {
    // Create company lookup
    const companyMap = new Map(companies.map(c => [c.ID, c]));
    
    // Enrich and analyze
    const enrichedData = invoices.map(invoice => ({
      ...invoice,
      company: companyMap.get(invoice.UF_COMPANY_ID),
      amount: parseFloat(invoice.PRICE || 0)
    }));
    
    // Calculate metrics
    const totalRevenue = enrichedData.reduce((sum, inv) => sum + inv.amount, 0);
    const avgInvoice = totalRevenue / enrichedData.length;
    
    return {
      invoices: enrichedData,
      metrics: { totalRevenue, avgInvoice, count: enrichedData.length }
    };
  }
}
\`
};
\`\`\`

## Performance & Security Guidelines

### 1. Resource Management
- Use streaming for datasets > 100 records
- Implement progress callbacks for user feedback
- Set reasonable API call limits per template
- Use \`checkCancellation()\` in long loops

### 2. Input Sanitization
\`\`\`javascript
// Always validate user inputs
const sanitizedId = parseInt(userProvidedId);
if (isNaN(sanitizedId) || sanitizedId <= 0) {
  throw new Error('Invalid ID provided');
}

// Sanitize date inputs
const dateRegex = /^\\d{4}-\\d{2}-\\d{2}$/;
if (!dateRegex.test(userDate)) {
  throw new Error('Invalid date format. Use YYYY-MM-DD');
}
\`\`\`

### 3. Comprehensive Logging
\`\`\`javascript
// Debug API calls with structured logging
this.log('info', 'Starting API call', { 
  method: 'crm.company.list',
  filterCount: Object.keys(filter).length,
  expectedResults: companyIds.length
});

// Log results with metrics
this.log('info', 'API call completed', { 
  method: 'crm.company.list',
  requested: companyIds.length,
  received: companies.length,
  duration: Date.now() - startTime
});

// Error logging with context
this.log('error', 'API call failed', {
  method: 'crm.company.list',
  error: error.message,
  retryAttempt: attemptNumber,
  filterUsed: filter
});
\`\`\`

This comprehensive guide provides everything needed to create robust, efficient task templates that leverage the full power of the Bitrix24 API through the Chantilly queue service system.

---

## Complete Working Template Reference

The following is the complete 936-line working template \`bitrixOpenInvoicesTemplate.js\` that demonstrates every aspect of user intent extraction, API calls, and HTML generation:

\`\`\`javascript
/**
 * COMPLETE WORKING TEMPLATE - bitrixOpenInvoicesTemplate.js
 * 
 * HOW IT WORKS:
 * 1. USER INTENT EXTRACTION: Uses regex patterns to detect "open invoices report" requests
 * 2. PARAMETER EXTRACTION: AI-powered date range detection from user messages  
 * 3. API ORCHESTRATION: Streaming calls to fetch invoices → companies → contacts → activities
 * 4. DATA ENRICHMENT: Joins related entities and calculates summary statistics
 * 5. HTML GENERATION: Professional Tailwind CSS report with clickable links and responsive design
 */

const bitrixOpenInvoicesTemplate = {
  // METADATA - Template classification and identification
  templateId: 'bitrix_open_invoices_old_report',
  name: 'Bitrix24 Open Invoices (Old) Report',
  description: 'Generate comprehensive HTML report of open invoices with customer information and activity timeline',
  version: '1.0.0',
  category: ['financial_reporting', 'crm', 'bitrix24'],
  enabled: true,
  
  // USER INTENT DETECTION - How AI recognizes when to use this template
  triggers: {
    patterns: [
      /open.*invoices?.*report/i,                                    // "open invoices report"
      /generate.*report.*(?:of.*)?(?:all.*)?open.*invoices?/i,      // "generate report of open invoices"
      /outstanding.*invoices?/i,                                     // "outstanding invoices"  
      /unpaid.*invoices?.*report/i,                                 // "unpaid invoices report"
      /create.*invoices?.*report/i                                  // "create invoices report"
    ],
    keywords: ['open', 'invoices', 'report', 'outstanding', 'unpaid', 'bitrix', 'generate', 'create'],
    contexts: ['financial', 'reporting', 'crm', 'invoice_management']
  },
  
  // TEMPLATE DEFINITION - Execution requirements and parameter schema
  definition: {
    estimatedSteps: 8,
    estimatedDuration: 1800000, // 30 minutes
    memoryRequirement: '1GB',
    requiredServices: ['queueService', 'fileStorage'],
    
    // PARAMETER EXTRACTION SCHEMA - How AI extracts parameters from user messages
    parameterSchema: {
      type: 'object',
      required: [],
      properties: {
        dateRange: {
          type: 'object',
          properties: {
            start: { type: 'string', format: 'date', description: 'Start date for invoice creation filter' },
            end: { type: 'string', format: 'date', description: 'End date for invoice creation filter' }
          },
          default: {
            start: 'auto_detect_from_message', // AI extracts "last 30 days", "this month", etc.
            end: 'auto_today'
          }
        },
        invoiceStatuses: {
          type: 'array',
          items: { type: 'string' },
          default: ['N', 'S'] // N = New, S = Sent (open invoices)
        },
        includeActivities: {
          type: 'boolean',
          default: true
        },
        activityLimit: {
          type: 'number',
          minimum: 1,
          maximum: 10,
          default: 3
        }
      }
    }
  },
  
  // EXECUTION SCRIPT - The complete implementation
  executionScript: \`
class BitrixOpenInvoicesExecutor extends BaseTaskExecutor {
  async execute() {
    try {
      // STEP 1: Parameter validation and preprocessing
      await this.validateParameters();
      await this.updateProgress(5, "Initializing open invoices report", "initialize");
      
      const params = await this.preprocessParameters(this.parameters);
      const reportData = {
        invoices: [],
        companies: new Map(),
        contacts: new Map(), 
        activities: new Map(),
        summary: {},
        generatedAt: new Date().toISOString()
      };

      this.log('info', 'Starting open invoices report', { 
        dateRange: params.dateRange,
        statuses: params.invoiceStatuses 
      });

      // STEP 2: FETCH INVOICES - Streaming API call with pagination
      await this.updateProgress(15, "Fetching open invoices from Bitrix24", "fetch_invoices");
      
      const invoices = await this.streamingFetch('crm.invoice.list', {
        filter: {
          'STATUS_ID': params.invoiceStatuses,      // Filter by status (N=New, S=Sent)
          '>=DATE_INSERT': params.dateRange.start,  // Date range filtering
          '<=DATE_INSERT': params.dateRange.end
        },
        select: [
          'ID', 'INVOICE_ID', 'STATUS_ID', 'PRICE', 'CURRENCY', 'DATE_CREATE', 
          'DATE_INSERT', 'UF_COMPANY_ID', 'UF_CONTACT_ID', 'TITLE', 'COMMENTS'
        ],
        order: { 'DATE_INSERT': 'DESC' }
      }, {
        batchSize: 50,                              // Process 50 invoices at a time
        progressCallback: (processed, estimated) => {
          this.updateProgress(15 + Math.min(20, (processed / Math.max(estimated, 100)) * 20), 
            \`Processed \${processed} invoices\`, "fetch_invoices");
        }
      });

      reportData.invoices = invoices;
      this.log('info', 'Invoices fetched', { count: invoices.length });

      // STEP 3: EXTRACT RELATED ENTITY IDs - Efficient batch processing
      await this.updateProgress(40, "Identifying related companies and contacts", "extract_ids");
      
      const companyIds = [...new Set(invoices.map(inv => inv.UF_COMPANY_ID).filter(Boolean))];
      const contactIds = [...new Set(invoices.map(inv => inv.UF_CONTACT_ID).filter(Boolean))];

      this.log('info', 'Related entities identified', { 
        companies: companyIds.length,
        contacts: contactIds.length
      });

      // STEP 4: FETCH COMPANIES - Batch lookup for efficiency
      if (companyIds.length > 0) {
        await this.updateProgress(50, "Fetching company information", "fetch_companies");
        
        const companies = await this.streamingFetch('crm.company.list', {
          filter: { ID: companyIds },
          select: [
            'ID', 'TITLE', 'COMPANY_TYPE', 'INDUSTRY', 'EMPLOYEES',
            'REVENUE', 'PHONE', 'EMAIL', 'WEB', 'ADDRESS'
          ]
        }, { batchSize: 50 });

        companies.forEach(company => {
          reportData.companies.set(company.ID, company);
        });
        
        this.log('info', 'Companies fetched', { count: companies.length });
      }

      // STEP 5: FETCH CONTACTS - Batch lookup for efficiency  
      if (contactIds.length > 0) {
        await this.updateProgress(60, "Fetching contact information", "fetch_contacts");
        
        const contacts = await this.streamingFetch('crm.contact.list', {
          filter: { ID: contactIds },
          select: [
            'ID', 'NAME', 'LAST_NAME', 'SECOND_NAME', 'POST', 
            'PHONE', 'EMAIL', 'COMPANY_ID', 'ASSIGNED_BY_ID'
          ]
        }, { batchSize: 50 });

        contacts.forEach(contact => {
          reportData.contacts.set(contact.ID, contact);
        });
        
        this.log('info', 'Contacts fetched', { count: contacts.length });
      }

      // STEP 6: FETCH ACTIVITIES - Related activities for each invoice
      if (params.includeActivities) {
        await this.updateProgress(70, "Fetching client activities", "fetch_activities");
        
        for (let i = 0; i < invoices.length; i++) {
          await this.checkCancellation(); // Check for task cancellation
          
          const invoice = invoices[i];
          let allActivities = [];
          
          try {
            // Fetch company activities
            if (invoice.UF_COMPANY_ID && invoice.UF_COMPANY_ID !== '0') {
              const companyActivities = await this.callAPI('crm.activity.list', {
                filter: {
                  'OWNER_TYPE_ID': 4,           // Company entity type
                  'OWNER_ID': invoice.UF_COMPANY_ID
                },
                select: ['ID', 'TYPE_ID', 'SUBJECT', 'DESCRIPTION', 'DATE_TIME', 'CREATED'],
                order: { 'DATE_TIME': 'DESC' },
                limit: params.activityLimit
              });

              if (companyActivities?.result) {
                allActivities = allActivities.concat(companyActivities.result);
              }
            }

            // Fetch contact activities
            if (invoice.UF_CONTACT_ID && invoice.UF_CONTACT_ID !== '0') {
              const contactActivities = await this.callAPI('crm.activity.list', {
                filter: {
                  'OWNER_TYPE_ID': 3,           // Contact entity type
                  'OWNER_ID': invoice.UF_CONTACT_ID
                },
                select: ['ID', 'TYPE_ID', 'SUBJECT', 'DESCRIPTION', 'DATE_TIME', 'CREATED'],
                order: { 'DATE_TIME': 'DESC' },
                limit: params.activityLimit
              });

              if (contactActivities?.result) {
                allActivities = allActivities.concat(contactActivities.result);
              }
            }

            // Sort and limit activities
            if (allActivities.length > 0) {
              allActivities.sort((a, b) => new Date(b.DATE_TIME) - new Date(a.DATE_TIME));
              allActivities = allActivities.slice(0, params.activityLimit);
              reportData.activities.set(invoice.ID, allActivities);
            }
          } catch (error) {
            this.log('warn', 'Failed to fetch activities for invoice', { 
              invoiceId: invoice.ID, 
              error: error.message 
            });
          }

          // Update progress periodically
          if (i % 10 === 0) {
            const progress = 70 + ((i / invoices.length) * 15);
            await this.updateProgress(progress, 
              \`Fetched activities for \${i + 1}/\${invoices.length} invoices\`, 
              "fetch_activities");
          }
        }
      }

      // STEP 7: GENERATE SUMMARY STATISTICS
      await this.updateProgress(90, "Generating report summary", "generate_summary");
      reportData.summary = this.generateSummary(reportData, params);

      // STEP 8: GENERATE HTML REPORT AND UPLOAD
      await this.updateProgress(95, "Uploading report to cloud storage", "upload_report");
      
      const htmlReport = this.generateHTMLReport(reportData, params);
      const reportAttachment = await this.uploadReport(
        htmlReport,
        'bitrix_open_invoices_report.html',
        {
          reportType: 'open_invoices',
          invoiceCount: reportData.invoices.length,
          dateRange: params.dateRange
        }
      );

      return {
        success: true,
        summary: \`Generated report for \${reportData.invoices.length} open invoices\`,
        reportData: reportData.summary,
        attachments: [reportAttachment],
        executionTime: Date.now() - this.startTime
      };

    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  // PARAMETER PREPROCESSING - Handle AI parameter extraction
  async preprocessParameters(params) {
    const processed = { ...params };
    
    // Apply schema defaults
    processed.includeActivities = processed.includeActivities !== undefined ? processed.includeActivities : true;
    processed.activityLimit = processed.activityLimit || 3;
    
    // Handle AI date range detection
    if (!processed.dateRange) {
      processed.dateRange = {
        start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
      };
    }
    
    // AI-powered date extraction from user message
    if (processed.dateRange.start === "auto_detect_from_message") {
      try {
        const detectedRange = await this.extractDateRangeFromMessage();
        processed.dateRange.start = detectedRange.start;
        processed.dateRange.end = detectedRange.end;
        
        this.log('info', 'AI-detected date range from message', {
          detectedStart: detectedRange.start,
          detectedEnd: detectedRange.end
        });
      } catch (error) {
        this.log('warn', 'Failed to detect date range, using 90-day default', {
          error: error.message
        });
        // Fallback to 90 days
        processed.dateRange.start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        processed.dateRange.end = new Date().toISOString().split('T')[0];
      }
    }
    
    return processed;
  }

  // AI DATE RANGE EXTRACTION - Parse user messages for time periods
  async extractDateRangeFromMessage() {
    const userMessage = this.context.userMessage || this.context.description || '';
    
    if (!userMessage) {
      throw new Error('No user message available for date range detection');
    }

    // Simple pattern matching for common time expressions
    const today = new Date();
    
    // "last 30 days", "past 30 days"
    const daysMatch = userMessage.match(/(?:last|past|in the last)\s+(\d+)\s+days?/i);
    if (daysMatch) {
      const days = parseInt(daysMatch[1]);
      return {
        days: days,
        start: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end: today.toISOString().split('T')[0],
        detected: \`last \${days} days\`
      };
    }

    // "this month"
    if (/this month/i.test(userMessage)) {
      const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      return {
        days: Math.floor((today - thisMonthStart) / (1000 * 60 * 60 * 24)),
        start: thisMonthStart.toISOString().split('T')[0],
        end: today.toISOString().split('T')[0],
        detected: 'this month'
      };
    }

    // "this year" 
    if (/this year/i.test(userMessage)) {
      return {
        days: Math.floor((today - new Date(today.getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24)),
        start: \`\${today.getFullYear()}-01-01\`,
        end: today.toISOString().split('T')[0],
        detected: 'this year'
      };
    }

    // Default to 90 days
    return {
      days: 90,
      start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      end: today.toISOString().split('T')[0],
      detected: 'recent (default 90 days)'
    };
  }

  // SUMMARY STATISTICS GENERATION
  generateSummary(reportData, params) {
    const { invoices } = reportData;
    
    const summary = {
      totalInvoices: invoices.length,
      totalAmount: 0,
      currencies: new Map(),
      statusBreakdown: new Map(),
      averageAmount: 0,
      companiesCount: reportData.companies.size,
      contactsCount: reportData.contacts.size
    };

    invoices.forEach(invoice => {
      const amount = parseFloat(invoice.PRICE || 0);
      summary.totalAmount += amount;
      
      // Currency breakdown
      const currency = invoice.CURRENCY || 'USD';
      summary.currencies.set(currency, (summary.currencies.get(currency) || 0) + amount);
      
      // Status breakdown
      const status = invoice.STATUS_ID;
      summary.statusBreakdown.set(status, (summary.statusBreakdown.get(status) || 0) + 1);
    });

    summary.averageAmount = summary.totalAmount / Math.max(invoices.length, 1);
    return summary;
  }

  // HTML REPORT GENERATION - Professional Tailwind CSS styling
  generateHTMLReport(reportData, params) {
    const { invoices, companies, contacts, activities, summary } = reportData;
    
    return \`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bitrix24 Open Invoices Report</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        'bitrix-blue': '#0066CC',
                        'bitrix-light-blue': '#E6F3FF',
                        'bitrix-gray': '#F5F7FA',
                        'bitrix-border': '#E0E6ED'
                    }
                }
            }
        }
    </script>
    <style>
        .bitrix-card {
            background: linear-gradient(145deg, #ffffff 0%, #f8fafc 100%);
            border: 1px solid #e0e6ed;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }
        .bitrix-header {
            background: linear-gradient(135deg, #0066CC 0%, #004999 100%);
        }
        .status-new { background-color: #fef3c7; color: #92400e; }
        .status-sent { background-color: #dbeafe; color: #1e40af; }
        .invoice-link {
            color: #0066CC;
            text-decoration: none;
            transition: color 0.2s;
        }
        .invoice-link:hover {
            color: #004999;
            text-decoration: underline;
        }
    </style>
</head>
<body class="bg-bitrix-gray min-h-screen">
    <!-- HEADER SECTION -->
    <div class="bitrix-header text-white shadow-lg">
        <div class="max-w-7xl mx-auto px-4 py-6">
            <div class="flex items-center justify-between">
                <div>
                    <h1 class="text-3xl font-bold">Open Invoices Report</h1>
                    <p class="text-blue-100 mt-1">Generated on \${new Date(reportData.generatedAt).toLocaleString()}</p>
                </div>
                <div class="text-right">
                    <div class="text-2xl font-bold">\${summary.totalInvoices}</div>
                    <div class="text-blue-100">Open Invoices</div>
                </div>
            </div>
        </div>
    </div>

    <!-- SUMMARY DASHBOARD -->
    <div class="max-w-7xl mx-auto px-4 py-6">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div class="bitrix-card rounded-lg p-6">
                <div class="flex items-center">
                    <div class="text-3xl font-bold text-bitrix-blue">\${summary.totalInvoices}</div>
                    <div class="ml-3">
                        <div class="text-sm font-medium text-gray-700">Total Invoices</div>
                        <div class="text-xs text-gray-500">Open & Outstanding</div>
                    </div>
                </div>
            </div>
            
            <div class="bitrix-card rounded-lg p-6">
                <div class="flex items-center">
                    <div class="text-3xl font-bold text-green-600">$\${summary.totalAmount.toLocaleString()}</div>
                    <div class="ml-3">
                        <div class="text-sm font-medium text-gray-700">Total Amount</div>
                        <div class="text-xs text-gray-500">Outstanding Value</div>
                    </div>
                </div>
            </div>
            
            <div class="bitrix-card rounded-lg p-6">
                <div class="flex items-center">
                    <div class="text-3xl font-bold text-orange-600">$\${Math.round(summary.averageAmount).toLocaleString()}</div>
                    <div class="ml-3">
                        <div class="text-sm font-medium text-gray-700">Average Invoice</div>
                        <div class="text-xs text-gray-500">Per Invoice</div>
                    </div>
                </div>
            </div>
            
            <div class="bitrix-card rounded-lg p-6">
                <div class="flex items-center">
                    <div class="text-3xl font-bold text-bitrix-blue">\${summary.companiesCount + summary.contactsCount}</div>
                    <div class="ml-3">
                        <div class="text-sm font-medium text-gray-700">Clients</div>
                        <div class="text-xs text-gray-500">Companies & Contacts</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- INVOICE DETAILS -->
        <div class="space-y-6">
            <h2 class="text-2xl font-bold text-gray-900 mb-4">Invoice Details</h2>
            
\${invoices.map(invoice => this.generateInvoiceCard(invoice, companies, contacts, activities)).join('')}
        </div>
    </div>
</body>
</html>\`;
  }

  // INDIVIDUAL INVOICE CARD GENERATION
  generateInvoiceCard(invoice, companies, contacts, activities) {
    const company = companies.get(invoice.UF_COMPANY_ID);
    const contact = contacts.get(invoice.UF_CONTACT_ID);
    const invoiceActivities = activities.get(invoice.ID) || [];
    
    const statusClass = invoice.STATUS_ID === 'N' ? 'status-new' : 'status-sent';
    const statusText = invoice.STATUS_ID === 'N' ? 'New' : 'Sent';
    
    // Calculate days old
    let daysOld = 0;
    try {
      const insertDate = new Date(invoice.DATE_INSERT || invoice.DATE_CREATE);
      if (!isNaN(insertDate.getTime())) {
        daysOld = Math.floor((Date.now() - insertDate.getTime()) / (1000 * 60 * 60 * 24));
        daysOld = Math.max(0, daysOld);
      }
    } catch (error) {
      daysOld = 0;
    }
    
    // Generate Bitrix24 invoice URL
    const invoiceUrl = \`https://your-domain.bitrix24.com/crm/invoice/show/\${invoice.ID}/\`;
    
    return \`
    <div class="bitrix-card rounded-lg p-6 hover:shadow-lg transition-shadow duration-200">
        <!-- INVOICE HEADER with clickable link -->
        <div class="flex items-start justify-between mb-4">
            <div class="flex-1">
                <div class="flex items-center space-x-3">
                    <h3 class="text-xl font-semibold">
                        <a href="\${invoiceUrl}" 
                           target="_blank" 
                           class="invoice-link"
                           title="Open invoice in Bitrix24">
                            Invoice #\${invoice.INVOICE_ID || invoice.ID}
                        </a>
                    </h3>
                    <span class="px-3 py-1 rounded-full text-sm font-medium \${statusClass}">\${statusText}</span>
                </div>
                <p class="text-sm text-gray-600 mt-1">\${invoice.TITLE || 'No title'}</p>
            </div>
            <div class="text-right">
                <div class="text-2xl font-bold text-bitrix-blue">\${invoice.CURRENCY || 'USD'} \${parseFloat(invoice.PRICE || 0).toLocaleString()}</div>
                <div class="text-sm text-gray-600">\${daysOld} days old</div>
            </div>
        </div>

        <!-- CLIENT INFORMATION -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4">
            <div class="space-y-2">
                <h4 class="font-medium text-gray-900">Client Information</h4>
                \${company ? \`
                <div class="bg-bitrix-light-blue rounded-lg p-3">
                    <div class="font-medium text-bitrix-blue">\${company.TITLE}</div>
                    \${company.INDUSTRY ? \`<div class="text-sm text-gray-600">Industry: \${company.INDUSTRY}</div>\` : ''}
                    \${company.PHONE ? \`<div class="text-sm text-gray-600">Phone: \${this.extractPhoneNumber(company.PHONE)}</div>\` : ''}
                    \${company.EMAIL ? \`<div class="text-sm text-gray-600">Email: \${this.extractEmailAddress(company.EMAIL)}</div>\` : ''}
                </div>
                \` : contact ? \`
                <div class="bg-bitrix-light-blue rounded-lg p-3">
                    <div class="font-medium text-bitrix-blue">\${contact.NAME} \${contact.LAST_NAME || ''}</div>
                    \${contact.POST ? \`<div class="text-sm text-gray-600">Position: \${contact.POST}</div>\` : ''}
                    \${contact.PHONE ? \`<div class="text-sm text-gray-600">Phone: \${this.extractPhoneNumber(contact.PHONE)}</div>\` : ''}
                    \${contact.EMAIL ? \`<div class="text-sm text-gray-600">Email: \${this.extractEmailAddress(contact.EMAIL)}</div>\` : ''}
                </div>
                \` : \`
                <div class="text-sm text-gray-500 italic">No client information available</div>
                \`}
            </div>
        </div>

        <!-- RECENT ACTIVITIES -->
        \${invoiceActivities.length > 0 ? \`
        <div class="border-t border-gray-200 pt-4">
            <h4 class="font-medium text-gray-900 mb-3">Recent Activities</h4>
            <div class="space-y-2">
                \${invoiceActivities.slice(0, 3).map(activity => \`
                <div class="flex items-start space-x-3 p-2 bg-gray-50 rounded">
                    <div class="w-2 h-2 bg-bitrix-blue rounded-full mt-2 flex-shrink-0"></div>
                    <div class="flex-1 min-w-0">
                        <div class="text-sm font-medium text-gray-900">\${activity.SUBJECT || 'Activity'}</div>
                        \${activity.DESCRIPTION ? \`<div class="text-sm text-gray-600 truncate">\${activity.DESCRIPTION}</div>\` : ''}
                        <div class="text-xs text-gray-500">\${new Date(activity.DATE_TIME).toLocaleDateString()}</div>
                    </div>
                </div>
                \`).join('')}
            </div>
        </div>
        \` : ''}
    </div>
    \`;
  }

  // UTILITY METHODS for data extraction
  extractPhoneNumber(phoneData) {
    try {
      if (!phoneData) return '';
      if (typeof phoneData === 'string') return phoneData;
      if (Array.isArray(phoneData) && phoneData.length > 0) {
        const firstPhone = phoneData[0];
        if (firstPhone && typeof firstPhone === 'object' && firstPhone.VALUE) {
          return firstPhone.VALUE;
        }
      }
      return '';
    } catch (error) {
      return '';
    }
  }

  extractEmailAddress(emailData) {
    try {
      if (!emailData) return '';
      if (typeof emailData === 'string') return emailData;
      if (Array.isArray(emailData) && emailData.length > 0) {
        const firstEmail = emailData[0];
        if (firstEmail && typeof firstEmail === 'object' && firstEmail.VALUE) {
          return firstEmail.VALUE;
        }
      }
      return '';
    } catch (error) {
      return '';
    }
  }
}
\`,

  // Template metadata
  createdAt: new Date('2024-10-08'),
  updatedAt: new Date('2024-10-08'),
  createdBy: 'system',
  tags: ['bitrix24', 'invoices', 'financial', 'reporting', 'html', 'crm'],
  priority: 90
};

module.exports = { bitrixOpenInvoicesTemplate };
\`\`\`

## Key Learning Points from This Template

### 1. User Intent Extraction
- **Regex Patterns**: Multiple patterns catch variations like "open invoices", "outstanding invoices", "generate report"
- **Keywords**: Simple terms that help AI match user intent
- **Contexts**: Categorize the type of request (financial, reporting, CRM)

### 2. Parameter Extraction
- **AI Date Detection**: \`auto_detect_from_message\` triggers AI to parse "last 30 days", "this month" from user text
- **Schema Defaults**: Fallback values ensure the template always has valid parameters
- **Pattern Matching**: Simple regex patterns handle common date expressions

### 3. API Call Orchestration  
- **Streaming Fetch**: \`streamingFetch()\` handles large datasets with pagination and progress callbacks
- **Batch Operations**: Extract unique IDs then batch fetch related entities for efficiency
- **Error Handling**: Try-catch blocks with graceful degradation when API calls fail

### 4. Data Processing
- **Entity Joining**: Use Maps to efficiently link invoices → companies → contacts → activities
- **Summary Statistics**: Calculate totals, averages, breakdowns for dashboard display
- **Data Validation**: Handle missing/null values and invalid dates gracefully

### 5. HTML Generation
- **Professional Styling**: Tailwind CSS with custom Bitrix24 color scheme
- **Responsive Design**: Grid layouts that work on mobile and desktop
- **Interactive Elements**: Clickable invoice links that open in Bitrix24 CRM
- **Progressive Enhancement**: Fallbacks when data is missing

**This template demonstrates the complete workflow from user intent → API calls → data processing → HTML generation that fulfills user requests.**

---

# Bitrix24 API Advanced Patterns and Examples

## Complex Workflow Patterns

### 1. Multi-Stage Data Enrichment Pipeline

\`\`\`javascript
// Advanced pattern: Invoice → Company → Activities → Analytics
async executeEnrichmentPipeline() {
  // Stage 1: Get base invoice data
  const invoices = await this.streamingFetch('crm.invoice.list', baseFilter);
  
  // Stage 2: Extract all related entity IDs
  const companyIds = this.extractUniqueIds(invoices, 'UF_COMPANY_ID');
  const contactIds = this.extractUniqueIds(invoices, 'UF_CONTACT_ID');
  const responsibleIds = this.extractUniqueIds(invoices, 'RESPONSIBLE_ID');
  
  // Stage 3: Parallel fetch of all related entities
  const [companies, contacts, users] = await Promise.all([
    this.batchFetch('crm.company.list', companyIds),
    this.batchFetch('crm.contact.list', contactIds),
    this.batchFetch('user.get', responsibleIds)
  ]);
  
  // Stage 4: Create optimized lookup structures
  const lookups = {
    companies: new Map(companies.map(c => [c.ID, c])),
    contacts: new Map(contacts.map(c => [c.ID, c])),
    users: new Map(users.map(u => [u.ID, u]))
  };
  
  // Stage 5: Enrich base data with full relationship context
  return invoices.map(invoice => this.enrichInvoice(invoice, lookups));
}
\`\`\`

### 2. Conditional Activity Fetching with Rate Limiting

\`\`\`javascript
// Smart activity fetching with built-in rate limiting
async fetchActivitiesConditionally(entities, config) {
  const activities = new Map();
  
  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    
    // Skip if no valid entity ID
    if (!entity.UF_COMPANY_ID || entity.UF_COMPANY_ID === '0') continue;
    
    try {
      // Use queue service for automatic rate limiting
      const entityActivities = await this.callAPI('crm.activity.list', {
        filter: {
          'OWNER_TYPE_ID': 4,
          'OWNER_ID': entity.UF_COMPANY_ID,
          '>=DATE_TIME': config.activityDateRange?.start
        },
        select: config.activityFields || ['ID', 'TYPE_ID', 'SUBJECT', 'DATE_TIME'],
        order: { 'DATE_TIME': 'DESC' },
        limit: config.maxActivities || 5
      });
      
      if (entityActivities.result) {
        activities.set(entity.ID, entityActivities.result);
      }
      
    } catch (error) {
      this.log('warn', 'Activity fetch failed', { 
        entityId: entity.ID, 
        error: error.message 
      });
    }
    
    // Progress tracking for long operations
    if (i % 10 === 0) {
      await this.updateProgress(
        70 + ((i / entities.length) * 20),
        \`Fetched activities for \${i}\/\${entities.length} entities\`,
        "fetch_activities"
      );
    }
  }
  
  return activities;
}
\`\`\`

### 3. Dynamic Filter Construction

\`\`\`javascript
// Build dynamic filters based on user parameters
buildInvoiceFilter(params) {
  const filter = {};
  
  // Status filtering
  if (params.statuses && params.statuses.length > 0) {
    filter['STATUS_ID'] = params.statuses;
  }
  
  // Date range filtering
  if (params.dateRange) {
    if (params.dateRange.start) {
      filter['>=DATE_INSERT'] = params.dateRange.start;
    }
    if (params.dateRange.end) {
      filter['<=DATE_INSERT'] = params.dateRange.end;
    }
  }
  
  // Amount filtering
  if (params.minAmount) {
    filter['>=PRICE'] = params.minAmount;
  }
  if (params.maxAmount) {
    filter['<=PRICE'] = params.maxAmount;
  }
  
  // Company filtering
  if (params.companyIds && params.companyIds.length > 0) {
    filter['UF_COMPANY_ID'] = params.companyIds;
  }
  
  // Responsible user filtering
  if (params.responsibleUsers && params.responsibleUsers.length > 0) {
    filter['RESPONSIBLE_ID'] = params.responsibleUsers;
  }
  
  this.log('info', 'Dynamic filter constructed', { 
    filterKeys: Object.keys(filter),
    filter: filter 
  });
  
  return filter;
}
\`\`\`

### 4. JavaScript Filtering vs API Filtering

**🚨 CRITICAL: Use JavaScript filtering for complex conditions - don't rely solely on API filters!**

\`\`\`javascript
// ❌ WRONG: Trying to filter \$0 invoices via API (may not work reliably)
const invoices = await this.streamingFetch('crm.invoice.list', {
  filter: {
    'STATUS_ID': ['N', 'S'],
    '>PRICE': 0  // API filter may not work correctly for all cases
  }
});

// ✅ CORRECT: Filter in JavaScript after fetching for guaranteed accuracy
const invoicesRaw = await this.streamingFetch('crm.invoice.list', {
  filter: {
    'STATUS_ID': ['N', 'S']  // Simple status filter only
  },
  select: ['ID', 'PRICE', 'CURRENCY', 'DATE_INSERT', 'UF_COMPANY_ID']
});

// Filter out \$0 or negative amounts in JavaScript
const validInvoices = invoicesRaw.filter(invoice => {
  const amount = parseFloat(invoice.PRICE || 0);
  return amount > 0;  // Only include invoices greater than \$0
});

this.log('info', 'Invoice filtering complete', {
  totalFetched: invoicesRaw.length,
  validInvoices: validInvoices.length,
  filteredOut: invoicesRaw.length - validInvoices.length
});

// ✅ CORRECT: Complex multi-field logic in JavaScript
const highValueRecentInvoices = invoicesRaw.filter(invoice => {
  const amount = parseFloat(invoice.PRICE || 0);
  const daysOld = Math.floor((Date.now() - new Date(invoice.DATE_INSERT)) / (1000 * 60 * 60 * 24));

  // Complex condition: high value AND recent AND has company
  return amount > 1000 && daysOld < 30 && invoice.UF_COMPANY_ID;
});
\`\`\`

**When to use JavaScript filtering:**
- Complex numeric comparisons (greater than, between ranges, calculations)
- Multi-field logic (if field1 exists AND field2 > value)
- Data quality checks (non-null, non-empty, valid format)
- Calculations before filtering (sum of fields, date differences)
- String pattern matching or complex text processing

**When API filtering is safe:**
- Simple equality checks (STATUS_ID = 'N')
- Simple date ranges (>=DATE_CREATE)
- Simple ID lookups (ID IN [1,2,3])
- Simple array membership (STATUS_ID IN ['N', 'S'])

## Advanced API Usage Examples

### 1. Bulk Operations with Error Recovery

\`\`\`javascript
// Robust bulk update with individual error handling
async bulkUpdateInvoices(invoices, updateData) {
  const results = {
    successful: [],
    failed: [],
    errors: []
  };
  
  for (const invoice of invoices) {
    try {
      const updateResult = await this.callAPI('crm.invoice.update', {
        id: invoice.ID,
        fields: {
          ...updateData,
          DATE_MODIFY: new Date().toISOString()
        }
      });
      
      if (updateResult.result) {
        results.successful.push(invoice.ID);
        this.log('debug', 'Invoice updated', { invoiceId: invoice.ID });
      } else {
        results.failed.push(invoice.ID);
        this.log('warn', 'Invoice update returned false', { invoiceId: invoice.ID });
      }
      
    } catch (error) {
      results.failed.push(invoice.ID);
      results.errors.push({
        invoiceId: invoice.ID,
        error: error.message
      });
      
      this.log('error', 'Invoice update failed', { 
        invoiceId: invoice.ID, 
        error: error.message 
      });
    }
  }
  
  this.log('info', 'Bulk update completed', {
    total: invoices.length,
    successful: results.successful.length,
    failed: results.failed.length
  });
  
  return results;
}
\`\`\`

### 2. Complex Reporting with Aggregations

\`\`\`javascript
// Generate comprehensive business metrics
async generateAdvancedMetrics(invoices, companies, activities) {
  const metrics = {
    financial: this.calculateFinancialMetrics(invoices),
    client: this.calculateClientMetrics(companies, invoices),
    activity: this.calculateActivityMetrics(activities),
    trends: await this.calculateTrends(invoices)
  };
  
  return metrics;
}

calculateFinancialMetrics(invoices) {
  const paid = invoices.filter(inv => inv.STATUS_ID === 'P');
  const pending = invoices.filter(inv => ['N', 'S'].includes(inv.STATUS_ID));
  
  return {
    totalRevenue: invoices.reduce((sum, inv) => sum + parseFloat(inv.PRICE || 0), 0),
    paidRevenue: paid.reduce((sum, inv) => sum + parseFloat(inv.PRICE || 0), 0),
    pendingRevenue: pending.reduce((sum, inv) => sum + parseFloat(inv.PRICE || 0), 0),
    averageInvoice: invoices.length > 0 ? 
      invoices.reduce((sum, inv) => sum + parseFloat(inv.PRICE || 0), 0) / invoices.length : 0,
    paymentRate: invoices.length > 0 ? (paid.length / invoices.length) * 100 : 0,
    invoiceCount: {
      total: invoices.length,
      paid: paid.length,
      pending: pending.length
    }
  };
}

calculateClientMetrics(companies, invoices) {
  const clientInvoiceMap = new Map();
  
  // Group invoices by company
  invoices.forEach(invoice => {
    if (invoice.UF_COMPANY_ID) {
      if (!clientInvoiceMap.has(invoice.UF_COMPANY_ID)) {
        clientInvoiceMap.set(invoice.UF_COMPANY_ID, []);
      }
      clientInvoiceMap.get(invoice.UF_COMPANY_ID).push(invoice);
    }
  });
  
  // Calculate per-client metrics
  const clientMetrics = companies.map(company => {
    const companyInvoices = clientInvoiceMap.get(company.ID) || [];
    const totalValue = companyInvoices.reduce((sum, inv) => sum + parseFloat(inv.PRICE || 0), 0);
    
    return {
      companyId: company.ID,
      companyName: company.TITLE,
      industry: company.INDUSTRY,
      invoiceCount: companyInvoices.length,
      totalValue: totalValue,
      averageInvoice: companyInvoices.length > 0 ? totalValue / companyInvoices.length : 0,
      lastInvoiceDate: companyInvoices.length > 0 ? 
        Math.max(...companyInvoices.map(inv => new Date(inv.DATE_CREATE).getTime())) : null
    };
  });
  
  // Sort by total value
  clientMetrics.sort((a, b) => b.totalValue - a.totalValue);
  
  return {
    topClients: clientMetrics.slice(0, 10),
    clientCount: companies.length,
    averageClientValue: clientMetrics.reduce((sum, client) => sum + client.totalValue, 0) / clientMetrics.length
  };
}
\`\`\`

## 🚨 CRITICAL: generateHTMLReport Method Implementation

**MANDATORY: Every task executor class MUST implement the generateHTMLReport method. Validation will fail without this method.**

### Required Method Signature

\`\`\`javascript
async generateHTMLReport(data) {
  // MUST return valid HTML string
  return \`<!DOCTYPE html>...\`;
}
\`\`\`

### Complete Working Example

\`\`\`javascript
class ProductRankingExecutor extends BaseTaskExecutor {
  async execute() {
    // ... data processing logic ...
    
    // Call generateHTMLReport and store result
    const finalReport = await this.generateHTMLReport({
      rankedProducts: productData,
      startDate: startDate,
      endDate: endDate,
      totalInvoices: invoices.length
    });
    
    // Upload the report
    const attachment = await this.uploadReport(finalReport, \`product_ranking_\${Date.now()}.html\`);
    
    return {
      success: true,
      summary: \`Analyzed \${invoices.length} invoices and ranked \${productData.length} products\`,
      attachments: [attachment]
    };
  }

  // 🚨 MANDATORY METHOD: generateHTMLReport implementation
  async generateHTMLReport(data) {
    const { rankedProducts, startDate, endDate, totalInvoices } = data;
    
    // Handle no data case
    if (!rankedProducts || rankedProducts.length === 0) {
      return \`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Product Ranking Report - No Data</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="container mx-auto p-6">
    <div class="bg-white rounded-lg shadow-lg p-8 text-center">
      <h1 class="text-2xl font-bold text-gray-800 mb-4">No Data Found</h1>
      <p class="text-gray-600">No product data available for the period \${startDate} to \${endDate}</p>
    </div>
  </div>
</body>
</html>\`;
    }
    
    // Generate product rows
    const productRows = rankedProducts.map((product, index) => \`
      <tr class="\${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50">
        <td class="px-4 py-3 text-sm font-medium text-gray-900">\${index + 1}</td>
        <td class="px-4 py-3 text-sm text-gray-900">
          <a href="https://your-domain.bitrix24.com/crm/product/show/\${product.id}/" 
             target="_blank" class="text-blue-600 hover:underline">
            \${this.escapeHtml(product.name || 'Unknown Product')}
          </a>
        </td>
        <td class="px-4 py-3 text-sm text-gray-700 text-center">\${product.quantity || 0}</td>
        <td class="px-4 py-3 text-sm text-gray-700 text-right">\${product.revenue ? product.revenue.toFixed(2) : '0.00'}</td>
      </tr>
    \`).join('');
    
    return \`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Product Ranking Report</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="container mx-auto p-6">
    <div class="bg-white rounded-lg shadow-lg p-8">
      <div class="mb-6 border-b border-gray-200 pb-4">
        <h1 class="text-3xl font-bold text-gray-900">Product Ranking Report</h1>
        <p class="text-gray-600 mt-2">Analysis period: \${startDate} to \${endDate}</p>
        <p class="text-gray-600">Total invoices analyzed: \${totalInvoices}</p>
      </div>
      
      <div class="overflow-x-auto">
        <table class="w-full table-auto">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product Name</th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            \${productRows}
          </tbody>
        </table>
      </div>
      
      <div class="mt-6 text-center text-sm text-gray-500">
        <p>Generated on \${new Date().toLocaleString()}</p>
      </div>
    </div>
  </div>
</body>
</html>\`;
  }
  
  // Helper method for HTML escaping
  escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
\`\`\`

### Key Requirements

1. **Method Must Exist**: Every class MUST have \`async generateHTMLReport(data)\` method
2. **Return HTML**: Must return complete valid HTML string starting with \`<!DOCTYPE html>\`
3. **Handle No Data**: Include logic for empty/null data cases  
4. **Use Tailwind CSS**: Include \`<script src="https://cdn.tailwindcss.com"></script>\`
5. **Escape HTML**: Use \`escapeHtml()\` helper for user data
6. **Include Links**: Add Bitrix24 entity links where applicable
7. **Responsive Design**: Use Tailwind responsive classes

### Common generateHTMLReport Errors

❌ **Missing Method**: 
\`\`\`javascript
// This will cause "generateHTMLReport is not a function" error
class BadExecutor extends BaseTaskExecutor {
  async execute() {
    const report = await this.generateHTMLReport(data); // ❌ Method doesn't exist
    return { success: true };
  }
  // ❌ Missing generateHTMLReport method
}
\`\`\`

❌ **Calling Instead of Implementing**:
\`\`\`javascript
// Wrong - trying to call inherited method that doesn't exist
const report = await this.generateHTMLReport(data); // ❌ No such inherited method
\`\`\`

✅ **Correct Implementation**:
\`\`\`javascript
class GoodExecutor extends BaseTaskExecutor {
  async execute() {
    // Process data
    const reportData = { products: productList, summary: summaryStats };
    
    // Generate HTML report
    const htmlReport = await this.generateHTMLReport(reportData);
    
    // Upload and return
    const attachment = await this.uploadReport(htmlReport, 'report.html');
    return { success: true, attachments: [attachment] };
  }
  
  // ✅ Required method implementation
  async generateHTMLReport(data) {
    return \`<!DOCTYPE html>...\`; // Return actual HTML
  }
}
\`\`\`

## 🚨 CRITICAL: Group Chat/Collab Notification Pattern

**MANDATORY: For complex tasks created in group chats, channels, or collaborations, Chantilly must send completion notifications back to the original group with the user tagged in an @ mention.**

### Automatic Group Chat Detection

The system automatically detects when a task was created in a group context and routes notifications accordingly:

\`\`\`javascript
// PATTERN: messageContext is passed from ComplexTaskManager to task execution
const messageContext = task.messageContext;
let targetDialogId = userId; // Default to direct user
let mentionUser = false;

// Check if original request came from group chat/collaboration/channel
if (messageContext?.dialogId && messageContext.dialogId !== userId) {
  // Original request came from a group chat/collaboration/channel
  targetDialogId = messageContext.dialogId;
  mentionUser = true;
  
  this.log('info', 'Task notification routing to group chat', {
    taskId,
    originalUser: userId,
    targetDialog: targetDialogId,
    mentionUser
  });
} else {
  this.log('info', 'Task notification routing to direct user', {
    taskId,
    userId
  });
}
\`\`\`

### User Mention Format

When sending notifications to group chats, the original user must be mentioned using Bitrix24 BB code:

\`\`\`javascript
// Add user mention for group chats
const userPrefix = mentionUser ? \`[USER=\${userId}][/USER] \` : '';

// Example notification message
let message = '✅ **Task Completed!**\\n\\n';
message += \`\${userPrefix}Your **\${templateName}** task has finished successfully.\\n\\n\`;
message += \`**Task ID:** \\\`\${taskId}\\\`\\n\`;
message += \`**Duration:** \${formatDuration(details.executionTime)}\\n\`;
\`\`\`

### Complete Notification Implementation

\`\`\`javascript
async function sendTaskNotification(taskId, userId, status, details) {
  const queueService = require('../services/bitrix24-queue').getQueueManager();
  const task = await this.getTask(taskId);
  
  // Determine notification target: group chat vs direct user
  const messageContext = task.messageContext;
  let targetDialogId = userId; // Default to direct user
  let mentionUser = false;
  
  if (messageContext?.dialogId && messageContext.dialogId !== userId) {
    // Original request came from a group chat/collaboration/channel
    targetDialogId = messageContext.dialogId;
    mentionUser = true;
  }
  
  const templateName = task.templateId.replace(/_/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase());
  const userPrefix = mentionUser ? \`[USER=\${userId}][/USER] \` : '';
  
  let message = '';
  switch (status) {
    case 'completed':
      message = '✅ **Task Completed!**\\n\\n';
      message += \`\${userPrefix}Your **\${templateName}** task has finished successfully.\\n\\n\`;
      message += \`**Task ID:** \\\`\${taskId}\\\`\\n\`;
      message += \`**Duration:** \${formatDuration(details.executionTime)}\\n\`;
      
      if (details.result?.summary) {
        message += \`**Summary:** \${details.result.summary}\\n\`;
      }
      
      if (details.result?.attachments?.length > 0) {
        message += \`**Files Generated:** \${details.result.attachments.length}\\n\`;
        details.result.attachments.forEach((attachment, index) => {
          message += \`\${index + 1}. **\${attachment.name}** (\${formatFileSize(attachment.size)})\\n\`;
          if (attachment.publicUrl) {
            message += \`   Download: \${attachment.publicUrl}\\n\`;
          }
        });
      }
      break;
      
    case 'failed':
      message = '❌ **Task Failed**\\n\\n';
      message += \`\${userPrefix}Your **\${templateName}** task encountered an error.\\n\\n\`;
      message += \`**Task ID:** \\\`\${taskId}\\\`\\n\`;
      message += \`**Error:** \${details.error.message}\\n\`;
      break;
  }
  
  // Send notification to appropriate target (group or direct)
  await queueService.add({
    method: 'imbot.message.add',
    params: {
      DIALOG_ID: targetDialogId,
      MESSAGE: message
    }
  });
}
\`\`\`

### Key Requirements for Group Chat Notifications

1. **messageContext Detection**: Check if \`messageContext.dialogId !== userId\`
2. **Target Routing**: Use \`messageContext.dialogId\` as \`DIALOG_ID\` for group notifications
3. **User Mentions**: Include \`[USER=\${userId}][/USER]\` prefix in group messages
4. **Notification Types**: Support completed, failed, cancelled, and progress notifications
5. **File Attachments**: Include download links for generated reports
6. **Logging**: Log notification routing decisions for debugging

### Message Context Flow

\`\`\`
1. User creates task in group chat (dialogId: chat123, userId: 594)
2. ComplexTaskManager saves messageContext: { dialogId: 'chat123', userId: '594' }
3. Task executes in background worker
4. On completion: sendTaskNotification checks messageContext
5. Since dialogId !== userId, route to group chat with mention
6. Result: "@User Your Product Ranking Report task completed!" sent to chat123
\`\`\`

This knowledge base provides complete guidance for advanced Bitrix24 API integration patterns within the Chantilly task execution system.
`;

const knowledgeBaseEntries = [
  {
    title: 'Bitrix24 API Integration Guide for Complex Tasks with Complete Working Template',
    content: bitrix24ApiGuide,
    category: 'system_information',
    tags: ['bitrix24', 'api', 'integration', 'queue', 'crm', 'system', 'templates', 'complete-template'],
    searchTerms: [
      'bitrix24 api', 'queue service', 'crm integration', 'invoice api', 
      'company api', 'contact api', 'activity api', 'task template api',
      'streaming fetch', 'batch operations', 'api authentication', 'working template',
      'user intent extraction', 'parameter extraction', 'html generation'
    ],
    priority: 95,
    enabled: true
  }
];

module.exports = {
  bitrix24ApiGuide,
  knowledgeBaseEntries,
  title: 'Bitrix24 API Integration Guide for Complex Tasks with Complete Working Template',
  category: 'system_information',
  priority: 95,
  lastUpdated: new Date().toISOString()
};