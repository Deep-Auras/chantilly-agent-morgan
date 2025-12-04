const BaseTool = require('../lib/baseTool');
const { getGoogleDocsService } = require('../services/googleDocsService');
const { getKnowledgeBase } = require('../services/knowledgeBase');

class GoogleDocImporter extends BaseTool {
  constructor(context) {
    super(context);
    this.name = 'googleDocImporter';
    this.description = 'Import content from a Google Doc into the Knowledge Base. Reads the doc, converts to Markdown, and saves it.';
    this.category = 'productivity';
    
    this.parameters = {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'The ID of the Google Doc to import'
        },
        category: {
            type: 'string',
            description: 'Category for the knowledge base entry (e.g. general, policies)',
            default: 'general'
        }
      },
      required: ['documentId']
    };
  }

  async execute(params) {
    const { documentId, category = 'general' } = params;
    
    try {
        const googleDocsService = getGoogleDocsService();
        const doc = await googleDocsService.getDocument(documentId);
        
        const title = doc.title;
        const markdown = this.convertDocToMarkdown(doc);
        
        const kb = getKnowledgeBase();
        
        // Check if exists to avoid duplicates
        const existing = await kb.searchKnowledge(title, { maxResults: 1 });
        let id;
        
        if (existing && existing.length > 0 && existing[0].title === title) {
            // Update
            id = existing[0].id;
            await kb.updateKnowledge(id, {
                content: markdown,
                category: category,
                lastUpdated: new Date()
            });
             return `Updated knowledge base entry: "${title}" (ID: ${id})`;
        } else {
            // Add
            id = await kb.addKnowledge({
                title: title,
                content: markdown,
                category: category,
                tags: ['google-doc-import'],
                enabled: true
            });
            return `Created new knowledge base entry: "${title}" (ID: ${id})`;
        }
        
    } catch (error) {
        throw new Error(`Failed to import Google Doc: ${error.message}`);
    }
  }
  
  convertDocToMarkdown(doc) {
      let text = '';
      const body = doc.body;
      if (body && body.content) {
          for (const element of body.content) {
              if (element.paragraph) {
                  text += this.processParagraph(element.paragraph);
              } else if (element.table) {
                  text += this.processTable(element.table);
              }
          }
      }
      return text;
  }
  
  processParagraph(paragraph) {
      let pText = '';
      const styleType = paragraph.paragraphStyle?.namedStyleType;
      
      for (const element of paragraph.elements) {
          if (element.textRun) {
              let content = element.textRun.content;
              const style = element.textRun.textStyle;
              
              if (style) {
                  if (style.bold) content = `**${content}**`;
                  if (style.italic) content = `*${content}*`;
                  if (style.link && style.link.url) content = `[${content}](${style.link.url})`;
              }
              pText += content;
          }
      }
      
      // Handle headings
      if (styleType) {
          if (styleType === 'TITLE') pText = `# ${pText}`;
          else if (styleType === 'HEADING_1') pText = `# ${pText}`;
          else if (styleType === 'HEADING_2') pText = `## ${pText}`;
          else if (styleType === 'HEADING_3') pText = `### ${pText}`;
          else if (styleType === 'HEADING_4') pText = `#### ${pText}`;
      }
      
      // Handle lists (basic support)
      if (paragraph.bullet) {
          pText = `- ${pText}`;
      }
      
      return pText; // Newline is usually in the content
  }
  
  processTable(table) {
      let md = '\n';
      // Process header row if exists
      // Just basic text extraction for now to avoid complex layout issues
      for (const row of table.tableRows) {
          let rowText = '|';
          for (const cell of row.tableCells) {
               let cellText = '';
               for (const content of cell.content) {
                   if (content.paragraph) {
                       for (const element of content.paragraph.elements) {
                           if (element.textRun) cellText += element.textRun.content.trim();
                       }
                   }
               }
               rowText += ` ${cellText} |`;
          }
          md += rowText + '\n';
      }
      return md + '\n';
  }
}

module.exports = GoogleDocImporter;
