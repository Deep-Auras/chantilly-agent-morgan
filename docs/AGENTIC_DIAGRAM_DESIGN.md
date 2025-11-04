# Agentic Draw.io Diagram Generation Design

## Overview
Replace the current JS utility-based diagram generation with an **agentic approach** where Gemini generates creative, human-like draw.io XML diagrams using knowledge base examples and specifications.

## Architecture Design

### 1. Knowledge Base Integration
- **Tag System**: Knowledge base documents tagged with `drawio` for diagram examples
- **Template Library**: Human-created diagram examples stored as XML templates
- **Style Guides**: Design patterns and best practices for different diagram types
- **Domain-Specific Examples**: Flowcharts, mindmaps, org charts, technical diagrams

### 2. Agentic Generation Pipeline

```
User Request → Content Analysis → Knowledge Base Search → Template Selection → Gemini XML Generation → Validation → File Creation
```

**Step 1: Content Analysis**
- Parse user requirements and content structure
- Determine optimal diagram type (flowchart, mindmap, network, etc.)
- Extract key entities, relationships, and hierarchy

**Step 2: Knowledge Base Integration**
- Search for relevant diagram examples tagged with `drawio`
- Load template XMLs and style patterns
- Provide context about successful diagram structures

**Step 3: Gemini Agentic Generation**
- Send comprehensive prompt with:
  - User content to visualize
  - Relevant XML examples from knowledge base
  - Draw.io specification guidelines
  - Creative direction for human-like design
- Gemini generates complete, creative draw.io XML

**Step 4: Validation & Finalization**
- JS utility validates XML structure and syntax
- Add proper file headers and metadata
- Ensure draw.io compatibility

### 3. Knowledge Base Schema

```javascript
// Example knowledge base document with drawio tag
{
  title: "Professional Flowchart Template",
  content: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>...", // Full XML
  category: "processes",
  tags: ["drawio", "flowchart", "business-process", "professional"],
  metadata: {
    diagramType: "flowchart", 
    complexity: "medium",
    style: "professional",
    colorScheme: "blue-green",
    layout: "vertical"
  }
}
```

### 4. Gemini Prompt Engineering

**Core Prompt Structure:**
```
You are a professional diagram designer creating draw.io XML diagrams. 

CONTENT TO VISUALIZE:
{user_content}

DIAGRAM TYPE: {determined_type}

EXAMPLES FROM KNOWLEDGE BASE:
{relevant_xml_examples}

REQUIREMENTS:
- Generate complete, valid draw.io XML
- Make it look professionally designed by a human
- Use creative positioning, colors, and styling
- Follow draw.io XML specification exactly
- Include proper mxCell structure with unique IDs
- Use appropriate shapes and connectors
- Make layout visually appealing and intuitive

STYLE GUIDELINES:
- Use varied colors that complement each other
- Apply rounded corners and gradients where appropriate
- Position elements with good spacing and alignment
- Add visual hierarchy with different sizes and styles
- Include proper labels and clear text

Generate the complete XML starting with <?xml version="1.0" encoding="UTF-8"?>
```

### 5. Implementation Components

#### A. Knowledge Base Seeding
```javascript
// Add professional diagram examples to knowledge base
const exampleDiagrams = [
  {
    title: "Modern Flowchart Style",
    content: "Full XML with professional styling...",
    tags: ["drawio", "flowchart", "modern", "gradient"]
  },
  {
    title: "Creative Mindmap Layout", 
    content: "Full XML with organic mindmap structure...",
    tags: ["drawio", "mindmap", "creative", "colorful"]
  }
];
```

#### B. XML Validator Utility
```javascript
class DrawioXMLValidator {
  validate(xml) {
    // Check XML syntax
    // Validate required elements (mxfile, mxGraphModel, root cells)
    // Ensure unique IDs
    // Verify proper geometry and style formats
    // Return validation results
  }
  
  addHeaders(xml, metadata) {
    // Add proper mxfile attributes
    // Set timestamps and version info
    // Ensure encoding is correct
  }
}
```

#### C. Agentic Generator
```javascript
async generateAgenticDiagram(content, type, context) {
  // 1. Search knowledge base for relevant examples
  const examples = await searchKnowledgeBase(`drawio ${type}`);
  
  // 2. Build comprehensive Gemini prompt
  const prompt = buildAgenticPrompt(content, type, examples);
  
  // 3. Generate XML with Gemini
  const xml = await gemini.generateContent(prompt);
  
  // 4. Validate and enhance
  const validatedXML = validator.validate(xml);
  
  return validatedXML;
}
```

## Benefits of Agentic Approach

### 1. **Human-Like Creativity**
- Dynamic layouts instead of rigid templates
- Varied color schemes and styling
- Contextually appropriate design choices
- Organic positioning and spacing

### 2. **Adaptive Intelligence** 
- Learns from knowledge base examples
- Adapts style to content type and complexity
- Incorporates domain-specific design patterns
- Evolves with new examples in knowledge base

### 3. **Professional Quality**
- Leverages examples of high-quality diagrams
- Applies design principles programmatically
- Creates publication-ready visualizations
- Maintains consistency while allowing creativity

### 4. **Extensibility**
- Easy to add new diagram types via knowledge base
- Can incorporate user feedback and preferences
- Supports complex, multi-layered diagrams
- Scales to various complexity levels

## Implementation Timeline

1. **Phase 1**: Create XML validator utility and knowledge base examples
2. **Phase 2**: Design and test Gemini prompt engineering approach
3. **Phase 3**: Integrate agentic generation into DrawioGenerator tool
4. **Phase 4**: Add knowledge base search and template system
5. **Phase 5**: Test and refine with real-world diagram generation

## Success Metrics

- **Quality**: Diagrams look professionally designed by humans
- **Variety**: Each generated diagram has unique styling and layout
- **Accuracy**: XML is always valid and compatible with draw.io
- **Relevance**: Diagrams appropriately represent the input content
- **Performance**: Generation completes within reasonable time limits

This design transforms diagram generation from a mechanical utility into an intelligent, creative system that produces publication-quality visualizations.