const BaseTool = require('../lib/baseTool');
const { validate, addHeaders, sanitizeContent } = require('../utils/drawioXMLValidator');
const { logger } = require('../utils/logger');

// Lazy load Gemini dependency to avoid env validation during tool loading
let getGeminiModel;
let extractGeminiText;
function getGeminiDependency() {
  if (!getGeminiModel) {
    try {
      const geminiModule = require('../config/gemini');
      getGeminiModel = geminiModule.getGeminiModel;
      extractGeminiText = geminiModule.extractGeminiText;
    } catch (error) {
      getGeminiModel = null;
      extractGeminiText = null;
    }
  }
  return getGeminiModel;
}

// Lazy load file storage dependencies to avoid env validation errors during tool loading
let uploadDrawioFile;
let sendFileMessage;

function getFileStorageDependencies() {
  logger.debug('Starting file storage dependency loading');

  if (!uploadDrawioFile) {
    try {
      logger.debug('Attempting to load fileStorage module');
      const fileStorageModule = require('../utils/fileStorage');
      logger.debug('fileStorage module loaded', { exports: Object.keys(fileStorageModule) });

      logger.debug('Attempting to load bitrixFileUpload module');
      const bitrixFileUploadModule = require('../utils/bitrixFileUpload');
      logger.debug('bitrixFileUpload module loaded', { exports: Object.keys(bitrixFileUploadModule) });

      uploadDrawioFile = fileStorageModule.uploadDrawioFile;
      sendFileMessage = bitrixFileUploadModule.sendFileMessage;

      logger.info('File storage dependencies loaded successfully', {
        hasUploadDrawioFile: typeof uploadDrawioFile === 'function',
        hasSendFileMessage: typeof sendFileMessage === 'function'
      });
    } catch (error) {
      // Dependencies not available - will fall back to XML content
      logger.warn('File storage dependencies failed to load', {
        error: error.message,
        stack: error.stack
      });
      uploadDrawioFile = null;
      sendFileMessage = null;
    }
  } else {
    logger.debug('File storage dependencies already loaded');
  }

  return { uploadDrawioFile, sendFileMessage };
}

class DrawioGeneratorTool extends BaseTool {
  constructor(context) {
    super(context);
    this.name = 'DrawioGenerator';
    this.description = 'Generates interactive .drawio diagrams from text content, chat summaries, or structured information. Creates flowcharts, mind maps, process diagrams, and decision trees.';
    this.userDescription = 'Create visual diagrams and flowcharts from text';
    this.category = 'visualization';
    this.version = '1.0.0';
    this.author = 'Chantilly Agent';
    this.priority = 50; // Medium priority - executes after knowledge/summary tools but before others

    this.parameters = {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Text content to convert into a diagram (bullet points, steps, decisions, etc.)'
        },
        diagramType: {
          type: 'string',
          enum: ['flowchart', 'mindmap', 'process', 'decision_tree', 'network', 'auto'],
          description: 'Type of diagram to generate',
          default: 'auto'
        },
        title: {
          type: 'string',
          description: 'Title for the diagram'
        },
        useLastMessage: {
          type: 'boolean',
          description: 'Use the previous message/response content for diagram generation',
          default: false
        },
        includeMetadata: {
          type: 'boolean',
          description: 'Include metadata like timestamp and chat info in diagram',
          default: true
        }
      },
      required: []
    };

    // Cache for recent message content (for proactive suggestions)
    this.messageHistory = new Map();
    this.maxHistorySize = 10;
  }

  async shouldTrigger(message, toolContext = {}) {
    try {
      const lowerMessage = message.toLowerCase();
      
      // Direct diagram generation requests
      const diagramTriggers = [
        // Direct requests
        /create.{0,20}diagram/i,
        /generate.{0,20}diagram/i,
        /make.{0,20}diagram/i,
        /draw.{0,20}diagram/i,
        /flowchart/i,
        /mind.{0,10}map/i,
        
        // Chart requests
        /make.{0,20}chart/i,
        /create.{0,20}chart/i,
        /generate.{0,20}chart/i,
        /\bchart\b/i,
        
        // Draw.io specific
        /drawio/i,
        /draw\.io/i,
        /\.drawio/i,
        
        // Visual representation requests
        /visualize.{0,20}this/i,
        /visual.{0,20}representation/i,
        /chart.{0,20}this/i,
        /map.{0,20}this/i,
        
        // Process/flow requests
        /process.{0,20}diagram/i,
        /workflow.{0,20}diagram/i,
        /decision.{0,20}tree/i,
        /flow.{0,20}chart/i,
        
        // Generic visualization
        /turn.{0,20}into.{0,20}diagram/i,
        /convert.{0,20}to.{0,20}diagram/i,
        /show.{0,20}as.{0,20}diagram/i
      ];

      const isTriggered = diagramTriggers.some(trigger => trigger.test(message));
      
      if (isTriggered) {
        this.log('info', 'Diagram generation request detected', {
          hasContent: message.length > 20
        });
        return true;
      }

      return false;
    } catch (error) {
      this.log('error', 'Error in shouldTrigger', { error: error.message });
      return false;
    }
  }

  /**
   * Proactive suggestion system - suggests diagram generation for suitable content
   * @param {string} message - User message
   * @param {Object} toolContext - Tool context including previous results
   * @returns {boolean} - Whether to suggest this tool
   */
  shouldSuggest(message, toolContext = {}) {
    try {
      // Don't suggest if tool was already triggered
      if (this.shouldTrigger(message, toolContext)) {
        return false;
      }

      // Check if previous tool results are suitable for visualization
      const previousResults = toolContext.previousToolResults || [];
      const hasStructuredContent = previousResults.some(result => 
        this.isContentSuitableForDiagram(result.content || result.response || '')
      );

      if (hasStructuredContent) {
        this.log('debug', 'Suggesting diagram generation for structured content');
        return true;
      }

      // Check if current message has structured content
      const messageContent = this.extractStructuredContent(message);
      if (messageContent.items.length >= 3) {
        this.log('debug', 'Suggesting diagram generation for current message');
        return true;
      }

      // Store message for potential chaining
      this.storeMessageHistory(message, toolContext);

      return false;
    } catch (error) {
      return false;
    }
  }

  async execute(params, toolContext = {}) {
    // Define variables at function scope to avoid reference errors
    let finalDiagramType = 'auto';
    let diagramContent = '';
    let diagramTitle = '';
    
    try {
      const {
        content,
        diagramType = 'auto',
        title,
        useLastMessage = false,
        includeMetadata = true
      } = params;

      const messageData = toolContext.messageData || {};

      this.log('info', 'Starting diagram generation', {
        diagramType,
        hasContent: !!content,
        useLastMessage,
        dialogId: messageData.dialogId
      });

      // Determine content source
      diagramContent = content || '';
      diagramTitle = title || '';
      
      if (!diagramContent || useLastMessage) {
        // Use previous tool results or message content
        const sourceContent = this.getContentForDiagram(toolContext, messageData);
        diagramContent = sourceContent.content;
        diagramTitle = diagramTitle || sourceContent.title;
      }

      if (!diagramContent) {
        return 'I need some content to create a diagram. Please provide text with bullet points, steps, decisions, or structured information.';
      }

      // Validate content suitability
      this.log('info', 'Validating content for diagram generation', {
        contentLength: diagramContent.length,
        diagramType,
        contentPreview: diagramContent.substring(0, 100)
      });

      if (!this.validateContent(diagramContent, diagramType)) {
        this.log('warn', 'Content validation failed', {
          content: diagramContent,
          diagramType
        });
        return 'The provided content doesn\'t seem suitable for diagram generation. I need structured content like bullet points, numbered lists, or step-by-step processes.';
      }

      this.log('info', 'Content validation passed', {
        diagramType,
        contentLength: diagramContent.length
      });

      // Determine optimal diagram type if auto
      finalDiagramType = diagramType === 'auto' ? 
        this.determineBestDiagramType(diagramContent) : diagramType;

      // Generate diagram metadata
      const metadata = {
        dialogId: messageData.dialogId,
        userId: messageData.userId,
        timestamp: new Date().toISOString(),
        messageCount: toolContext.knowledgeResults?.length,
        canvasSettings: includeMetadata ? {
          pageWidth: '827',
          pageHeight: '1169'
        } : undefined
      };

      // Generate the diagram XML using Gemini agentic approach
      this.log('info', 'Starting agentic diagram generation with Gemini', {
        diagramType: finalDiagramType,
        contentLength: diagramContent.length,
        hasContent: !!diagramContent
      });

      let diagramXML;
      try {
        diagramXML = await this.generateAgenticDiagram(diagramContent, finalDiagramType, diagramTitle, toolContext);
      } catch (agenticError) {
        this.log('error', 'Agentic generation failed, cannot proceed', {
          error: agenticError.message,
          diagramType: finalDiagramType,
          contentLength: diagramContent.length
        });
        
        // Return useful error message instead of crashing
        return `I'm sorry, but I'm currently unable to generate diagrams due to a technical issue with the AI diagram generation system. The system timed out after trying for ${Math.round(300/60)} minutes. Please try again later or contact support if this issue persists.`;
      }
      
      const filename = this.generateFilename(finalDiagramType, metadata);

      this.log('info', 'Diagram XML generated successfully, checking file storage dependencies', {
        diagramType: finalDiagramType,
        filename,
        xmlLength: diagramXML ? diagramXML.length : 0,
        hasXML: !!diagramXML
      });

      // Phase 2: Upload file and send as attachment (with fallback)
      const { uploadDrawioFile: upload } = getFileStorageDependencies();
      
      if (upload) {
        let uploadResult = null;
        try {
          // Upload .drawio file to Google Cloud Storage
          uploadResult = await upload(diagramXML, filename, {
            dialogId: messageData.dialogId,
            userId: messageData.userId,
            diagramType: finalDiagramType,
            contentPreview: diagramContent.substring(0, 100)
          });

          if (!uploadResult.success) {
            throw new Error('Failed to upload diagram file');
          }

          // Store the upload result for potential fallback use
          this.lastUploadResult = uploadResult;

          // Send file attachment message to Bitrix24
          const fileMessage = this.formatFileAttachmentMessage(
            diagramTitle || `${finalDiagramType} Diagram`, 
            finalDiagramType, 
            filename
          );

          // Log the URL to debug BB code corruption
          this.log('info', 'Sending file attachment with URL', {
            publicUrl: uploadResult.publicUrl,
            filename: uploadResult.filename,
            urlLength: uploadResult.publicUrl.length
          });

          // Send message with download link (file attachments removed)
          const queue = require('../services/bitrix24-queue').getQueueManager();
          const messageWithDownload = `${fileMessage}

📥 [Download ${uploadResult.filename}](${uploadResult.publicUrl})

`;

          // Debug log the exact message being sent
          this.log('info', 'Sending message with download link', {
            originalMessage: messageWithDownload,
            messageLength: messageWithDownload.length,
            containsPublicUrl: messageWithDownload.includes(uploadResult.publicUrl),
            publicUrl: uploadResult.publicUrl,
            markdownLinkCount: (messageWithDownload.match(/\[.*?\]\(.*?\)/g) || []).length
          });

          const messageResult = await queue.add({
            method: 'imbot.message.add',
            params: {
              DIALOG_ID: messageData.dialogId,
              MESSAGE: messageWithDownload,
              URL_PREVIEW: 'N' // Disable URL preview to keep message clean
            }
          });

          if (messageResult && messageResult.result) {
            this.log('info', 'Diagram download link sent successfully', {
              diagramType: finalDiagramType,
              filename: uploadResult.filename,
              fileUrl: uploadResult.publicUrl,
              messageId: messageResult.result
            });

            // Return null to prevent duplicate message - direct message already sent
            return null;
          } else {
            throw new Error('Failed to send download link message');
          }

        } catch (fileError) {
          this.log('warn', 'File attachment failed, falling back to download link', {
            error: fileError.message,
            diagramType: finalDiagramType,
            filename,
            fileUrl: uploadResult ? uploadResult.publicUrl : 'upload failed'
          });
          
          // Store the upload result for fallback (if upload succeeded but attachment failed)
          if (uploadResult) {
            this.lastUploadResult = uploadResult;
          }
        }
      } else {
        this.log('info', 'File storage not available, using XML content fallback', {
          diagramType: finalDiagramType,
          filename,
          hasUpload: !!upload
        });
      }

      // Fallback to download link if file upload succeeded but attachment failed
      this.log('info', 'Using download link fallback', {
        diagramType: finalDiagramType,
        filename,
        hasXML: !!diagramXML
      });

      // If we reach here, it means no direct message was sent, so return null to prevent any duplicate
      this.log('info', 'Diagram generation completed successfully', {
        diagramType: finalDiagramType,
        title: diagramTitle,
        filename: filename
      });

      return null;

    } catch (error) {
      this.log('error', 'Diagram generation failed', {
        error: error.message,
        stack: error.stack,
        diagramType: finalDiagramType || 'unknown',
        hasContent: !!diagramContent
      });
      return 'I encountered an error while generating your diagram. Please try again with simpler content or check that your text is properly structured.';
    }
  }

  /**
   * Get content for diagram generation from various sources
   * @param {Object} toolContext - Tool execution context
   * @param {Object} messageData - Message data
   * @returns {Object} - Content and title for diagram
   */
  getContentForDiagram(toolContext, messageData) {
    // Priority order: previous tool results > knowledge results > message content
    
    // Check previous tool results first (tool chaining)
    const previousResults = toolContext.previousToolResults || [];
    for (const result of previousResults) {
      const content = result.content || result.response || result.message || '';
      if (this.isContentSuitableForDiagram(content)) {
        return {
          content: content,
          title: this.extractTitle(content) || `${result.toolName} Results`
        };
      }
    }

    // Check knowledge base results
    const knowledgeResults = toolContext.knowledgeResults || [];
    if (knowledgeResults.length > 0) {
      const combinedContent = knowledgeResults
        .map(result => `• ${result.title}: ${result.preview || result.content}`)
        .join('\n');
      
      if (this.isContentSuitableForDiagram(combinedContent)) {
        return {
          content: combinedContent,
          title: 'Knowledge Base Information'
        };
      }
    }

    // Use current message content
    const messageContent = messageData.message || '';
    return {
      content: messageContent,
      title: this.extractTitle(messageContent) || 'Chat Diagram'
    };
  }

  /**
   * Check if content is suitable for diagram generation
   * @param {string} content - Content to check
   * @returns {boolean} - Whether content is suitable
   */
  isContentSuitableForDiagram(content) {
    if (!content || content.length < 50) {return false;}

    // Look for structured content indicators
    const structurePatterns = [
      /[•\-\*]\s+/g,          // Bullet points
      /\d+\.\s+/g,            // Numbered lists
      /^#{1,6}\s+/gm,         // Headers
      /step\s+\d+/gi,         // Steps
      /process/gi,            // Process mentions
      /decision/gi,           // Decision mentions
      /workflow/gi,           // Workflow mentions
      /\n.*\n.*\n/            // Multiple lines
    ];

    const matches = structurePatterns.reduce((count, pattern) => {
      const found = content.match(pattern);
      return count + (found ? found.length : 0);
    }, 0);

    return matches >= 3;
  }

  /**
   * Extract structured content from text
   * @param {string} text - Text to analyze
   * @returns {Object} - Structured content
   */
  extractStructuredContent(text) {
    const items = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.match(/^[•\-\*]\s+/) || trimmed.match(/^\d+\.\s+/)) {
        items.push(trimmed);
      }
    }

    return { items, hasStructure: items.length >= 3 };
  }

  /**
   * Generate diagram using Gemini agentic approach
   * @param {string} content - Content to visualize
   * @param {string} diagramType - Type of diagram to create
   * @param {string} title - Diagram title
   * @param {Object} toolContext - Tool execution context with knowledge base
   * @returns {string} - Complete draw.io XML
   */
  async generateAgenticDiagram(content, diagramType, title, toolContext) {
    try {
      // 1. Search knowledge base for relevant draw.io examples
      const examples = await this.searchDrawioExamples(diagramType, toolContext);
      
      // 2. Build comprehensive Gemini prompt
      const prompt = this.buildAgenticPrompt(content, diagramType, title, examples);
      
      // 3. Generate XML with Gemini using proper API structure
      const gemini = getGeminiDependency();
      if (!gemini) {
        throw new Error('Gemini dependency not available');
      }

      const model = gemini();
      
      this.log('info', 'Sending agentic generation request to Gemini', {
        diagramType,
        contentLength: content.length,
        exampleCount: examples.length,
        promptLength: prompt.length
      });

      let result;
      try {
        result = await Promise.race([
          model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7, // Balance creativity with consistency
              maxOutputTokens: 65535, // Maximum allowed by Gemini 2.5 Pro
              topP: 0.8,
              topK: 40
            }
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Gemini request timeout after 5 minutes')), 300000)
          )
        ]);
      } catch (geminiError) {
        this.log('error', 'Gemini API call failed', {
          error: geminiError.message,
          errorType: geminiError.constructor.name,
          stack: geminiError.stack,
          promptLength: prompt.length
        });
        throw geminiError;
      }
      
      this.log('info', 'Gemini API response received', {
        hasResult: !!result,
        resultType: typeof result,
        hasCandidates: !!(result && result.candidates),
        candidatesLength: result && result.candidates ? result.candidates.length : 0,
        hasFirstCandidate: !!(result && result.candidates && result.candidates[0]),
        hasContent: !!(result && result.candidates && result.candidates[0] && result.candidates[0].content),
        hasParts: !!(result && result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts),
        partsLength: result && result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts ? result.candidates[0].content.parts.length : 0
      });
      
      if (!result) {
        throw new Error('Gemini API returned null/undefined result');
      }
      
      if (!result.candidates || !result.candidates[0]) {
        throw new Error('Gemini API returned result but no candidates');
      }
      
      if (!result.candidates[0].content || !result.candidates[0].content.parts) {
        throw new Error('Gemini API returned candidate but no content/parts');
      }

      // Use centralized response extraction
      const responseText = extractGeminiText(result);

      if (!responseText) {
        throw new Error('Gemini API returned empty response text');
      }
      
      let rawXML = responseText;
      
      this.log('info', 'Received XML from Gemini, processing', {
        rawXMLLength: rawXML.length,
        hasXMLDeclaration: rawXML.includes('<?xml'),
        hasMxfile: rawXML.includes('<mxfile')
      });
      
      // 4. Clean and validate XML
      rawXML = this.cleanGeneratedXML(rawXML);
      
      // 5. Validate XML structure (log-only, don't repair)
      const validation = validate(rawXML);
      if (!validation.isValid) {
        this.log('warn', 'Generated XML validation failed - proceeding with agentic XML anyway', {
          errors: validation.errors,
          warnings: validation.warnings,
          xmlLength: rawXML.length,
          structureInfo: validation.structure,
          note: 'Using agentic XML despite validation issues - will monitor for actual functionality problems'
        });
      } else {
        this.log('info', 'Generated XML validation passed', {
          xmlLength: rawXML.length,
          structureInfo: validation.structure
        });
      }
      
      // 6. Add proper headers and metadata
      const finalXML = addHeaders(rawXML, {
        title: title || `${diagramType} Diagram`,
        filename: this.generateFilename(diagramType, { dialogId: toolContext.messageData?.dialogId })
      });

      this.log('info', 'Agentic diagram XML generated successfully - using original Gemini output', {
        diagramType,
        originalXmlLength: rawXML.length,
        finalXmlLength: finalXML.length,
        validationPassed: validation.isValid,
        note: 'No repair/fallback applied - pure agentic generation',
        hasExamples: examples.length > 0
      });

      return finalXML;

    } catch (error) {
      this.log('error', 'Agentic diagram generation failed completely', {
        error: error.message,
        stack: error.stack,
        diagramType,
        contentLength: content.length
      });
      
      // FAIL COMPLETELY - No fallback at main level
      throw new Error(`Agentic diagram generation failed: ${error.message}. Tool execution stopped.`);
    }
  }

  /**
   * Search knowledge base for relevant draw.io examples
   * @param {string} diagramType - Type of diagram
   * @param {Object} toolContext - Tool context with knowledge base access
   * @returns {Array} - Array of relevant examples
   */
  async searchDrawioExamples(diagramType, toolContext) {
    try {
      // Search for draw.io examples in knowledge base
      let examples = [];
      
      // First, check if we have existing knowledge results with drawio examples
      if (toolContext.knowledgeResults && toolContext.knowledgeResults.length > 0) {
        // Filter existing knowledge results for drawio examples
        examples = toolContext.knowledgeResults
          .filter(result => 
            result.tags && result.tags.includes('drawio') &&
            (result.tags.includes(diagramType) || result.content.includes('mxfile'))
          )
          .slice(0, 2); // Limit to 2 most relevant examples
      }

      // If no examples found in existing context, try to search knowledge base directly
      if (examples.length === 0) {
        try {
          // Try to access knowledge management service for direct search
          const { getKnowledgeManagementService } = require('../services/knowledge');
          const knowledgeService = getKnowledgeManagementService();
          
          const searchResults = await knowledgeService.search({
            query: `drawio ${diagramType}`,
            maxResults: 2,
            minRelevance: 0.1
          });

          if (searchResults && searchResults.length > 0) {
            examples = searchResults.filter(result => 
              result.tags && result.tags.includes('drawio')
            );
          }
        } catch (searchError) {
          this.log('debug', 'Direct knowledge base search failed', { 
            error: searchError.message 
          });
        }
      }

      this.log('info', 'Found draw.io examples for agentic generation', {
        diagramType,
        exampleCount: examples.length,
        exampleTitles: examples.map(e => e.title),
        searchMethod: examples.length > 0 ? 'found' : 'none_available'
      });

      return examples;

    } catch (error) {
      this.log('warn', 'Failed to search for draw.io examples', { error: error.message });
      return [];
    }
  }

  /**
   * Build comprehensive prompt for Gemini agentic generation
   * @param {string} content - Content to visualize
   * @param {string} diagramType - Type of diagram
   * @param {string} title - Diagram title
   * @param {Array} examples - Knowledge base examples
   * @returns {string} - Complete prompt for Gemini
   */
  buildAgenticPrompt(content, diagramType, title, examples) {
    const exampleXML = examples.length > 0 
      ? examples.map(ex => `Example "${ex.title}":\n${ex.content.substring(0, 2000)}...`).join('\n\n')
      : '';

    return `You are a professional diagram designer creating draw.io XML diagrams that look human-designed and visually appealing.

CONTENT TO VISUALIZE:
${content}

DIAGRAM TYPE: ${diagramType}
TITLE: ${title || 'Diagram'}

${examples.length > 0 ? `EXAMPLES FROM KNOWLEDGE BASE:
${exampleXML}

LEARN FROM THESE EXAMPLES:
- Note the professional styling with gradients and colors
- Observe the creative positioning and spacing
- See how text is formatted and labels are used
- Notice the variety in shapes and connector styles
` : ''}

REQUIREMENTS FOR HUMAN-LIKE DESIGN:
1. Use varied, complementary colors (gradients encouraged)
2. Apply creative, non-rigid positioning with good spacing
3. Include visual hierarchy with different sizes and styles  
4. Use modern styling with rounded corners and shadows
5. Add meaningful icons/emojis where appropriate
6. Create organic layouts, not rigid grids
7. Use professional fonts (Segoe UI, Arial) with proper sizes
8. Apply consistent but varied visual elements

TECHNICAL REQUIREMENTS:
- Generate complete, valid draw.io XML starting with <?xml version="1.0" encoding="UTF-8"?>
- Include proper mxfile, diagram, mxGraphModel, and root structure
- CRITICAL: Use unique cell IDs for all elements. Root cells must be "0" and "1", all other cells must use unique IDs like "2", "3", "4", etc. NEVER duplicate ID "1"
- CRITICAL: Do not add grid or grid lines
- Include proper mxGeometry with x, y, width, height
- Apply style strings with semicolon separation
- Use vertex="1" for shapes, edge="1" for connectors
- Include source/target relationships for edges
- Ensure all cells have parent relationships

STYLE GUIDELINES:
- Colors: Use hex values like #667aff, #ff6b9d, #4ecdc4, #feca57
- Shapes: rounded=1, shadow=1, gradientColor for depth
- Typography: fontFamily=Segoe UI, fontSize appropriate to element
- Spacing: Leave adequate whitespace between elements
- Connections: Use rounded, colored connectors with appropriate arrows

Generate a creative, professional diagram that looks like it was designed by a skilled human designer. Make it visually engaging while accurately representing the content structure.

GENERATE COMPLETE XML NOW:`;
  }

  /**
   * Clean generated XML from Gemini response
   * @param {string} rawXML - Raw XML from Gemini
   * @returns {string} - Cleaned XML
   */
  cleanGeneratedXML(rawXML) {
    // Remove any markdown code blocks
    let cleaned = rawXML.replace(/```xml\n?/g, '').replace(/```\n?/g, '');
    
    // Ensure it starts with XML declaration
    if (!cleaned.includes('<?xml')) {
      cleaned = '<?xml version="1.0" encoding="UTF-8"?>\n' + cleaned;
    }
    
    // Remove any text before the XML declaration
    const xmlStart = cleaned.indexOf('<?xml');
    if (xmlStart > 0) {
      cleaned = cleaned.substring(xmlStart);
    }
    
    // Remove any text after the closing mxfile tag
    const xmlEnd = cleaned.lastIndexOf('</mxfile>');
    if (xmlEnd !== -1) {
      cleaned = cleaned.substring(0, xmlEnd + 9);
    }

    return cleaned.trim();
  }

  /**
   * Attempt to repair invalid XML
   * @param {string} invalidXML - Invalid XML string
   * @param {string} content - Original content
   * @param {string} diagramType - Diagram type
   * @returns {string} - Repaired XML or fallback
   */
  async repairInvalidXML(invalidXML, content, diagramType) {
    this.log('info', 'Attempting XML repair through Gemini');
    
    try {
      const gemini = getGeminiDependency();
      const model = gemini();
      
      const repairPrompt = `The following draw.io XML has validation errors. Please fix it and return only the corrected XML:

INVALID XML:
${invalidXML.substring(0, 4000)}${invalidXML.length > 4000 ? '...[truncated]' : ''}

Fix these common issues:
- Ensure unique cell IDs
- Add missing required elements (mxCell id="0" and id="1")
- Fix malformed mxGeometry elements
- Correct style string formatting
- Ensure proper parent-child relationships

Return only the corrected XML starting with <?xml version="1.0" encoding="UTF-8"?>`;

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: repairPrompt }] }],
        generationConfig: {
          temperature: 0.1, // Low temperature for precise repair
          maxOutputTokens: 8192
        }
      });

      if (!result.response || !result.response.text()) {
        throw new Error('No repair response received from Gemini');
      }

      return this.cleanGeneratedXML(result.response.text());
      
    } catch (error) {
      this.log('warn', 'XML repair failed, using fallback', { error: error.message });
      return this.generateFallbackDiagram(content, diagramType, 'Diagram');
    }
  }

  /**
   * Generate simple fallback diagram when agentic generation fails
   * @param {string} content - Content to visualize
   * @param {string} diagramType - Diagram type
   * @param {string} title - Diagram title
   * @returns {string} - Simple XML diagram
   */
  generateFallbackDiagram(content, diagramType, title) {
    const titleText = sanitizeContent(title || 'Diagram');
    const lines = content.split('\n').filter(line => line.trim() && line.length > 5);
    
    let elements = '';
    let yPosition = 120;
    
    // Create flowchart-style fallback with connected elements
    for (let i = 0; i < Math.min(lines.length, 6); i++) {
      const lineText = sanitizeContent(lines[i].substring(0, 100));
      const cellId = `step${i + 1}`;
      const nextCellId = i < Math.min(lines.length, 6) - 1 ? `step${i + 2}` : null;
      
      // Create step box
      elements += `
        <mxCell id="${cellId}" value="${lineText}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontFamily=Segoe UI;fontSize=11;gradientColor=#d5b4f0;shadow=1;" vertex="1" parent="1">
          <mxGeometry x="200" y="${yPosition}" width="300" height="60" as="geometry" />
        </mxCell>`;
      
      // Create connector arrow to next step
      if (nextCellId) {
        elements += `
        <mxCell id="edge${i + 1}" edge="1" source="${cellId}" target="${nextCellId}" parent="1" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;strokeColor=#666666;endArrow=classic;endFill=1;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>`;
      }
      
      yPosition += 100;
    }
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="Chantilly" modified="${new Date().toISOString()}" agent="Chantilly Agent" version="21.6.5" type="device">
  <diagram name="${titleText}" id="fallback">
    <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" background="#ffffff" math="0" shadow="1">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        
        <!-- Title -->
        <mxCell id="title" value="${titleText}" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=16;fontStyle=1;fontColor=#2c3e50;" vertex="1" parent="1">
          <mxGeometry x="200" y="50" width="300" height="40" as="geometry" />
        </mxCell>
        
        <!-- Process Steps -->
        ${elements}
        
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
  }

  /**
   * Determine the best diagram type for given content
   * @param {string} content - Content to analyze
   * @returns {string} - Best diagram type
   */
  determineBestDiagramType(content) {
    const lowerContent = content.toLowerCase();

    // Decision tree indicators
    if (lowerContent.includes('decision') || lowerContent.includes('if ') || 
        lowerContent.includes('choose') || content.includes('?')) {
      return 'flowchart';
    }

    // Process/workflow indicators
    if (lowerContent.includes('step') || lowerContent.includes('process') || 
        lowerContent.includes('workflow') || lowerContent.includes('procedure')) {
      return 'flowchart';
    }

    // Mind map indicators
    if (lowerContent.includes('insight') || lowerContent.includes('topic') || 
        lowerContent.includes('key point') || lowerContent.includes('main idea') ||
        lowerContent.includes('brain') || lowerContent.includes('mind')) {
      return 'mindmap';
    }

    // Organization chart indicators
    if (lowerContent.includes('organization') || lowerContent.includes('hierarchy') ||
        lowerContent.includes('team') || lowerContent.includes('structure') ||
        lowerContent.includes('org chart')) {
      return 'org-chart';
    }

    // Default to flowchart for structured content
    return 'flowchart';
  }

  /**
   * Extract title from content
   * @param {string} content - Content to analyze
   * @returns {string|null} - Extracted title
   */
  extractTitle(content) {
    // Look for title patterns
    const titlePatterns = [
      /^[📋🔍💡📊✅][^(]*(\([^)]+\))?/,  // Emoji titles
      /^#{1,3}\s+(.+)$/m,                   // Markdown headers
      /^\*\*(.+)\*\*$/m,                    // Bold titles
      /^(.{5,50})$/m                        // First short line
    ];

    for (const pattern of titlePatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1] || match[0].replace(/[#*]/g, '').trim();
      }
    }

    return null;
  }

  /**
   * Generate filename for the diagram
   * @param {string} diagramType - Type of diagram
   * @param {Object} metadata - Metadata including dialogId, timestamp
   * @returns {string} - Filename
   */
  generateFilename(diagramType, metadata = {}) {
    const timestamp = new Date().toISOString().split('T')[0];
    const dialogId = metadata.dialogId || 'unknown';
    return `chat_${diagramType}_${dialogId}_${timestamp}.drawio`;
  }

  /**
   * Validate content suitability for diagram generation
   * @param {string} content - Content to validate
   * @param {string} type - Diagram type
   * @returns {boolean} - Whether content is suitable
   */
  validateContent(content, type) {
    if (!content || typeof content !== 'string') {
      return false;
    }

    // Minimum content requirements
    if (content.length < 20) {
      return false;
    }

    // Check for structured content indicators
    const hasBullets = /[•\-\*]\s+/.test(content);
    const hasNumbers = /\d+\.\s+/.test(content);
    const hasArrows = /[-=]>/.test(content); // Flowchart arrows like -> or =>
    const hasMultipleLines = content.split('\n').length > 1;
    const hasKeywords = /\b(step|process|decision|workflow|procedure|goal|objective|task)\b/i.test(content);
    
    // For agentic generation, we're more flexible with content requirements
    const hasStructure = hasBullets || hasNumbers || hasMultipleLines || hasArrows || hasKeywords;

    return hasStructure;
  }

  /**
   * Format file attachment message
   * @param {string} title - Diagram title
   * @param {string} diagramType - Type of diagram
   * @param {string} filename - Filename
   * @returns {string} - Formatted message
   */
  formatFileAttachmentMessage(title, diagramType, filename) {
    const typeEmojis = {
      bullet_points: '📋',
      decisions: '🔀',
      topics: '🗂️',
      summary: '📄',
      key_insights: '💡'
    };

    const emoji = typeEmojis[diagramType] || '📊';
    const typeNames = {
      bullet_points: 'Flowchart',
      decisions: 'Decision Tree',  
      topics: 'Topic Network',
      summary: 'Summary Diagram',
      key_insights: 'Mind Map'
    };

    const typeName = typeNames[diagramType] || 'Diagram';

    return `${emoji} ${typeName}: ${title}

📁 I've created your diagram and uploaded it as a .drawio file! 

How to use:
1. Click the download button to get the file
2. Open the file in draw.io (File → Open From → Device)
3. Edit, export as PNG/PDF, or save to cloud storage

Generated on ${new Date().toLocaleString()}`;
  }

  /**
   * Format download link response (fallback when file attachment fails)
   * @param {string} filename - Generated filename
   * @param {string} diagramType - Type of diagram generated
   * @param {string} title - Diagram title
   * @returns {string} - Formatted response with download link
   */
  formatDownloadLinkResponse(filename, diagramType, title) {
    const typeEmojis = {
      bullet_points: '📋',
      decisions: '🔀',
      topics: '🗂️',
      summary: '📄',
      key_insights: '💡'
    };

    const emoji = typeEmojis[diagramType] || '📊';
    const typeNames = {
      bullet_points: 'Flowchart',
      decisions: 'Decision Tree',  
      topics: 'Topic Network',
      summary: 'Summary Diagram',
      key_insights: 'Mind Map'
    };

    const typeName = typeNames[diagramType] || 'Diagram';

    // Check if we have a stored upload result from earlier attempt
    if (this.lastUploadResult && this.lastUploadResult.publicUrl) {
      return `${emoji} ${typeName}: ${title || 'Diagram'}

📁 Your diagram has been created and uploaded to cloud storage!

📥 Download Instructions:
1. Right-click this link: ${this.lastUploadResult.publicUrl}
2. Select "Save Link As..." or "Download Linked File"
3. Save the .drawio file to your computer

🎨 How to edit your diagram:
1. Go to draw.io or diagrams.net
2. Click File → Open From → Device
3. Select your downloaded .drawio file
4. Edit and export as PNG/PDF/SVG as needed

Generated on ${new Date().toLocaleString()}`;
    }

    // No upload result available - generic message
    return `${emoji} ${typeName}: ${title || 'Diagram'}

⚠️ Unable to attach diagram file directly, but the diagram was generated successfully.

Please try your request again, or contact support if the issue persists.

Generated on ${new Date().toLocaleString()}`;
  }

  /**
   * Format the diagram response with XML content and instructions (fallback)
   * @param {string} diagramXML - Generated XML content
   * @param {string} filename - Suggested filename
   * @param {string} diagramType - Type of diagram generated
   * @param {string} title - Diagram title
   * @returns {string} - Formatted response
   */
  formatDiagramResponse(diagramXML, filename, diagramType, title) {
    const typeEmojis = {
      bullet_points: '📋',
      decisions: '🔀',
      topics: '🗂️',
      summary: '📄',
      key_insights: '💡'
    };

    const emoji = typeEmojis[diagramType] || '📊';
    const typeNames = {
      bullet_points: 'Flowchart',
      decisions: 'Decision Tree',  
      topics: 'Topic Network',
      summary: 'Summary Diagram',
      key_insights: 'Mind Map'
    };

    const typeName = typeNames[diagramType] || 'Diagram';

    // For Bitrix24, we need to keep responses short due to message character limits
    const xmlPreview = diagramXML.length > 1000 ? 
      diagramXML.substring(0, 500) + '\n... [XML content truncated for chat - full file is ' + Math.round(diagramXML.length / 1024) + 'KB] ...\n' + diagramXML.substring(diagramXML.length - 200) :
      diagramXML;

    return `${emoji} **${typeName}: ${title || 'Diagram'}**

✅ Diagram generated successfully!
📁 **File**: \`${filename}\` (${Math.round(diagramXML.length / 1024)}KB)

**🔧 XML Preview:**
\`\`\`xml
${xmlPreview}
\`\`\`

💾 **Next Steps:**
1. Copy the XML above
2. Go to [draw.io](https://app.diagrams.net)
3. File → Open From → Text → Paste XML
4. Edit & export as needed

*Generated ${new Date().toLocaleTimeString()}*`;
  }

  /**
   * Store message in history for potential tool chaining
   * @param {string} message - Message content
   * @param {Object} toolContext - Tool context
   */
  storeMessageHistory(message, toolContext) {
    const key = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.messageHistory.set(key, {
      message,
      timestamp: Date.now(),
      toolContext: {
        hasKnowledgeResults: !!(toolContext.knowledgeResults?.length),
        hasPreviousResults: !!(toolContext.previousToolResults?.length)
      }
    });

    // Cleanup old entries
    if (this.messageHistory.size > this.maxHistorySize) {
      const oldestKey = Array.from(this.messageHistory.keys())[0];
      this.messageHistory.delete(oldestKey);
    }
  }

  /**
   * Get suggestion message for proactive tool usage
   * @param {Object} context - Context information
   * @returns {string} - Suggestion message
   */
  getSuggestionMessage(context = {}) {
    return '💡 I noticed your content has a structured format that would work well as a visual diagram. Would you like me to create a flowchart or diagram from this information? Just say "create diagram" or "make flowchart"!';
  }

  async cleanup() {
    this.messageHistory.clear();
    this.log('info', 'DrawioGenerator tool cleaned up');
  }

  getMetadata() {
    return {
      ...super.getMetadata(),
      supportedDiagramTypes: ['flowchart', 'mindmap', 'process', 'decision_tree', 'network'],
      messageHistorySize: this.messageHistory.size,
      canChainWithTools: ['BitrixChatSummary', 'KnowledgeManagement', 'WebSearch']
    };
  }
}

module.exports = DrawioGeneratorTool;