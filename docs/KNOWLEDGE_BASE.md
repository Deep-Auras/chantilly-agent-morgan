# Chantilly Agent Knowledge Base

## Overview
The Chantilly Agent knowledge base allows you to provide domain-specific information that the AI agent can use to answer questions accurately. The system automatically searches the knowledge base when users ask questions and incorporates relevant information into responses while maintaining the agent's personality.

## Database Structure
Knowledge base entries are stored in Firestore under the `knowledge-base` collection with the following structure:

```javascript
{
  title: "Entry Title",
  content: "Detailed content...",
  tags: ["tag1", "tag2"],
  category: "general",
  priority: 0,
  searchTerms: ["keyword1", "keyword2"],
  enabled: true,
  createdAt: timestamp,
  lastUpdated: timestamp
}
```

## Adding Knowledge via Firebase Console

### Method 1: Using Firebase Console (Web Browser)

1. **Access Firebase Console**
   - Go to [https://console.firebase.google.com](https://console.firebase.google.com)
   - Select your project
   - Navigate to "Firestore Database" in the left sidebar

2. **Navigate to Knowledge Base Collection**
   - Click on "knowledge-base" collection
   - If it doesn't exist, click "Start collection" and name it "knowledge-base"

3. **Add New Document**
   - Click "Add document"
   - Leave "Document ID" as "Auto-ID" (or specify a custom ID)
   - Add the following fields:

   **Required Fields:**
   ```
   title (string): "How to Submit Expense Reports"
   content (string): "To submit an expense report, follow these steps:
   1. Log into the employee portal
   2. Navigate to Expenses section
   3. Click 'New Expense Report'
   4. Upload receipts and fill out details
   5. Submit for approval"
   enabled (boolean): true
   priority (number): 5
   ```

   **Optional Fields:**
   ```
   tags (array): ["expenses", "hr", "process"]
   category (string): "hr"
   searchTerms (array): ["expense", "receipt", "reimbursement", "money"]
   ```

4. **Set Timestamps (Automatic)**
   - `createdAt`: Use "Server timestamp"
   - `lastUpdated`: Use "Server timestamp"

5. **Save Document**
   - Click "Save"
   - The entry will be available to the agent within 5 minutes (cache refresh)

### Method 2: Using API Endpoints (for developers)

```bash
# Add knowledge entry
curl -X POST https://your-service-url/knowledge \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Company Holiday Policy",
    "content": "Our company observes the following holidays...",
    "tags": ["hr", "holidays"],
    "category": "policies",
    "priority": 8,
    "searchTerms": ["vacation", "time off", "holidays"]
  }'
```

## Content Guidelines

### Writing Effective Knowledge Base Entries

1. **Clear Titles**
   - Use descriptive, searchable titles
   - Include key terms users might search for
   - Examples: "How to Reset Password", "Company Vacation Policy"

2. **Structured Content**
   - Use clear headings and bullet points
   - Include step-by-step instructions when applicable
   - Keep content concise but comprehensive

3. **Effective Tagging**
   - Use 3-5 relevant tags per entry
   - Include common synonyms and related terms
   - Examples: ["password", "login", "security", "account"]

4. **Categories for Organization**
   - `hr` - Human resources policies and procedures
   - `it` - Technology and system information
   - `policies` - Company policies and guidelines
   - `processes` - Workflow and procedural information
   - `products` - Product information and specifications
   - `general` - General company information

5. **Search Terms Enhancement**
   - Include alternative phrasings users might use
   - Add common misspellings or variations
   - Include department-specific terminology

### Content Example

```markdown
Title: "How to Request Time Off"

Content:
# Time Off Request Process

## Standard Procedure
1. Log into the HR portal at portal.company.com
2. Navigate to "Time Off" section
3. Select request type (vacation, sick, personal)
4. Choose dates and provide reason if required
5. Submit request at least 2 weeks in advance

## Emergency Time Off
For urgent situations, contact your direct supervisor immediately and submit the request within 24 hours.

## Approval Process
- Requests are typically approved within 2 business days
- You'll receive email notification of approval/denial
- Approved time off automatically updates your calendar

Tags: ["time off", "vacation", "hr", "requests"]
Category: "hr"
Search Terms: ["vacation request", "sick day", "personal day", "pto", "leave"]
```

## Images and Media Support

### Current Image Support: **LIMITED**

**What Works:**
- **Image URLs in content**: You can include image links in the content field
- **Markdown image syntax**: `![Alt text](https://example.com/image.jpg)`
- **Image descriptions**: Detailed text descriptions of visual content

**What Doesn't Work Yet:**
- **Direct image uploads**: Cannot upload images directly to knowledge base
- **Image analysis**: Agent cannot analyze or describe uploaded images
- **File attachments**: No support for file attachments in knowledge base

### Best Practices for Images

1. **Use External Image Hosting**
   ```markdown
   ![Process Diagram](https://your-domain.com/images/expense-process.png)

   The expense approval process follows these steps:
   1. Employee submits request (shown in green)
   2. Manager reviews (shown in yellow)
   3. Finance approves (shown in blue)
   ```

2. **Include Detailed Descriptions**
   ```markdown
   Title: "Office Floor Plan Navigation"

   Content:
   ![Floor Plan](https://company.com/floorplan.jpg)

   **Floor Plan Description:**
   - Main entrance: Ground floor, east side
   - Reception desk: Immediately inside main entrance
   - Conference rooms: Floor 2, rooms A-D along north wall
   - HR department: Floor 3, suite 301-305
   - IT support: Ground floor, west wing room 15
   ```

3. **Alternative Text Methods**
   ```markdown
   Content:
   For visual reference, see the organizational chart at:
   https://company.com/org-chart.pdf

   **Key Personnel:**
   - CEO: John Smith (ext. 100)
   - CTO: Jane Doe (ext. 200)
   - HR Director: Bob Johnson (ext. 150)
   ```

### Future Image Support (Planned)

- **Firestore Storage integration** for direct image uploads
- **Image analysis** via Google Vision API for automatic descriptions
- **Document parsing** for PDF and Word document content extraction
- **File attachment system** for supporting documents

## Knowledge Base Management

### Updating Existing Entries

1. **Via Firebase Console**
   - Navigate to the specific document in `knowledge-base` collection
   - Edit the fields you want to update
   - The `lastUpdated` field will be automatically updated

2. **Via API**
   ```bash
   curl -X PUT https://your-service-url/knowledge/DOCUMENT_ID \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"content": "Updated content..."}'
   ```

### Disabling Entries

Instead of deleting, set `enabled: false` to temporarily disable entries:

```javascript
{
  enabled: false  // Agent will ignore this entry
}
```

### Priority System

Use priority (0-100) to control which entries appear first in search results:
- **High Priority (80-100)**: Critical policies, emergency procedures
- **Medium Priority (40-79)**: Common procedures, frequently asked questions
- **Low Priority (0-39)**: Detailed reference information, edge cases

## Search and Retrieval

### How the Agent Uses Knowledge Base

1. **Automatic Search**: When a user asks a question, the agent automatically searches for relevant knowledge
2. **Relevance Scoring**: Entries are scored based on title matches, tag matches, and content relevance
3. **Context Integration**: Relevant knowledge is seamlessly integrated into the agent's response
4. **Personality Preservation**: The agent maintains its personality while incorporating factual information

### Search Algorithm

The system searches for relevance in this order:
1. **Title matches** (highest weight)
2. **Tag matches** (high weight)
3. **Search term matches** (high weight)
4. **Content matches** (medium weight)
5. **Word-level matching** (lower weight)

### Testing Knowledge Base Entries

1. **Add Test Entry**
   ```javascript
   {
     title: "Test Knowledge Entry",
     content: "This is a test entry for knowledge base functionality.",
     tags: ["test"],
     category: "testing",
     enabled: true
   }
   ```

2. **Test Query**: Ask the agent: "Tell me about test knowledge"

3. **Verify Response**: The agent should incorporate the test entry information

## API Reference

### Available Endpoints

```
GET    /knowledge                    # List all entries (admin)
GET    /knowledge/:id               # Get specific entry
POST   /knowledge                   # Add new entry (admin)
PUT    /knowledge/:id               # Update entry (admin)
DELETE /knowledge/:id               # Delete entry (admin)
POST   /knowledge/search            # Search knowledge base
GET    /knowledge/stats/overview    # Get statistics
GET    /knowledge/meta/categories   # List categories
POST   /knowledge/bulk/import       # Bulk import (admin)
```

### Example Search Request

```bash
curl -X POST https://your-service-url/knowledge/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "how to submit expense report",
    "maxResults": 3,
    "category": "hr",
    "minRelevance": 0.3
  }'
```

## Best Practices

### Content Organization

1. **Use Consistent Categories**
   - Establish standard categories for your organization
   - Use the same category names across related entries

2. **Maintain Tag Consistency**
   - Create a tag vocabulary and stick to it
   - Avoid synonymous tags (use "hr" OR "human-resources", not both)

3. **Regular Updates**
   - Review knowledge base monthly
   - Update outdated information promptly
   - Archive obsolete entries instead of deleting

### Performance Optimization

1. **Keep Content Focused**
   - One topic per entry
   - Avoid overly long content (max 10,000 characters)

2. **Use Priority Strategically**
   - Set high priority for critical, frequently-needed information
   - Lower priority for detailed reference material

3. **Monitor Usage**
   - Check which entries are being retrieved most often
   - Optimize popular entries for better search performance

## Troubleshooting

### Knowledge Base Not Working

1. **Check Entry Status**
   - Ensure `enabled: true`
   - Verify entry exists in Firestore

2. **Cache Refresh**
   - Knowledge base cache refreshes every 5 minutes
   - Wait a few minutes after adding new entries

3. **Search Relevance**
   - Check if your query matches title, tags, or search terms
   - Try different phrasings or keywords

### Agent Not Using Knowledge

1. **Relevance Score Too Low**
   - Add more specific tags and search terms
   - Improve title to match likely user queries

2. **Priority Issues**
   - Increase priority for important entries
   - Check if higher-priority entries are overshadowing

3. **Content Issues**
   - Ensure content is clear and well-structured
   - Avoid overly technical language unless necessary

## Contact

For technical issues with the knowledge base system, check the application logs or contact the development team.

For content questions or knowledge base management training, contact your system administrator.