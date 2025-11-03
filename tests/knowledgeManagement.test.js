const KnowledgeManagementTool = require('../tools/knowledgeManagement');

// Mock the entire firestore module
jest.mock('../config/firestore', () => ({
  getFirestore: jest.fn(),
  getFieldValue: jest.fn()
}));

const { getFirestore, getFieldValue } = require('../config/firestore');

describe('KnowledgeManagementTool', () => {
  let tool;
  let mockDb;
  let mockMessageData;

  beforeEach(() => {
    // Mock Firestore
    mockDb = {
      collection: jest.fn().mockReturnThis(),
      doc: jest.fn().mockReturnThis(),
      add: jest.fn().mockResolvedValue({ id: 'test-doc-id' }),
      get: jest.fn(),
      update: jest.fn().mockResolvedValue(),
      delete: jest.fn().mockResolvedValue(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis()
    };

    // Configure mocks
    getFirestore.mockReturnValue(mockDb);
    getFieldValue.mockReturnValue({
      serverTimestamp: jest.fn().mockReturnValue('mock-timestamp')
    });

    tool = new KnowledgeManagementTool({});
    tool.db = mockDb;

    mockMessageData = {
      userId: 123,
      message: 'How to submit expense reports: Log into portal, go to expenses, upload receipts, submit for approval.',
      chatId: 'chat456'
    };
  });

  describe('Content Suggestion', () => {
    it('should generate intelligent suggestions from user message', async () => {
      const suggestions = await tool.suggestDocumentContent(
        'How to submit expense reports: Log into portal, go to expenses, upload receipts, submit for approval.'
      );

      expect(suggestions.title.toLowerCase()).toContain('expense');
      expect(suggestions.tags).toContain('expense');
      expect(suggestions.category).toBe('processes');
      expect(suggestions.priority).toBeGreaterThanOrEqual(30);
      expect(suggestions.searchTerms).toContain('expense');
    });

    it('should extract tags correctly', () => {
      const tags = tool.extractTags('This is about HR policies and employee benefits for vacation leave.');

      expect(tags).toContain('hr');
      expect(tags).toContain('policies');
      expect(tags.length).toBeGreaterThan(0);
    });

    it('should determine category correctly', () => {
      expect(tool.determineCategory('password reset computer system')).toBe('it');
      expect(tool.determineCategory('employee vacation benefits')).toBe('hr');
      expect(tool.determineCategory('company policy compliance')).toBe('policies');
      expect(tool.determineCategory('step by step instructions')).toBe('processes');
    });

    it('should determine priority based on keywords', () => {
      expect(tool.determinePriority('This is urgent and critical')).toBe(90);
      expect(tool.determinePriority('Security policy required')).toBe(70);
      expect(tool.determinePriority('General instructions guide')).toBe(50);
      expect(tool.determinePriority('Some random information')).toBe(30);
    });
  });

  describe('Add Document', () => {
    it('should request confirmation before adding', async () => {
      const result = await tool.addDocument({
        title: 'Test Document',
        content: 'Test content',
        confirm: false
      }, mockMessageData);

      expect(result.action).toBe('confirm');
      expect(result.suggestions.title).toBe('Test Document');
      expect(result.suggestions.enabled).toBe(true);
    });

    it('should add document after confirmation', async () => {
      const result = await tool.addDocument({
        title: 'Test Document',
        content: 'Test content',
        tags: ['test'],
        category: 'general',
        priority: 50,
        confirm: true
      }, mockMessageData);

      expect(mockDb.add).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.documentId).toBe('test-doc-id');
    });

    it('should throw error if required fields missing', async () => {
      await expect(tool.addDocument({
        title: '',
        content: '',
        confirm: true
      }, mockMessageData)).rejects.toThrow('Title and content are required');
    });
  });

  describe('Update Document', () => {
    beforeEach(() => {
      mockDb.get.mockResolvedValue({
        exists: true,
        data: () => ({
          title: 'Original Title',
          content: 'Original content',
          tags: ['original'],
          category: 'general',
          priority: 30,
          enabled: true
        })
      });
    });

    it('should show current document and updates before confirming', async () => {
      const result = await tool.updateDocument({
        documentId: 'doc-123',
        title: 'Updated Title',
        confirm: false
      }, mockMessageData);

      expect(result.action).toBe('confirm');
      expect(result.current.title).toBe('Original Title');
      expect(result.updates.title).toBe('Updated Title');
    });

    it('should update document after confirmation', async () => {
      const result = await tool.updateDocument({
        documentId: 'doc-123',
        title: 'Updated Title',
        priority: 80,
        confirm: true
      }, mockMessageData);

      expect(mockDb.update).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should throw error if document not found', async () => {
      mockDb.get.mockResolvedValue({ exists: false });

      await expect(tool.updateDocument({
        documentId: 'non-existent',
        confirm: false
      }, mockMessageData)).rejects.toThrow('Document with ID non-existent not found');
    });
  });

  describe('Delete Document', () => {
    beforeEach(() => {
      mockDb.get.mockResolvedValue({
        exists: true,
        data: () => ({
          title: 'Document to Delete',
          content: 'This document will be deleted',
          tags: ['delete'],
          createdAt: new Date()
        })
      });
    });

    it('should show document details before deletion', async () => {
      const result = await tool.deleteDocument({
        documentId: 'doc-123',
        confirm: false
      }, mockMessageData);

      expect(result.action).toBe('confirm');
      expect(result.document.title).toBe('Document to Delete');
      expect(result.confirmMessage).toContain('Are you sure');
    });

    it('should delete document after confirmation', async () => {
      const result = await tool.deleteDocument({
        documentId: 'doc-123',
        confirm: true
      }, mockMessageData);

      expect(mockDb.delete).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe('Search Documents', () => {
    it('should search and rank documents by relevance', async () => {
      const mockDocs = [
        {
          id: '1',
          data: () => ({
            title: 'Expense Reports',
            content: 'How to submit expense reports',
            tags: ['expense', 'reports'],
            searchTerms: ['reimbursement'],
            priority: 50
          })
        },
        {
          id: '2',
          data: () => ({
            title: 'Vacation Policy',
            content: 'Company vacation policy details',
            tags: ['hr', 'vacation'],
            searchTerms: ['time off'],
            priority: 30
          })
        }
      ];

      mockDb.get.mockResolvedValue({
        forEach: (fn) => mockDocs.forEach(doc => fn(doc))
      });

      const result = await tool.searchDocuments({
        query: 'expense'
      });

      expect(result.success).toBe(true);
      expect(result.results[0].title).toBe('Expense Reports');
      expect(result.results[0].score).toBeGreaterThan(0);
    });
  });

  describe('Should Trigger', () => {
    it('should trigger on knowledge base keywords', async () => {
      expect(await tool.shouldTrigger('Please add this to knowledge base')).toBe(true);
      expect(await tool.shouldTrigger('Create knowledge entry for this')).toBe(true);
      expect(await tool.shouldTrigger('Update the knowledge base')).toBe(true);
      expect(await tool.shouldTrigger('Remember this information')).toBe(true);
      expect(await tool.shouldTrigger('Document this process')).toBe(true);
    });

    it('should not trigger on unrelated messages', async () => {
      expect(await tool.shouldTrigger('What is the weather today?')).toBe(false);
      expect(await tool.shouldTrigger('Send a message to John')).toBe(false);
    });
  });
});