/**
 * Draw.io XML Validator and Format Utility
 * Ensures generated XML meets draw.io specifications and adds proper headers
 */

const { logger } = require('./logger');

class DrawioXMLValidator {
  constructor() {
    this.requiredElements = ['mxfile', 'diagram', 'mxGraphModel', 'root'];
    this.requiredRootCells = ['0', '1'];
  }

  /**
   * Validate complete draw.io XML structure and syntax
   * @param {string} xml - Raw XML content to validate
   * @returns {Object} - Validation result with success status and details
   */
  validate(xml) {
    try {
      const validation = {
        isValid: true,
        errors: [],
        warnings: [],
        structure: {}
      };

      // Check basic XML syntax
      const xmlSyntaxCheck = this.validateXMLSyntax(xml);
      if (!xmlSyntaxCheck.isValid) {
        validation.isValid = false;
        validation.errors.push(...xmlSyntaxCheck.errors);
        return validation;
      }

      // Check required elements
      const elementsCheck = this.validateRequiredElements(xml);
      if (!elementsCheck.isValid) {
        validation.isValid = false;
        validation.errors.push(...elementsCheck.errors);
      }

      // Check cell ID uniqueness
      const idsCheck = this.validateUniqueIds(xml);
      if (!idsCheck.isValid) {
        validation.isValid = false;
        validation.errors.push(...idsCheck.errors);
      }

      // Check root cells
      const rootCheck = this.validateRootCells(xml);
      if (!rootCheck.isValid) {
        validation.isValid = false;
        validation.errors.push(...rootCheck.errors);
      }

      // Check geometry and style formatting
      const formatCheck = this.validateFormatting(xml);
      validation.warnings.push(...formatCheck.warnings);

      // Extract structure info
      validation.structure = this.extractStructureInfo(xml);

      logger.debug('Draw.io XML validation completed', {
        isValid: validation.isValid,
        errorCount: validation.errors.length,
        warningCount: validation.warnings.length
      });

      return validation;

    } catch (error) {
      logger.error('XML validation failed with exception', { error: error.message });
      return {
        isValid: false,
        errors: [`Validation exception: ${error.message}`],
        warnings: [],
        structure: {}
      };
    }
  }

  /**
   * Add proper draw.io file headers and metadata
   * @param {string} xml - Raw XML content
   * @param {Object} metadata - File metadata (filename, timestamp, etc.)
   * @returns {string} - XML with proper headers
   */
  addHeaders(xml, metadata = {}) {
    try {
      // Extract existing XML content (remove any existing headers)
      const contentMatch = xml.match(/<mxfile[\s\S]*<\/mxfile>/);
      if (!contentMatch) {
        throw new Error('Invalid XML structure - no mxfile element found');
      }

      let mxfileContent = contentMatch[0];

      // Add/update mxfile attributes
      const timestamp = new Date().toISOString();
      const agent = 'Chantilly Agent via Gemini';
      const version = '21.6.5';
      const etag = this.generateEtag();

      // Update mxfile tag with proper attributes
      mxfileContent = mxfileContent.replace(
        /<mxfile[^>]*>/,
        `<mxfile host="Chantilly" modified="${timestamp}" agent="${agent}" etag="${etag}" version="${version}" type="device">`
      );

      // Ensure diagram has proper attributes
      mxfileContent = mxfileContent.replace(
        /<diagram[^>]*>/,
        `<diagram name="${metadata.title || 'Diagram'}" id="${this.generateDiagramId()}">`
      );

      // Construct final XML with proper declaration
      const finalXML = `<?xml version="1.0" encoding="UTF-8"?>\n${mxfileContent}`;

      logger.debug('Draw.io headers added successfully', {
        filename: metadata.filename,
        hasTimestamp: !!timestamp,
        contentLength: finalXML.length
      });

      return finalXML;

    } catch (error) {
      logger.error('Failed to add headers to XML', { error: error.message });
      throw new Error(`Header addition failed: ${error.message}`);
    }
  }

  /**
   * Sanitize and escape XML content for draw.io compatibility
   * @param {string} content - Content to sanitize
   * @returns {string} - Sanitized content
   */
  sanitizeContent(content) {
    if (!content || typeof content !== 'string') {
      return '';
    }

    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      .trim();
  }

  /**
   * Generate unique cell ID
   * @returns {string} - Unique cell ID
   */
  generateCellId() {
    return `cell_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate XML syntax using stack-based parsing for accurate tag matching
   * @private
   */
  validateXMLSyntax(xml) {
    try {
      // Basic XML structure checks
      if (!xml.includes('<?xml')) {
        return { isValid: false, errors: ['Missing XML declaration'] };
      }

      if (!xml.includes('<mxfile')) {
        return { isValid: false, errors: ['Missing mxfile root element'] };
      }

      // More accurate tag matching using stack-based validation
      const tagStack = [];
      const xmlWithoutDeclaration = xml.replace(/<\?xml[^>]*\?>/g, '');
      
      // Find all tags (opening, closing, self-closing)
      const tagRegex = /<\/?[^>]+>/g;
      let match;
      
      while ((match = tagRegex.exec(xmlWithoutDeclaration)) !== null) {
        const tag = match[0];
        
        // Skip comments and CDATA
        if (tag.startsWith('<!--') || tag.startsWith('<![CDATA[')) {
          continue;
        }
        
        if (tag.endsWith('/>')) {
          // Self-closing tag, no need to track
          continue;
        } else if (tag.startsWith('</')) {
          // Closing tag
          const tagName = tag.slice(2, -1).split(/\s/)[0];
          if (tagStack.length === 0) {
            return { 
              isValid: false, 
              errors: [`Unexpected closing tag: ${tag}`] 
            };
          }
          const lastOpened = tagStack.pop();
          if (lastOpened !== tagName) {
            return { 
              isValid: false, 
              errors: [`Mismatched closing tag: expected </${lastOpened}>, found ${tag}`] 
            };
          }
        } else {
          // Opening tag
          const tagName = tag.slice(1, -1).split(/\s/)[0];
          tagStack.push(tagName);
        }
      }
      
      // Check if any tags remain unclosed
      if (tagStack.length > 0) {
        return { 
          isValid: false, 
          errors: [`Unclosed tags: ${tagStack.join(', ')}`] 
        };
      }

      return { isValid: true, errors: [] };

    } catch (error) {
      return { isValid: false, errors: [`XML syntax error: ${error.message}`] };
    }
  }

  /**
   * Validate required draw.io elements are present
   * @private
   */
  validateRequiredElements(xml) {
    const errors = [];

    for (const element of this.requiredElements) {
      if (!xml.includes(`<${element}`)) {
        errors.push(`Missing required element: ${element}`);
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate cell IDs are unique
   * @private
   */
  validateUniqueIds(xml) {
    try {
      const idMatches = xml.match(/id="([^"]+)"/g) || [];
      const ids = idMatches.map(match => match.match(/id="([^"]+)"/)[1]);
      const uniqueIds = new Set(ids);

      if (ids.length !== uniqueIds.size) {
        const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
        return { 
          isValid: false, 
          errors: [`Duplicate cell IDs found: ${[...new Set(duplicates)].join(', ')}`] 
        };
      }

      return { isValid: true, errors: [] };

    } catch (error) {
      return { isValid: false, errors: [`ID validation error: ${error.message}`] };
    }
  }

  /**
   * Validate required root cells exist
   * @private
   */
  validateRootCells(xml) {
    const errors = [];

    for (const rootId of this.requiredRootCells) {
      if (!xml.includes(`id="${rootId}"`)) {
        errors.push(`Missing required root cell: ${rootId}`);
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate formatting of geometry and styles
   * @private
   */
  validateFormatting(xml) {
    const warnings = [];

    // Check for proper color formatting
    const colorMatches = xml.match(/(fillColor|strokeColor|fontColor)=[#]?([^;]+)/g) || [];
    for (const match of colorMatches) {
      const color = match.split('=')[1];
      if (color && !color.match(/^#[0-9A-Fa-f]{6}$/) && !color.match(/^[a-zA-Z]+$/)) {
        warnings.push(`Invalid color format: ${color}`);
      }
    }

    // Check for numeric values in geometry
    const geoMatches = xml.match(/(x|y|width|height)="([^"]+)"/g) || [];
    for (const match of geoMatches) {
      const value = match.split('=')[1].replace(/"/g, '');
      if (value && isNaN(parseFloat(value))) {
        warnings.push(`Non-numeric geometry value: ${value}`);
      }
    }

    return { warnings };
  }

  /**
   * Extract structure information from XML
   * @private
   */
  extractStructureInfo(xml) {
    try {
      const cellCount = (xml.match(/<mxCell/g) || []).length;
      const vertexCount = (xml.match(/vertex="1"/g) || []).length;
      const edgeCount = (xml.match(/edge="1"/g) || []).length;
      
      return {
        totalCells: cellCount,
        vertices: vertexCount,
        edges: edgeCount,
        rootCells: 2 // Always 0 and 1
      };

    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Generate unique etag for file
   * @private
   */
  generateEtag() {
    return Math.random().toString(36).substr(2, 16);
  }

  /**
   * Generate unique diagram ID
   * @private
   */
  generateDiagramId() {
    return `diagram_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
  }
}

// Export singleton instance
const drawioXMLValidator = new DrawioXMLValidator();

module.exports = {
  DrawioXMLValidator,
  drawioXMLValidator,
  validate: (xml) => drawioXMLValidator.validate(xml),
  addHeaders: (xml, metadata) => drawioXMLValidator.addHeaders(xml, metadata),
  sanitizeContent: (content) => drawioXMLValidator.sanitizeContent(content),
  generateCellId: () => drawioXMLValidator.generateCellId()
};