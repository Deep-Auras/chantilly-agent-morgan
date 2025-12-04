const { google } = require('googleapis');
const { logger } = require('../utils/logger');

class GoogleDocsService {
  constructor() {
    this.docs = null;
    this.drive = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Use Application Default Credentials (ADC)
      const auth = new google.auth.GoogleAuth({
        scopes: [
          'https://www.googleapis.com/auth/documents.readonly',
          'https://www.googleapis.com/auth/drive.readonly',
          'https://www.googleapis.com/auth/drive.metadata.readonly'
        ]
      });

      const authClient = await auth.getClient();
      
      this.docs = google.docs({ version: 'v1', auth: authClient });
      this.drive = google.drive({ version: 'v3', auth: authClient });
      
      this.initialized = true;
      logger.info('Google Docs Service initialized');
    } catch (error) {
      logger.error('Failed to initialize Google Docs Service', { error: error.message });
      throw error;
    }
  }

  async ensureInitialized() {
    if (!this.initialized) await this.initialize();
  }

  async listDocuments(query = '') {
    await this.ensureInitialized();
    try {
      // Default to Google Docs
      let q = "mimeType = 'application/vnd.google-apps.document' and trashed = false";
      if (query) {
        // Escape single quotes in query
        const safeQuery = query.replace(/'/g, "\\'");
        q += ` and name contains '${safeQuery}'`;
      }

      const res = await this.drive.files.list({
        q,
        fields: 'files(id, name, createdTime, modifiedTime)',
        pageSize: 50,
        orderBy: 'modifiedTime desc'
      });

      return res.data.files || [];
    } catch (error) {
      logger.error('Failed to list documents', { error: error.message });
      throw error;
    }
  }

  async getDocument(documentId) {
    await this.ensureInitialized();
    try {
      const res = await this.docs.documents.get({ documentId });
      return res.data;
    } catch (error) {
      logger.error('Failed to get document', { documentId, error: error.message });
      throw error;
    }
  }
}

let instance = null;

function getGoogleDocsService() {
  if (!instance) {
    instance = new GoogleDocsService();
  }
  return instance;
}

module.exports = { GoogleDocsService, getGoogleDocsService };
