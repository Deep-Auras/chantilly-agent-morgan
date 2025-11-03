/**
 * Sample Task Template for Chantilly Child Thread Task Execution System
 * 
 * This file demonstrates how to create task templates that can be stored
 * in Firestore and executed by worker processes. The template includes:
 * - Metadata and configuration
 * - Parameter schema for validation
 * - Trigger patterns for auto-detection
 * - JavaScript execution class
 */

// Sample template for financial reporting
const financialReportTemplate = {
  // Template metadata
  templateId: 'financial_report_quarterly',
  name: 'Quarterly Financial Report',
  description: 'Generate comprehensive quarterly financial reports with client analysis and trend insights',
  version: '1.2.0',
  category: 'financial_reporting',
  enabled: true,
  
  // Auto-detection triggers
  triggers: {
    patterns: [
      /quarterly.*report/i,
      /financial.*report.*Q[1-4]/i,
      /revenue.*analysis.*quarter/i,
      /financial.*summary.*\d{4}/i
    ],
    keywords: ['quarterly', 'financial', 'report', 'revenue', 'quarter', 'Q1', 'Q2', 'Q3', 'Q4'],
    contexts: ['financial', 'reporting', 'business_analysis']
  },
  
  // Template definition
  definition: {
    estimatedSteps: 8,
    estimatedDuration: 900000, // 15 minutes
    memoryRequirement: '1GB',
    requiredTools: ['bitrix24_api', 'gemini_ai', 'cloud_storage'],
    
    // Parameter schema for validation
    parameterSchema: {
      type: 'object',
      required: ['dateRange', 'outputFormat'],
      properties: {
        dateRange: {
          type: 'object',
          properties: {
            start: { type: 'string', format: 'date' },
            end: { type: 'string', format: 'date' }
          },
          default: {
            start: '2024-01-01',
            end: '2024-03-31'
          }
        },
        clientFilters: {
          type: 'array',
          items: { type: 'string' },
          default: ['active']
        },
        includeServices: {
          type: 'boolean',
          default: true
        },
        outputFormat: {
          type: 'string',
          enum: ['detailed', 'summary', 'executive'],
          default: 'detailed'
        },
        includeTrends: {
          type: 'boolean',
          default: true
        }
      }
    }
  },
  
  // JavaScript execution script (stored as string in Firestore)
  executionScript: `
class FinancialReportExecutor extends BaseTaskExecutor {
  async execute() {
    try {
      await this.validateParameters();
      
      // Step 1: Initialize
      await this.updateProgress(10, "Initializing financial report generation", "initialize");
      
      const { dateRange, clientFilters, includeServices, outputFormat, includeTrends } = this.parameters;
      const results = {
        reportData: {},
        trends: {},
        summary: "",
        attachments: [],
        executionTime: 0,
        resourceUsage: {}
      };

      // Step 2: Fetch invoice data with streaming
      await this.updateProgress(20, "Fetching invoice data", "fetch_invoices");
      
      const invoices = await this.streamingFetch('crm.invoice.list', {
        filter: {
          '>=DATE_CREATE': dateRange.start,
          '<=DATE_CREATE': dateRange.end
        },
        select: ['ID', 'STATUS_ID', 'PRICE', 'CURRENCY', 'DATE_CREATE', 'COMPANY_ID', 'CONTACT_ID']
      }, {
        batchSize: 50,
        progressCallback: (processed, total) => {
          this.updateProgress(20 + (processed / total) * 15, \`Processed \${processed} invoices\`, "fetch_invoices");
        }
      });

      this.log('info', 'Invoices fetched', { count: invoices.length });

      // Step 3: Enrich with client data
      await this.updateProgress(40, "Enriching with client information", "enrich_clients");
      
      const uniqueCompanyIds = [...new Set(invoices.map(inv => inv.COMPANY_ID).filter(Boolean))];
      const companies = await this.streamingFetch('crm.company.list', {
        filter: { ID: uniqueCompanyIds },
        select: ['ID', 'TITLE', 'COMPANY_TYPE', 'INDUSTRY', 'EMPLOYEES']
      });

      // Create lookup map
      const companyMap = new Map(companies.map(comp => [comp.ID, comp]));

      // Step 4: Process and analyze data
      await this.updateProgress(55, "Processing financial data", "process_data");
      
      const enrichedInvoices = invoices.map(invoice => ({
        ...invoice,
        company: companyMap.get(invoice.COMPANY_ID) || null,
        amount: parseFloat(invoice.PRICE || 0),
        quarter: this.getQuarter(invoice.DATE_CREATE)
      }));

      // Calculate metrics
      const metrics = this.calculateMetrics(enrichedInvoices, dateRange);
      results.reportData = metrics;

      // Step 5: Generate AI insights (if trends requested)
      if (includeTrends) {
        await this.updateProgress(70, "Generating AI insights", "ai_analysis");
        
        const aiPrompt = \`Analyze this financial data and provide insights:
        
Total Revenue: $\${metrics.totalRevenue.toLocaleString()}
Invoice Count: \${metrics.invoiceCount}
Average Deal: $\${metrics.averageDeal.toLocaleString()}
Top Industries: \${metrics.topIndustries.slice(0, 3).map(i => i.name).join(', ')}

Previous Period Comparison:
- Revenue Growth: \${metrics.growth.revenue}%
- Volume Growth: \${metrics.growth.invoiceCount}%

Provide:
1. Key insights about performance
2. Industry trends observed
3. Recommendations for improvement
4. Risk factors to monitor\`;

        const aiInsights = await this.callGemini(aiPrompt, { maxTokens: 2048 });
        results.trends = { insights: aiInsights };
      }

      // Step 6: Generate report summary
      await this.updateProgress(85, "Generating report summary", "generate_summary");
      
      results.summary = this.generateSummary(metrics, results.trends);

      // Step 7: Create checkpoint
      await this.createCheckpoint("data_processing", {
        metricsGenerated: true,
        aiInsightsIncluded: includeTrends,
        invoiceCount: invoices.length
      });

      // Step 8: Finalize
      await this.updateProgress(100, "Financial report completed", "finalize");
      
      results.executionTime = Date.now() - this.startTime;
      results.resourceUsage = this.getExecutionSummary().resourceUsage;

      this.log('info', 'Financial report generated successfully', {
        totalRevenue: metrics.totalRevenue,
        invoiceCount: metrics.invoiceCount,
        executionTime: results.executionTime
      });

      return results;
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  calculateMetrics(invoices, dateRange) {
    const metrics = {
      totalRevenue: 0,
      invoiceCount: invoices.length,
      averageDeal: 0,
      paidInvoices: 0,
      pendingInvoices: 0,
      topIndustries: [],
      monthlyBreakdown: {},
      growth: { revenue: 0, invoiceCount: 0 }
    };

    // Calculate totals
    invoices.forEach(invoice => {
      metrics.totalRevenue += invoice.amount;
      if (invoice.STATUS_ID === 'P') metrics.paidInvoices++;
      if (invoice.STATUS_ID === 'N') metrics.pendingInvoices++;
    });

    metrics.averageDeal = metrics.totalRevenue / Math.max(metrics.invoiceCount, 1);

    // Industry analysis
    const industryMap = new Map();
    invoices.forEach(invoice => {
      if (invoice.company?.INDUSTRY) {
        const industry = invoice.company.INDUSTRY;
        industryMap.set(industry, (industryMap.get(industry) || 0) + invoice.amount);
      }
    });

    metrics.topIndustries = Array.from(industryMap.entries())
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue);

    return metrics;
  }

  generateSummary(metrics, trends) {
    let summary = \`📊 **Quarterly Financial Report Summary**

**Key Metrics:**
• Total Revenue: $\${metrics.totalRevenue.toLocaleString()}
• Invoice Count: \${metrics.invoiceCount}
• Average Deal Size: $\${metrics.averageDeal.toLocaleString()}
• Payment Status: \${metrics.paidInvoices} paid, \${metrics.pendingInvoices} pending

**Top Industries:**\`;

    metrics.topIndustries.slice(0, 3).forEach((industry, index) => {
      summary += \`\\n\${index + 1}. \${industry.name}: $\${industry.revenue.toLocaleString()}\`;
    });

    if (trends?.insights) {
      summary += \`\\n\\n**AI Insights:**\\n\${trends.insights}\`;
    }

    summary += \`\\n\\n*Report generated on \${new Date().toLocaleDateString()}*\`;

    return summary;
  }

  getQuarter(dateString) {
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    return Math.ceil(month / 3);
  }
}`,

  // Metadata
  createdAt: new Date('2024-10-01'),
  updatedAt: new Date('2024-10-08'),
  createdBy: 'system',
  tags: ['finance', 'reporting', 'quarterly', 'analysis'],
  priority: 80
};

// Sample template for client portfolio analysis
const clientAnalysisTemplate = {
  templateId: 'client_analysis_comprehensive',
  name: 'Comprehensive Client Portfolio Analysis',
  description: 'Deep analysis of client portfolio with engagement metrics, revenue trends, and growth opportunities',
  version: '1.0.0',
  category: 'client_management',
  enabled: true,
  
  triggers: {
    patterns: [
      /client.*portfolio.*analysis/i,
      /comprehensive.*client.*review/i,
      /customer.*analysis.*report/i,
      /client.*engagement.*metrics/i
    ],
    keywords: ['client', 'portfolio', 'analysis', 'comprehensive', 'customer', 'engagement'],
    contexts: ['client_management', 'business_analysis']
  },
  
  definition: {
    estimatedSteps: 6,
    estimatedDuration: 600000, // 10 minutes
    memoryRequirement: '512MB',
    requiredTools: ['bitrix24_api', 'gemini_ai'],
    
    parameterSchema: {
      type: 'object',
      required: ['analysisType'],
      properties: {
        analysisType: {
          type: 'string',
          enum: ['revenue', 'engagement', 'growth', 'full'],
          default: 'full'
        },
        clientSegment: {
          type: 'string',
          enum: ['all', 'enterprise', 'small_business', 'individual'],
          default: 'all'
        },
        timeframe: {
          type: 'string',
          enum: ['last_month', 'last_quarter', 'last_year', 'ytd'],
          default: 'last_quarter'
        },
        includeRecommendations: {
          type: 'boolean',
          default: true
        }
      }
    }
  },
  
  executionScript: `
class ClientAnalysisExecutor extends BaseTaskExecutor {
  async execute() {
    try {
      await this.validateParameters();
      
      await this.updateProgress(15, "Starting client portfolio analysis", "initialize");
      
      const { analysisType, clientSegment, timeframe, includeRecommendations } = this.parameters;
      
      // Implementation would go here...
      // This is a simplified version for demonstration
      
      await this.updateProgress(100, "Analysis completed", "finalize");
      
      return {
        summary: "Client portfolio analysis completed successfully",
        executionTime: Date.now() - this.startTime,
        resourceUsage: this.getExecutionSummary().resourceUsage
      };
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }
}`,

  createdAt: new Date('2024-10-08'),
  updatedAt: new Date('2024-10-08'),
  createdBy: 'system',
  tags: ['client', 'analysis', 'portfolio', 'crm'],
  priority: 70
};

module.exports = {
  financialReportTemplate,
  clientAnalysisTemplate
};