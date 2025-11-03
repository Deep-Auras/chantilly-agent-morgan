/**
 * BitrixAPIValidator - Validates Bitrix24 API calls
 *
 * Provides:
 * - Method whitelisting
 * - Dangerous method blocking
 * - Data exfiltration prevention
 * - Parameter size limits
 * - Batch size limits
 */
class BitrixAPIValidator {
  constructor() {
    this.allowedMethods = new Set([
      // CRM - Read only
      'crm.invoice.list',
      'crm.invoice.get',
      'crm.company.list',
      'crm.company.get',
      'crm.contact.list',
      'crm.contact.get',
      'crm.deal.list',
      'crm.deal.get',
      'crm.activity.list',
      'crm.activity.get',
      'crm.product.list',
      'crm.product.get',
      'crm.product.fields',

      // Write operations (limited)
      'crm.invoice.add',
      'crm.invoice.update',
      'crm.product.add',
      'crm.product.update',

      // Messaging - Write
      'im.message.add',
      'imbot.message.add',
      'imbot.message.delete',
      'imbot.chat.sendTyping',

      // Messaging - Read (safe)
      'im.dialog.messages.get',
      'im.dialog.get',
      'im.chat.get',
      'im.recent.get',
      'im.recent.list',
      'im.user.get',
      'im.user.list.get',
      'im.user.status.get',
      'im.department.get',
      'im.department.employees.get',
      'im.chat.user.list',
      'im.dialog.users.list',
      'im.counters.get',

      // Logs
      'log.blogpost.add',

      // User info (read-only)
      'user.get',
      'user.search',
      'user.fields',
      'user.current'
    ]);

    this.dangerousMethods = new Set([
      'user.admin',
      'user.add',
      'user.update',
      'app.info',
      'event.bind',
      'placement.bind',
      'bizproc.workflow.start'
    ]);

    this.maxResultsPerCall = 500;
    this.maxBatchSize = 50;
  }

  /**
   * Validate API call
   * @param {string} method - API method
   * @param {Object} params - API parameters
   * @param {Object} context - Call context
   * @returns {Object} - { valid: boolean, errors: [], sanitized: {} }
   */
  validateAPICall(method, params, context = {}) {
    const errors = [];

    // Method whitelist
    if (!this.allowedMethods.has(method)) {
      if (this.dangerousMethods.has(method)) {
        errors.push(`Dangerous method blocked: ${method}`);
      } else {
        errors.push(`Method not allowed: ${method}`);
      }
    }

    // Prevent data exfiltration
    if (method.includes('.list')) {
      const limit = params?.limit || params?.LIMIT || 50;
      if (limit > this.maxResultsPerCall) {
        errors.push(`Limit too high (${this.maxResultsPerCall} max)`);
        params.limit = this.maxResultsPerCall;
      }

      // Require filters to prevent full exports
      if (!params?.filter && !params?.FILTER) {
        errors.push('List methods require filters');
      }
    }

    // Batch validation
    if (method === 'batch') {
      const cmdCount = Object.keys(params?.cmd || {}).length;
      if (cmdCount > this.maxBatchSize) {
        errors.push(`Batch too large (${this.maxBatchSize} max)`);
      }
    }

    // Parameter size limit
    const paramSize = JSON.stringify(params).length;
    if (paramSize > 100000) { // 100KB
      errors.push('Parameters too large (100KB max)');
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: params
    };
  }
}

module.exports = { BitrixAPIValidator };
