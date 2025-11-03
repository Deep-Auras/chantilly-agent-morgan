/**
 * Draw.io XML Generator for Chat Summaries
 * Generates .drawio diagrams from BitrixChatSummary content
 */

// Lazy load logger to avoid environment validation during tool loading
let logger;
function getLogger() {
  if (!logger) {
    try {
      logger = require('./logger').logger;
    } catch (error) {
      // Fallback to console if logger not available
      logger = console;
    }
  }
  return logger;
}

class DrawioGenerator {
  constructor() {
    this.defaultCanvasSettings = {
      dx: '1106',
      dy: '776', 
      grid: '1',
      gridSize: '10',
      guides: '1',
      tooltips: '1',
      connect: '1',
      arrows: '1',
      fold: '1',
      page: '1',
      pageScale: '1',
      pageWidth: '827',
      pageHeight: '1169',
      math: '0',
      shadow: '0'
    };

    this.styles = {
      header: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontStyle=1;fontSize=14;',
      bulletPoint: 'rounded=0;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=12;',
      insight: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=12;',
      decision: 'rhombus;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;fontSize=12;',
      topic: 'ellipse;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=12;',
      arrow: 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;',
      summary: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontSize=12;'
    };

    this.dimensions = {
      header: { width: 300, height: 60 },
      bulletPoint: { width: 250, height: 50 },
      insight: { width: 280, height: 60 },
      decision: { width: 200, height: 80 },
      topic: { width: 180, height: 60 },
      summary: { width: 320, height: 80 }
    };
  }

  /**
   * Generate a draw.io XML diagram from chat summary content
   * @param {string} summaryContent - The formatted summary content
   * @param {string} summaryType - Type of summary (bullet_points, summary, key_insights, topics, decisions)
   * @param {Object} metadata - Additional metadata (messageCount, dialogId, etc.)
   * @returns {string} - Complete draw.io XML content
   */
  generateDiagram(summaryContent, summaryType, metadata = {}) {
    try {
      // Parse content based on summary type
      const parsedContent = this.parseContent(summaryContent, summaryType);
      
      // Generate appropriate diagram
      let diagramXML;
      switch (summaryType) {
      case 'bullet_points':
        diagramXML = this.generateBulletPointFlowchart(parsedContent, metadata);
        break;
      case 'key_insights':
        diagramXML = this.generateInsightsMindMap(parsedContent, metadata);
        break;
      case 'topics':
        diagramXML = this.generateTopicsNetwork(parsedContent, metadata);
        break;
      case 'decisions':
        diagramXML = this.generateDecisionFlowchart(parsedContent, metadata);
        break;
      case 'summary':
      default:
        diagramXML = this.generateSummaryDiagram(parsedContent, metadata);
        break;
      }

      getLogger().info('Draw.io diagram generated successfully', {
        summaryType,
        contentLength: summaryContent.length,
        diagramSize: diagramXML.length
      });

      return diagramXML;

    } catch (error) {
      getLogger().error('Failed to generate draw.io diagram', {
        error: error.message,
        summaryType,
        contentLength: summaryContent.length
      });
      throw error;
    }
  }

  /**
   * Parse content based on summary type
   * @param {string} content - Raw summary content
   * @param {string} type - Summary type
   * @returns {Object} - Parsed content structure
   */
  parseContent(content, type) {
    const lines = content.split('\n').filter(line => line.trim());
    
    const parsed = {
      title: '',
      items: [],
      metadata: ''
    };

    // Extract title (usually first line with emoji and bold formatting)
    const titleMatch = content.match(/^[📋🔍💡📊✅][^(]*(\([^)]+\))?/);
    if (titleMatch) {
      parsed.title = titleMatch[0].replace(/\*\*/g, '').trim();
    }

    // Extract bullet points or items
    const bulletRegex = /^[•\-\*]\s+(.+)$/;
    const numberedRegex = /^\d+\.\s+(.+)$/;
    
    for (const line of lines) {
      const cleanLine = line.trim();
      
      // Skip title and metadata lines
      if (cleanLine.includes('📋') || cleanLine.includes('*Summary generated*') || 
          cleanLine.includes('*Auto-translated*') || cleanLine.startsWith('Chat ID:')) {
        continue;
      }

      // Extract bullet points
      const bulletMatch = cleanLine.match(bulletRegex);
      const numberedMatch = cleanLine.match(numberedRegex);
      
      if (bulletMatch) {
        parsed.items.push({
          type: 'bullet',
          text: bulletMatch[1].trim(),
          priority: this.determinePriority(bulletMatch[1])
        });
      } else if (numberedMatch) {
        parsed.items.push({
          type: 'numbered',
          text: numberedMatch[1].trim(),
          priority: this.determinePriority(numberedMatch[1])
        });
      } else if (cleanLine.length > 10 && !cleanLine.includes('**')) {
        // Regular content lines
        parsed.items.push({
          type: 'content',
          text: cleanLine,
          priority: this.determinePriority(cleanLine)
        });
      }
    }

    // Extract metadata
    const metadataMatch = content.match(/\*(.+)\*/);
    if (metadataMatch) {
      parsed.metadata = metadataMatch[1];
    }

    return parsed;
  }

  /**
   * Determine priority/importance of content item
   * @param {string} text - Text to analyze
   * @returns {string} - Priority level (high, medium, low)
   */
  determinePriority(text) {
    const highPriorityWords = ['critical', 'important', 'urgent', 'decision', 'action', 'must', 'required'];
    const mediumPriorityWords = ['should', 'consider', 'discuss', 'review', 'plan', 'need'];
    
    const lowerText = text.toLowerCase();
    
    if (highPriorityWords.some(word => lowerText.includes(word))) {
      return 'high';
    } else if (mediumPriorityWords.some(word => lowerText.includes(word))) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Generate bullet point flowchart diagram
   * @param {Object} parsedContent - Parsed content structure
   * @param {Object} metadata - Additional metadata
   * @returns {string} - Draw.io XML
   */
  generateBulletPointFlowchart(parsedContent, metadata) {
    let cellId = 2;
    const cells = [];

    // Add title header
    if (parsedContent.title) {
      cells.push(this.createCell(cellId++, parsedContent.title, this.styles.header, 
        50, 20, this.dimensions.header.width, this.dimensions.header.height));
    }

    // Add bullet points as connected boxes
    let yPosition = 120;
    const xPosition = 50;
    let previousId = cellId - 1;

    for (const item of parsedContent.items) {
      if (item.type === 'bullet' || item.type === 'numbered') {
        const style = item.priority === 'high' ? this.styles.insight : this.styles.bulletPoint;
        const currentId = cellId++;
        
        cells.push(this.createCell(currentId, item.text, style, 
          xPosition, yPosition, this.dimensions.bulletPoint.width, this.dimensions.bulletPoint.height));
        
        // Add arrow from previous item (except for first item)
        if (previousId && yPosition > 120) {
          cells.push(this.createEdge(cellId++, previousId, currentId, this.styles.arrow));
        }
        
        previousId = currentId;
        yPosition += 80;
      }
    }

    return this.buildXML(cells, metadata);
  }

  /**
   * Generate insights mind map diagram
   * @param {Object} parsedContent - Parsed content structure
   * @param {Object} metadata - Additional metadata
   * @returns {string} - Draw.io XML
   */
  generateInsightsMindMap(parsedContent, metadata) {
    let cellId = 2;
    const cells = [];
    
    // Central topic
    const centerX = 300;
    const centerY = 200;
    const centralId = cellId++;
    
    cells.push(this.createCell(centralId, parsedContent.title || 'Key Insights', this.styles.header,
      centerX - 100, centerY - 30, 200, 60));

    // Position insights around the center
    const radius = 150;
    const angleStep = (2 * Math.PI) / Math.max(parsedContent.items.length, 1);
    
    parsedContent.items.forEach((item, index) => {
      if (item.text.length > 5) {
        const angle = index * angleStep;
        const x = centerX + radius * Math.cos(angle) - 70;
        const y = centerY + radius * Math.sin(angle) - 30;
        
        const insightId = cellId++;
        const style = item.priority === 'high' ? this.styles.insight : this.styles.topic;
        
        cells.push(this.createCell(insightId, item.text, style, x, y, 140, 60));
        cells.push(this.createEdge(cellId++, centralId, insightId, this.styles.arrow));
      }
    });

    return this.buildXML(cells, metadata);
  }

  /**
   * Generate topics network diagram
   * @param {Object} parsedContent - Parsed content structure
   * @param {Object} metadata - Additional metadata
   * @returns {string} - Draw.io XML
   */
  generateTopicsNetwork(parsedContent, metadata) {
    let cellId = 2;
    const cells = [];
    
    // Create grid layout for topics
    const startX = 50;
    const startY = 80;
    const spacing = 200;
    let x = startX;
    let y = startY;
    const itemsPerRow = 3;
    
    // Add title
    if (parsedContent.title) {
      cells.push(this.createCell(cellId++, parsedContent.title, this.styles.header,
        startX, 20, 400, 50));
    }

    parsedContent.items.forEach((item, index) => {
      if (item.text.length > 3) {
        const topicId = cellId++;
        cells.push(this.createCell(topicId, item.text, this.styles.topic,
          x, y, this.dimensions.topic.width, this.dimensions.topic.height));
        
        // Move to next position
        if ((index + 1) % itemsPerRow === 0) {
          x = startX;
          y += 100;
        } else {
          x += spacing;
        }
      }
    });

    return this.buildXML(cells, metadata);
  }

  /**
   * Generate decision flowchart diagram
   * @param {Object} parsedContent - Parsed content structure
   * @param {Object} metadata - Additional metadata
   * @returns {string} - Draw.io XML
   */
  generateDecisionFlowchart(parsedContent, metadata) {
    let cellId = 2;
    const cells = [];

    // Add title
    if (parsedContent.title) {
      cells.push(this.createCell(cellId++, parsedContent.title, this.styles.header,
        100, 20, 300, 50));
    }

    // Create decision flow
    let yPosition = 120;
    const xPosition = 150;
    let previousId = null;

    for (const item of parsedContent.items) {
      if (item.text.length > 5) {
        const currentId = cellId++;
        const isDecision = item.text.toLowerCase().includes('decision') || 
                          item.text.includes('?') || 
                          item.priority === 'high';
        
        const style = isDecision ? this.styles.decision : this.styles.summary;
        const dims = isDecision ? this.dimensions.decision : this.dimensions.summary;
        
        cells.push(this.createCell(currentId, item.text, style, xPosition, yPosition, dims.width, dims.height));
        
        // Connect to previous
        if (previousId) {
          cells.push(this.createEdge(cellId++, previousId, currentId, this.styles.arrow));
        }
        
        previousId = currentId;
        yPosition += 120;
      }
    }

    return this.buildXML(cells, metadata);
  }

  /**
   * Generate general summary diagram
   * @param {Object} parsedContent - Parsed content structure
   * @param {Object} metadata - Additional metadata
   * @returns {string} - Draw.io XML
   */
  generateSummaryDiagram(parsedContent, metadata) {
    let cellId = 2;
    const cells = [];

    // Main summary box
    const summaryText = parsedContent.items.map(item => item.text).join('\n\n');
    cells.push(this.createCell(cellId++, parsedContent.title || 'Chat Summary', this.styles.header,
      50, 50, 400, 60));

    cells.push(this.createCell(cellId++, summaryText, this.styles.summary,
      50, 140, 400, Math.max(200, parsedContent.items.length * 40)));

    return this.buildXML(cells, metadata);
  }

  /**
   * Create a cell element
   * @param {number} id - Cell ID
   * @param {string} value - Cell text content
   * @param {string} style - Cell style string
   * @param {number} x - X position
   * @param {number} y - Y position  
   * @param {number} width - Width
   * @param {number} height - Height
   * @returns {string} - Cell XML
   */
  createCell(id, value, style, x, y, width, height) {
    const escapedValue = this.escapeXML(value);
    return `<mxCell id="${id}" value="${escapedValue}" style="${style}" vertex="1" parent="1">
      <mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry" />
    </mxCell>`;
  }

  /**
   * Create an edge (arrow) element
   * @param {number} id - Edge ID
   * @param {number} source - Source cell ID
   * @param {number} target - Target cell ID
   * @param {string} style - Edge style
   * @returns {string} - Edge XML
   */
  createEdge(id, source, target, style) {
    return `<mxCell id="${id}" style="${style}" edge="1" parent="1" source="${source}" target="${target}">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>`;
  }

  /**
   * Build complete draw.io XML structure
   * @param {Array} cells - Array of cell XML strings
   * @param {Object} metadata - Diagram metadata
   * @returns {string} - Complete XML
   */
  buildXML(cells, metadata = {}) {
    const settings = { ...this.defaultCanvasSettings, ...metadata.canvasSettings };
    const settingsString = Object.entries(settings)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ');

    return `<mxfile host="Chantilly" modified="${new Date().toISOString()}" agent="Chantilly Agent" version="21.6.5">
  <diagram name="Chat Summary" id="summary">
    <mxGraphModel ${settingsString}>
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        ${cells.join('\n        ')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
  }

  /**
   * Escape XML special characters
   * @param {string} text - Text to escape
   * @returns {string} - Escaped text
   */
  escapeXML(text) {
    if (!text) {return '';}
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      .substring(0, 200); // Limit text length for diagram readability
  }

  /**
   * Generate filename for the diagram
   * @param {string} summaryType - Type of summary
   * @param {Object} metadata - Metadata including dialogId, timestamp
   * @returns {string} - Filename
   */
  generateFilename(summaryType, metadata = {}) {
    const timestamp = new Date().toISOString().split('T')[0];
    const dialogId = metadata.dialogId || 'unknown';
    return `chat_${summaryType}_${dialogId}_${timestamp}.drawio`;
  }

  /**
   * Validate and sanitize input for diagram generation
   * @param {string} content - Content to validate
   * @param {string} type - Summary type
   * @returns {boolean} - Whether content is suitable for diagram generation
   */
  validateContent(content, type) {
    if (!content || typeof content !== 'string') {
      return false;
    }

    // Minimum content requirements
    if (content.length < 50) {
      return false;
    }

    // Check for bullet points or structured content
    const hasBullets = /[•\-\*]\s+/.test(content);
    const hasNumbers = /\d+\.\s+/.test(content);
    const hasArrows = /[-=]>/.test(content); // Flowchart arrows like -> or =>
    const hasMultipleLines = content.split('\n').length > 1;
    const hasStructure = hasBullets || hasNumbers || hasMultipleLines || hasArrows;

    return hasStructure;
  }
}

// Export functions
const drawioGenerator = new DrawioGenerator();

module.exports = {
  DrawioGenerator,
  generateDiagram: (content, type, metadata) => drawioGenerator.generateDiagram(content, type, metadata),
  generateFilename: (type, metadata) => drawioGenerator.generateFilename(type, metadata),
  validateContent: (content, type) => drawioGenerator.validateContent(content, type)
};