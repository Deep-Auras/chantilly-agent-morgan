/**
 * Bitrix24 Open Invoices (Old) Report Task Template
 * 
 * This template creates a comprehensive HTML report of open invoices with:
 * - Paginated invoice data fetching (status N and S)
 * - Customer/company information enrichment
 * - Last 3 activities per invoice
 * - HTML5 with TailwindCSS styling matching Bitrix24 2025 interface
 */

const bitrixOpenInvoicesTemplate = {
  // Template metadata
  templateId: 'bitrix_open_invoices_old_report',
  name: 'Bitrix24 Open Invoices (Old) Report',
  description: 'Generate comprehensive HTML report of open invoices with customer information and activity timeline',
  version: '1.0.0',
  category: ['financial_reporting', 'crm', 'bitrix24'],
  enabled: true,
  
  // Auto-detection triggers
  triggers: {
    patterns: [
      /open.*invoices?.*report/i,
      /report.*open.*invoices?/i,
      /generate.*report.*(?:of.*)?(?:all.*)?open.*invoices?/i,
      /invoices?.*report.*old/i,
      /outstanding.*invoices?/i,
      /unpaid.*invoices?.*report/i,
      /bitrix.*invoices?.*report/i,
      /invoices?.*status.*report/i,
      /report.*of.*(?:all.*)?open.*invoices?/i,
      /create.*invoices?.*report/i,
      /generate.*(?:a.*)?report.*(?:of.*)?(?:all.*)?(?:open.*)?invoices?/i
    ],
    keywords: ['open', 'invoices', 'report', 'outstanding', 'unpaid', 'bitrix', 'old', 'aged', 'generate', 'create'],
    contexts: ['financial', 'reporting', 'crm', 'invoice_management']
  },
  
  // Template definition
  definition: {
    estimatedSteps: 8,
    estimatedDuration: 1800000, // 30 minutes (can be long due to API calls and large datasets)
    memoryRequirement: '1GB',
    requiredServices: ['queueService', 'fileStorage'],
    
    // Parameter schema for validation
    parameterSchema: {
      type: 'object',
      required: [],
      properties: {
        dateRange: {
          type: 'object',
          properties: {
            start: { 
              type: 'string', 
              format: 'date',
              description: 'Start date for invoice creation filter'
            },
            end: { 
              type: 'string', 
              format: 'date',
              description: 'End date for invoice creation filter'
            }
          },
          default: {
            start: 'auto_detect_from_message', // Will be determined by AI from user message
            end: 'auto_today'
          }
        },
        invoiceStatuses: {
          type: 'array',
          items: { type: 'string' },
          description: 'Invoice statuses to include',
          default: ['N', 'S'] // N = New, S = Sent
        },
        includeActivities: {
          type: 'boolean',
          description: 'Include last 3 activities per invoice',
          default: true
        },
        activityLimit: {
          type: 'number',
          minimum: 1,
          maximum: 10,
          description: 'Number of recent activities to fetch per invoice',
          default: 3
        },
        sortBy: {
          type: 'string',
          enum: ['date_insert', 'price', 'company_title'],
          description: 'Sort invoices by field',
          default: 'date_insert'
        },
        sortOrder: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort order',
          default: 'desc'
        },
        outputFormat: {
          type: 'string',
          enum: ['html', 'html_with_css'],
          description: 'Output format',
          default: 'html_with_css'
        }
      }
    }
  },
  
  // JavaScript execution script - this will use the enhanced queue service
  executionScript: `
class BitrixOpenInvoicesExecutor extends BaseTaskExecutor {
  async execute() {
    try {
      await this.validateParameters();
      
      // Step 1: Initialize and calculate date ranges
      await this.updateProgress(5, "Initializing open invoices report", "initialize");
      
      // Store user message in context for AI date range detection
      this.context.userMessage = this.context.userMessage || this.parameters.description || '';
      
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

      // Step 2: Fetch all open invoices with pagination
      await this.updateProgress(15, "Fetching open invoices from Bitrix24", "fetch_invoices");
      
      // Log the filter parameters for debugging
      this.log('info', 'Invoice filter parameters', {
        statusIds: params.invoiceStatuses,
        dateStart: params.dateRange.start,
        dateEnd: params.dateRange.end
      });

      const filterObject = {
        'STATUS_ID': params.invoiceStatuses,
        '>=DATE_INSERT': params.dateRange.start,
        '<=DATE_INSERT': params.dateRange.end
      };

      this.log('info', 'Complete filter object being sent to API', { 
        filterObject,
        filterStringified: JSON.stringify(filterObject, null, 2)
      });

      const invoices = await this.streamingFetch('crm.invoice.list', {
        filter: filterObject,
        select: [
          'ID', 'INVOICE_ID', 'STATUS_ID', 'PRICE', 'CURRENCY', 'DATE_CREATE', 
          'DATE_INSERT', 'DATE_UPDATE', 'PAY_VOUCHER_DATE', 'PAY_VOUCHER_NUM',
          'UF_COMPANY_ID', 'UF_CONTACT_ID', 'PERSON_TYPE_ID',
          'TITLE', 'COMMENTS', 'USER_DESCRIPTION',
          'RESPONSIBLE_ID', 'UF_DEAL_ID'
        ],
        order: { [params.sortBy.toUpperCase()]: params.sortOrder.toUpperCase() }
      }, {
        batchSize: 50,
        progressCallback: (processed, estimated) => {
          this.updateProgress(15 + Math.min(20, (processed / Math.max(estimated, 100)) * 20), 
            \`Processed \${processed} invoices\`, "fetch_invoices");
        }
      });

      reportData.invoices = invoices;
      this.log('info', 'Invoices fetched', { count: invoices.length });

      // Step 3: Extract unique company and contact IDs
      await this.updateProgress(40, "Identifying related companies and contacts", "extract_ids");
      
      // Debug: Log sample invoice data to see what fields are actually available
      this.log('info', 'Sample invoice data', {
        sampleInvoice: invoices[0] || {},
        invoiceFields: invoices[0] ? Object.keys(invoices[0]) : [],
        totalInvoices: invoices.length
      });

      const companyIds = [...new Set(invoices.map(inv => inv.UF_COMPANY_ID).filter(Boolean))];
      const contactIds = [...new Set(invoices.map(inv => inv.UF_CONTACT_ID).filter(Boolean))];

      this.log('info', 'Related entities identified', { 
        companies: companyIds.length,
        contacts: contactIds.length,
        sampleCompanyIds: companyIds.slice(0, 5),
        sampleContactIds: contactIds.slice(0, 5),
        invoicesWithCompanyIds: invoices.filter(inv => inv.UF_COMPANY_ID).length,
        invoicesWithContactIds: invoices.filter(inv => inv.UF_CONTACT_ID).length,
        // Debug specific invoices
        invoice1CompanyId: invoices[0]?.UF_COMPANY_ID,
        invoice1ContactId: invoices[0]?.UF_CONTACT_ID
      });

      // Step 4: Fetch company information
      if (companyIds.length > 0) {
        await this.updateProgress(50, "Fetching company information", "fetch_companies");
        
        this.log('info', 'Fetching companies', { 
          companyIds: companyIds,
          filter: { ID: companyIds }
        });

        const companies = await this.streamingFetch('crm.company.list', {
          filter: { ID: companyIds },
          select: [
            'ID', 'TITLE', 'COMPANY_TYPE', 'INDUSTRY', 'EMPLOYEES',
            'REVENUE', 'PHONE', 'EMAIL', 'WEB', 'ADDRESS',
            'DATE_CREATE', 'DATE_MODIFY', 'ASSIGNED_BY_ID'
          ]
        }, { batchSize: 50 });

        this.log('info', 'Companies fetched', { 
          requestedIds: companyIds.length,
          returnedCompanies: companies.length,
          sampleCompany: companies[0] || 'none'
        });

        companies.forEach(company => {
          reportData.companies.set(company.ID, company);
        });
      }

      // Step 5: Fetch contact information
      if (contactIds.length > 0) {
        await this.updateProgress(60, "Fetching contact information", "fetch_contacts");
        
        this.log('info', 'Fetching contacts', { 
          contactIds: contactIds,
          filter: { ID: contactIds }
        });

        const contacts = await this.streamingFetch('crm.contact.list', {
          filter: { ID: contactIds },
          select: [
            'ID', 'NAME', 'LAST_NAME', 'SECOND_NAME', 'POST', 
            'PHONE', 'EMAIL', 'COMPANY_ID', 'ASSIGNED_BY_ID',
            'DATE_CREATE', 'DATE_MODIFY'
          ]
        }, { batchSize: 50 });

        this.log('info', 'Contacts fetched', { 
          requestedIds: contactIds.length,
          returnedContacts: contacts.length,
          sampleContact: contacts[0] || 'none'
        });

        contacts.forEach(contact => {
          reportData.contacts.set(contact.ID, contact);
        });
      }

      // Step 6: Fetch activities for each invoice (if enabled)
      if (params.includeActivities) {
        await this.updateProgress(70, "Fetching client activities", "fetch_activities");
        
        for (let i = 0; i < invoices.length; i++) {
          // Check for cancellation during long-running loops
          await this.checkCancellation();
          
          const invoice = invoices[i];
          let allActivities = [];
          
          try {
            // Fetch activities from company if exists
            if (invoice.UF_COMPANY_ID && invoice.UF_COMPANY_ID !== '0') {
              const companyActivities = await this.callAPI('crm.activity.list', {
                filter: {
                  'OWNER_TYPE_ID': 4, // Company entity type
                  'OWNER_ID': invoice.UF_COMPANY_ID
                },
                select: [
                  'ID', 'TYPE_ID', 'SUBJECT', 'DESCRIPTION', 'DIRECTION',
                  'DATE_TIME', 'CREATED', 'AUTHOR_ID', 'RESPONSIBLE_ID',
                  'RESULT_STATUS', 'RESULT_TEXT'
                ],
                order: { 'DATE_TIME': 'DESC' },
                start: 0,
                limit: params.activityLimit
              });

              if (companyActivities && companyActivities.result) {
                allActivities = allActivities.concat(companyActivities.result);
                this.log('debug', 'Company activities fetched', { 
                  invoiceId: invoice.ID,
                  companyId: invoice.UF_COMPANY_ID,
                  activitiesCount: companyActivities.result.length
                });
              }
            }

            // Fetch activities from contact if exists
            if (invoice.UF_CONTACT_ID && invoice.UF_CONTACT_ID !== '0') {
              const contactActivities = await this.callAPI('crm.activity.list', {
                filter: {
                  'OWNER_TYPE_ID': 3, // Contact entity type
                  'OWNER_ID': invoice.UF_CONTACT_ID
                },
                select: [
                  'ID', 'TYPE_ID', 'SUBJECT', 'DESCRIPTION', 'DIRECTION',
                  'DATE_TIME', 'CREATED', 'AUTHOR_ID', 'RESPONSIBLE_ID',
                  'RESULT_STATUS', 'RESULT_TEXT'
                ],
                order: { 'DATE_TIME': 'DESC' },
                start: 0,
                limit: params.activityLimit
              });

              if (contactActivities && contactActivities.result) {
                allActivities = allActivities.concat(contactActivities.result);
                this.log('debug', 'Contact activities fetched', { 
                  invoiceId: invoice.ID,
                  contactId: invoice.UF_CONTACT_ID,
                  activitiesCount: contactActivities.result.length
                });
              }
            }

            // Sort all activities by date and limit to activityLimit
            if (allActivities.length > 0) {
              allActivities.sort((a, b) => new Date(b.DATE_TIME) - new Date(a.DATE_TIME));
              allActivities = allActivities.slice(0, params.activityLimit);
              
              reportData.activities.set(invoice.ID, allActivities);
              this.log('debug', 'Combined activities stored for invoice', { 
                invoiceId: invoice.ID, 
                totalActivitiesCount: allActivities.length,
                hasCompanyId: !!invoice.UF_COMPANY_ID && invoice.UF_COMPANY_ID !== '0',
                hasContactId: !!invoice.UF_CONTACT_ID && invoice.UF_CONTACT_ID !== '0'
              });
            } else {
              this.log('info', 'No activities found for invoice', { 
                invoiceId: invoice.ID,
                companyId: invoice.UF_COMPANY_ID,
                contactId: invoice.UF_CONTACT_ID
              });
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

      // Step 7: Generate summary statistics
      await this.updateProgress(90, "Generating report summary", "generate_summary");
      
      reportData.summary = this.generateSummary(reportData, params);

      // Step 8: Upload report to Cloud Storage
      await this.updateProgress(95, "Uploading report to cloud storage", "upload_report");
      
      // Log final report data summary
      this.log('info', 'Generating HTML report with data summary', {
        invoicesCount: reportData.invoices.length,
        companiesCount: reportData.companies.size,
        contactsCount: reportData.contacts.size,
        activitiesCount: reportData.activities.size,
        sampleInvoiceCompanyId: reportData.invoices[0]?.COMPANY_ID,
        sampleInvoiceContactId: reportData.invoices[0]?.CONTACT_ID,
        hasCompaniesData: reportData.companies.size > 0,
        hasContactsData: reportData.contacts.size > 0,
        hasActivitiesData: reportData.activities.size > 0
      });
      
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
        executionTime: Date.now() - this.startTime,
        resourceUsage: this.getExecutionSummary().resourceUsage
      };

    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async preprocessParameters(params) {
    const processed = { ...params };
    
    // Apply schema defaults for missing parameters
    processed.includeCompanies = processed.includeCompanies !== undefined ? processed.includeCompanies : true;
    processed.includeContacts = processed.includeContacts !== undefined ? processed.includeContacts : true;
    processed.includeActivities = processed.includeActivities !== undefined ? processed.includeActivities : true;
    processed.activityLimit = processed.activityLimit || 3;
    processed.sortBy = processed.sortBy || 'date_insert';
    processed.sortOrder = processed.sortOrder || 'desc';
    
    // Ensure dateRange exists with fallback
    if (!processed.dateRange) {
      processed.dateRange = {
        start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 90 days ago
        end: new Date().toISOString().split('T')[0] // today
      };
      this.log('warn', 'No dateRange provided, using 90-day fallback', {
        generatedDateRange: processed.dateRange
      });
    }
    
    // Handle auto-detection from user message
    if (processed.dateRange.start === "auto_detect_from_message") {
      try {
        const detectedRange = await this.extractDateRangeFromMessage();
        processed.dateRange.start = detectedRange.start;
        processed.dateRange.end = detectedRange.end;
        
        this.log('info', 'AI-detected date range from message', {
          originalMessage: this.context.userMessage || 'unknown',
          detectedStart: detectedRange.start,
          detectedEnd: detectedRange.end,
          detectedDays: detectedRange.days
        });
      } catch (error) {
        this.log('warn', 'Failed to detect date range from message, using 90-day default', {
          error: error.message
        });
        // Fallback to 90 days (original default)
        const date = new Date();
        date.setDate(date.getDate() - 90);
        processed.dateRange.start = date.toISOString().split('T')[0];
        processed.dateRange.end = new Date().toISOString().split('T')[0];
      }
    } else if (processed.dateRange.start === "auto_90_days_ago") {
      // Legacy fallback
      const date = new Date();
      date.setDate(date.getDate() - 90);
      processed.dateRange.start = date.toISOString().split('T')[0];
    }
    
    if (processed.dateRange.end === "auto_today") {
      processed.dateRange.end = new Date().toISOString().split('T')[0];
    }
    
    return processed;
  }


  /**
   * Extract date range from user message using Gemini AI
   */
  async extractDateRangeFromMessage() {
    // Get the user message from context (passed from ComplexTaskManager)
    const userMessage = this.context.userMessage || this.context.description || '';
    
    if (!userMessage) {
      throw new Error('No user message available for date range detection');
    }

    const prompt = \`Analyze this user request and extract the time period for an invoice report:

User Message: "\${userMessage}"

Current Date: \${new Date().toISOString().split('T')[0]}

Extract the time period and return ONLY a JSON object with this exact format:
{
  "days": number,
  "start": "YYYY-MM-DD",
  "end": "YYYY-MM-DD",
  "detected": "description of what was detected"
}

Time period detection rules:
- "last X days" = X days ago to today
- "last X weeks" = X*7 days ago to today  
- "last X months" = X*30 days ago to today
- "past X days/weeks/months" = same as "last X"
- "in the last X" = same as "last X"
- "this month" = first day of current month to today
- "this year" = January 1st of current year to today
- "recent" or no time specified = 90 days (default)

Examples:
- "last 30 days" → {"days": 30, "start": "2025-09-08", "end": "2025-10-08", "detected": "last 30 days"}
- "past 2 weeks" → {"days": 14, "start": "2025-09-24", "end": "2025-10-08", "detected": "past 2 weeks"}
- "this month" → {"days": 8, "start": "2025-10-01", "end": "2025-10-08", "detected": "this month"}
- "recent invoices" → {"days": 90, "start": "2025-07-10", "end": "2025-10-08", "detected": "recent (default 90 days)"}

Return only the JSON, no other text.\`;

    try {
      // Debug what's available in context
      this.log('debug', 'Context keys available for Gemini', {
        contextKeys: Object.keys(this.context || {}),
        hasGenAI: !!this.context?.genAI,
        genAIType: typeof this.context?.genAI,
        genAIKeys: this.context?.genAI ? Object.keys(this.context.genAI) : 'none'
      });

      // For now, skip AI date detection since context is not working
      // Default to simple regex pattern detection instead
      this.log('warn', 'Skipping AI date detection due to context issues, using simple pattern matching');
      
      const dateRange = this.extractDateRangeFromPattern(userMessage);
      if (dateRange) {
        this.log('info', 'Date range detected via pattern matching', dateRange);
        return dateRange;
      }
      
      throw new Error('No date range detected in user message');
      
      // Validate the response
      if (!dateRange.start || !dateRange.end || !dateRange.days) {
        throw new Error('Invalid date range format from AI');
      }

      // Validate dates
      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error('Invalid dates in AI response');
      }

      return dateRange;
    } catch (error) {
      this.log('error', 'Failed to parse AI date range response', {
        error: error.message,
        userMessage
      });
      throw error;
    }
  }

  /**
   * Generate summary statistics
   */
  generateSummary(reportData, params) {
    const { invoices } = reportData;
    
    const summary = {
      totalInvoices: invoices.length,
      totalAmount: 0,
      currencies: new Map(),
      statusBreakdown: new Map(),
      oldestInvoice: null,
      newestInvoice: null,
      averageAmount: 0,
      companiesCount: reportData.companies.size,
      contactsCount: reportData.contacts.size
    };

    // Calculate totals and breakdowns
    invoices.forEach(invoice => {
      const amount = parseFloat(invoice.PRICE || 0);
      summary.totalAmount += amount;
      
      // Currency breakdown
      const currency = invoice.CURRENCY || 'USD';
      summary.currencies.set(currency, (summary.currencies.get(currency) || 0) + amount);
      
      // Status breakdown
      const status = invoice.STATUS_ID;
      summary.statusBreakdown.set(status, (summary.statusBreakdown.get(status) || 0) + 1);
      
      // Date tracking
      const createDate = new Date(invoice.DATE_CREATE);
      if (!summary.oldestInvoice || createDate < new Date(summary.oldestInvoice.DATE_CREATE)) {
        summary.oldestInvoice = invoice;
      }
      if (!summary.newestInvoice || createDate > new Date(summary.newestInvoice.DATE_CREATE)) {
        summary.newestInvoice = invoice;
      }
    });

    summary.averageAmount = summary.totalAmount / Math.max(invoices.length, 1);
    
    return summary;
  }

  /**
   * Generate HTML report with Bitrix24 2025 styling and clickable invoice headers
   */
  generateHTMLReport(reportData, params) {
    const { invoices, companies, contacts, activities, summary } = reportData;
    
    const html = \`<!DOCTYPE html>
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
                        'bitrix-dark-gray': '#717C8A',
                        'bitrix-border': '#E0E6ED',
                        'bitrix-success': '#10B981',
                        'bitrix-warning': '#F59E0B',
                        'bitrix-danger': '#EF4444'
                    }
                }
            }
        }
    </script>
    <style>
        .bitrix-card {
            background: linear-gradient(145deg, #ffffff 0%, #f8fafc 100%);
            border: 1px solid #e0e6ed;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06);
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
    <!-- Header -->
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

    <!-- Summary Dashboard -->
    <div class="max-w-7xl mx-auto px-4 py-6">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div class="bitrix-card rounded-lg p-6">
                <div class="flex items-center">
                    <div class="text-3xl font-bold text-bitrix-blue">\${summary.totalInvoices}</div>
                    <div class="ml-3">
                        <div class="text-sm font-medium text-bitrix-dark-gray">Total Invoices</div>
                        <div class="text-xs text-gray-500">Open & Outstanding</div>
                    </div>
                </div>
            </div>
            
            <div class="bitrix-card rounded-lg p-6">
                <div class="flex items-center">
                    <div class="text-3xl font-bold text-bitrix-success">$\${summary.totalAmount.toLocaleString()}</div>
                    <div class="ml-3">
                        <div class="text-sm font-medium text-bitrix-dark-gray">Total Amount</div>
                        <div class="text-xs text-gray-500">Outstanding Value</div>
                    </div>
                </div>
            </div>
            
            <div class="bitrix-card rounded-lg p-6">
                <div class="flex items-center">
                    <div class="text-3xl font-bold text-bitrix-warning">$\${Math.round(summary.averageAmount).toLocaleString()}</div>
                    <div class="ml-3">
                        <div class="text-sm font-medium text-bitrix-dark-gray">Average Invoice</div>
                        <div class="text-xs text-gray-500">Per Invoice</div>
                    </div>
                </div>
            </div>
            
            <div class="bitrix-card rounded-lg p-6">
                <div class="flex items-center">
                    <div class="text-3xl font-bold text-bitrix-blue">\${summary.companiesCount + summary.contactsCount}</div>
                    <div class="ml-3">
                        <div class="text-sm font-medium text-bitrix-dark-gray">Clients</div>
                        <div class="text-xs text-gray-500">Companies & Contacts</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Invoices List -->
        <div class="space-y-6">
            <h2 class="text-2xl font-bold text-gray-900 mb-4">Invoice Details</h2>
            
\${invoices.map(invoice => this.generateInvoiceCard(invoice, companies, contacts, activities)).join('')}
        </div>
    </div>
</body>
</html>\`;

    return html;
  }

  /**
   * Extract phone number from Bitrix24 API response array
   * @param {Array|string} phoneData - Phone data from Bitrix24 API
   * @returns {string} - Formatted phone number or empty string
   */
  extractPhoneNumber(phoneData) {
    try {
      if (!phoneData) return '';
      
      // If it's already a string, return it
      if (typeof phoneData === 'string') {
        return phoneData;
      }
      
      // If it's an array, extract the VALUE from the first valid entry
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

  /**
   * Extract email address from Bitrix24 API response array
   * @param {Array|string} emailData - Email data from Bitrix24 API
   * @returns {string} - Email address or empty string
   */
  extractEmailAddress(emailData) {
    try {
      if (!emailData) return '';
      
      // If it's already a string, return it
      if (typeof emailData === 'string') {
        return emailData;
      }
      
      // If it's an array, extract the VALUE from the first valid entry
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

  /**
   * Generate individual invoice card HTML with clickable headers
   */
  generateInvoiceCard(invoice, companies, contacts, activities) {
    const company = companies.get(invoice.UF_COMPANY_ID);
    const contact = contacts.get(invoice.UF_CONTACT_ID);
    const invoiceActivities = activities.get(invoice.ID) || [];
    
    // Debug logging for invoice card generation
    if (invoice.ID && (invoice.ID === '1' || Math.random() < 0.1)) { // Log first invoice and 10% sample
      console.log('Generating invoice card debug info:', {
        invoiceId: invoice.ID,
        companyId: invoice.UF_COMPANY_ID,
        contactId: invoice.UF_CONTACT_ID,
        hasCompany: !!company,
        hasContact: !!contact,
        hasActivities: invoiceActivities.length > 0,
        companyTitle: company ? company.TITLE : 'none',
        contactName: contact ? (contact.NAME + ' ' + (contact.LAST_NAME || '')) : 'none',
        activitiesCount: invoiceActivities.length
      });
    }
    
    const statusClass = invoice.STATUS_ID === 'N' ? 'status-new' : 'status-sent';
    const statusText = invoice.STATUS_ID === 'N' ? 'New' : 'Sent';
    
    // Calculate days old with proper error handling using DATE_INSERT (consistent with filter)
    let daysOld = 0;
    let insertDate = null;
    try {
      // Use DATE_INSERT first (what we filter on), fallback to DATE_CREATE
      const dateField = invoice.DATE_INSERT || invoice.DATE_CREATE;
      if (dateField) {
        insertDate = new Date(dateField);
        // Check if the date is valid
        if (!isNaN(insertDate.getTime())) {
          daysOld = Math.floor((Date.now() - insertDate.getTime()) / (1000 * 60 * 60 * 24));
          // Ensure daysOld is non-negative (handle future dates)
          daysOld = Math.max(0, daysOld);
        } else {
          insertDate = null; // Invalid date
        }
      }
    } catch (error) {
      // If date parsing fails, default to 0 days old
      daysOld = 0;
      insertDate = null;
    }
    
    // Generate Bitrix24 invoice URL
    const invoiceUrl = \`https://your-domain.bitrix24.com/crm/invoice/show/\${invoice.ID}/\`;
    
    return \`
    <div class="bitrix-card rounded-lg p-6 hover:shadow-lg transition-shadow duration-200">
        <!-- Invoice Header with clickable link -->
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
                <p class="text-sm text-bitrix-dark-gray mt-1">\${invoice.TITLE || 'No title'}</p>
            </div>
            <div class="text-right">
                <div class="text-2xl font-bold text-bitrix-blue">\${invoice.CURRENCY || 'USD'} \${parseFloat(invoice.PRICE || 0).toLocaleString()}</div>
                <div class="text-sm text-bitrix-dark-gray">\${daysOld} days old</div>
            </div>
        </div>

        <!-- Client Information -->
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
            
            <div class="space-y-2">
                <h4 class="font-medium text-gray-900">Invoice Details</h4>
                <div class="bg-gray-50 rounded-lg p-3 space-y-1">
                    <div class="text-sm"><span class="font-medium">Created:</span> \${insertDate ? insertDate.toLocaleDateString() : 'Unknown'}</div>
                    <div class="text-sm"><span class="font-medium">Updated:</span> \${new Date(invoice.DATE_UPDATE).toLocaleDateString()}</div>
                    \${invoice.PAY_VOUCHER_NUM ? \`<div class="text-sm"><span class="font-medium">Payment Voucher:</span> \${invoice.PAY_VOUCHER_NUM}</div>\` : ''}
                    \${invoice.UF_DEAL_ID ? \`<div class="text-sm"><span class="font-medium">Deal ID:</span> \${invoice.UF_DEAL_ID}</div>\` : ''}
                    <div class="text-sm">
                        <span class="font-medium">Bitrix24 Link:</span> 
                        <a href="\${invoiceUrl}" target="_blank" class="invoice-link ml-1">
                            View in CRM →
                        </a>
                    </div>
                </div>
            </div>
        </div>

        <!-- Recent Activities -->
        \${invoiceActivities.length > 0 ? \`
        <div class="border-t border-bitrix-border pt-4">
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
}`,

  // Metadata
  createdAt: new Date('2024-10-08'),
  updatedAt: new Date('2024-10-08'),
  createdBy: 'system',
  tags: ['bitrix24', 'invoices', 'financial', 'reporting', 'html', 'crm'],
  priority: 90
};

module.exports = {
  bitrixOpenInvoicesTemplate
};