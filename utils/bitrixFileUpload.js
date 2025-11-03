/**
 * Bitrix24 File Upload Integration
 * Handles uploading files to Bitrix24 and attaching them to messages
 */

const { getQueueManager } = require('../services/bitrix24-queue');
const { logger } = require('./logger');

class BitrixFileUploader {
  constructor() {
    this.maxFileSize = 100 * 1024 * 1024; // 100MB limit
    this.allowedExtensions = ['.drawio', '.png', '.jpg', '.jpeg', '.pdf', '.txt'];
  }

  /**
   * Upload a file to Bitrix24 from a public URL
   * @param {string} fileUrl - Public URL of the file to upload
   * @param {string} filename - Original filename
   * @param {string} dialogId - Bitrix24 dialog ID for file sharing
   * @returns {Object} - Upload result with file ID
   */
  async uploadFileFromUrl(fileUrl, filename, dialogId) {
    try {
      const queue = getQueueManager();

      // Validate file extension
      const extension = filename.substring(filename.lastIndexOf('.')).toLowerCase();
      if (!this.allowedExtensions.includes(extension)) {
        throw new Error(`File type ${extension} not allowed`);
      }

      logger.info('Starting Bitrix24 file upload from URL', {
        fileUrl,
        filename,
        dialogId
      });

      // Step 1: Upload file to Bitrix24 from URL
      const uploadResult = await queue.add({
        method: 'disk.folder.uploadfile',
        params: {
          id: 'shared_files', // Use shared files folder
          data: {
            NAME: filename
          },
          fileContent: fileUrl // Bitrix24 can accept URLs for file content
        },
        priority: 2 // High priority for file operations
      });

      if (!uploadResult || !uploadResult.result || !uploadResult.result.ID) {
        throw new Error('File upload to Bitrix24 failed - no file ID returned');
      }

      const fileId = uploadResult.result.ID;

      logger.info('File uploaded to Bitrix24 successfully', {
        filename,
        fileId,
        dialogId
      });

      return {
        success: true,
        fileId,
        filename,
        downloadUrl: uploadResult.result.DOWNLOAD_URL,
        size: uploadResult.result.SIZE
      };

    } catch (error) {
      logger.error('Bitrix24 file upload failed', {
        fileUrl,
        filename,
        dialogId,
        error: error.message
      });
      throw new Error(`Bitrix24 upload failed: ${error.message}`);
    }
  }

  /**
   * Share an uploaded file in a Bitrix24 chat
   * @param {string} fileId - Bitrix24 file ID
   * @param {string} dialogId - Dialog ID to share file in
   * @param {string} message - Optional message to send with file
   * @returns {Object} - Share result
   */
  async shareFileInChat(fileId, dialogId, message = '') {
    try {
      const queue = getQueueManager();

      logger.info('Sharing file in Bitrix24 chat', {
        fileId,
        dialogId,
        hasMessage: !!message
      });

      // Send message with file attachment
      const messageResult = await queue.add({
        method: 'imbot.message.add',
        params: {
          DIALOG_ID: dialogId,
          MESSAGE: message,
          ATTACH: {
            ID: Math.floor(Math.random() * 1000000), // Random attachment ID
            COLOR: '#52B440', // Green color for diagrams
            BLOCKS: [
              {
                MESSAGE: message || 'File attachment',
                FILE: [
                  {
                    LINK: `/disk/downloadFile/${fileId}/`,
                    NAME: 'Download File'
                  }
                ]
              }
            ]
          }
        },
        priority: 2
      });

      if (!messageResult || !messageResult.result) {
        throw new Error('Failed to share file in chat');
      }

      logger.info('File shared in chat successfully', {
        fileId,
        dialogId,
        messageId: messageResult.result
      });

      return {
        success: true,
        messageId: messageResult.result,
        fileId
      };

    } catch (error) {
      logger.error('Failed to share file in chat', {
        fileId,
        dialogId,
        error: error.message
      });
      throw new Error(`File sharing failed: ${error.message}`);
    }
  }

  /**
   * Complete file upload and sharing workflow
   * @param {string} fileUrl - Public URL of file to upload
   * @param {string} filename - Original filename
   * @param {string} dialogId - Dialog ID for sharing
   * @param {string} message - Message to send with file
   * @returns {Object} - Complete workflow result
   */
  async uploadAndShare(fileUrl, filename, dialogId, message = '') {
    try {
      // Upload file to Bitrix24
      const uploadResult = await this.uploadFileFromUrl(fileUrl, filename, dialogId);
      
      // Share file in chat
      const shareResult = await this.shareFileInChat(uploadResult.fileId, dialogId, message);

      return {
        success: true,
        upload: uploadResult,
        share: shareResult
      };

    } catch (error) {
      logger.error('Complete upload and share workflow failed', {
        fileUrl,
        filename,
        dialogId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Send a simple file attachment message (alternative approach)
   * @param {string} fileUrl - Public URL to the file
   * @param {string} filename - Display filename
   * @param {string} dialogId - Dialog ID
   * @param {string} message - Message text
   * @returns {Object} - Message result
   */
  async sendFileMessage(fileUrl, filename, dialogId, message) {
    try {
      const queue = getQueueManager();

      // Create file attachment using URL
      const result = await queue.add({
        method: 'imbot.message.add',
        params: {
          DIALOG_ID: dialogId,
          MESSAGE: message,
          URL_PREVIEW: 'N', // Disable URL preview
          KEYBOARD: [
            [
              {
                TEXT: `📁 Download ${filename}`,
                LINK: fileUrl,
                BG_COLOR: '#52B440'
              }
            ]
          ]
        },
        priority: 2
      });

      if (result && result.result) {
        logger.info('File message sent successfully', {
          filename,
          dialogId,
          messageId: result.result
        });

        return {
          success: true,
          messageId: result.result,
          fileUrl
        };
      } else {
        throw new Error('Failed to send file message');
      }

    } catch (error) {
      logger.error('Failed to send file message', {
        fileUrl,
        filename,
        dialogId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get file information from Bitrix24
   * @param {string} fileId - Bitrix24 file ID
   * @returns {Object} - File information
   */
  async getFileInfo(fileId) {
    try {
      const queue = getQueueManager();

      const result = await queue.add({
        method: 'disk.file.get',
        params: {
          id: fileId
        }
      });

      if (result && result.result) {
        return {
          success: true,
          file: result.result
        };
      } else {
        throw new Error('File not found');
      }

    } catch (error) {
      logger.error('Failed to get file info', {
        fileId,
        error: error.message
      });
      throw error;
    }
  }
}

// Export singleton instance
const bitrixFileUploader = new BitrixFileUploader();

module.exports = {
  BitrixFileUploader,
  bitrixFileUploader,
  uploadFileFromUrl: (url, filename, dialogId) => 
    bitrixFileUploader.uploadFileFromUrl(url, filename, dialogId),
  shareFileInChat: (fileId, dialogId, message) => 
    bitrixFileUploader.shareFileInChat(fileId, dialogId, message),
  uploadAndShare: (url, filename, dialogId, message) => 
    bitrixFileUploader.uploadAndShare(url, filename, dialogId, message),
  sendFileMessage: (url, filename, dialogId, message) => 
    bitrixFileUploader.sendFileMessage(url, filename, dialogId, message)
};