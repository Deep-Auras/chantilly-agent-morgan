/**
 * Asana Integration Service
 * Handles bidirectional communication with Asana API
 */

const asana = require('asana');
const crypto = require('crypto');
const { getFirestore, FieldValue } = require('@google-cloud/firestore');
const { logger } = require('../utils/logger');

class AsanaService {
  constructor() {
    this.client = null;
    this.workspaceGid = process.env.ASANA_WORKSPACE_GID;
    this.webhookSecret = process.env.ASANA_WEBHOOK_SECRET;
    this.db = getFirestore(process.env.FIRESTORE_DATABASE_ID || '(default)');
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      this.client = asana.Client.create({
        defaultHeaders: {
          'Asana-Enable': 'new_user_task_lists'
        }
      }).useAccessToken(process.env.ASANA_ACCESS_TOKEN);

      this.initialized = true;
      logger.info('Asana service initialized');
    } catch (error) {
      logger.error('Failed to initialize Asana service', { error: error.message });
      throw error;
    }
  }

  /**
   * Verify webhook HMAC signature
   */
  verifyWebhookSignature(body, signature) {
    const hmac = crypto.createHmac('sha256', this.webhookSecret);
    hmac.update(body);
    const expectedSignature = hmac.digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Handle webhook handshake
   */
  handleHandshake(secret) {
    return {
      'X-Hook-Secret': secret
    };
  }

  /**
   * Create webhook for project/portfolio/workspace
   */
  async createWebhook(resourceGid, targetUrl, filters = null) {
    await this.initialize();

    try {
      const webhook = await this.client.webhooks.create({
        resource: resourceGid,
        target: targetUrl,
        filters: filters
      });

      // Store webhook in Firestore
      await this.db.collection('asana-webhooks').doc(webhook.gid).set({
        gid: webhook.gid,
        resourceGid: resourceGid,
        targetUrl: targetUrl,
        filters: filters || null,
        active: true,
        created: FieldValue.serverTimestamp()
      });

      logger.info('Created Asana webhook', { gid: webhook.gid, resourceGid });
      return webhook;
    } catch (error) {
      logger.error('Failed to create Asana webhook', { error: error.message });
      throw error;
    }
  }

  /**
   * Handle webhook event
   */
  async handleWebhookEvent(event) {
    const { action, resource, parent } = event;

    logger.info('Asana webhook event', {
      action,
      resourceType: resource.resource_type,
      resourceGid: resource.gid
    });

    try {
      switch (resource.resource_type) {
        case 'task':
          return await this.handleTaskEvent(action, resource);
        case 'story':
          return await this.handleCommentEvent(action, resource, parent);
        case 'project':
          return await this.handleProjectEvent(action, resource);
        default:
          logger.info('Unhandled resource type', { resourceType: resource.resource_type });
      }
    } catch (error) {
      logger.error('Error handling Asana webhook event', { error: error.message });
    }
  }

  /**
   * Handle task event
   */
  async handleTaskEvent(action, resource) {
    await this.initialize();

    if (action === 'added' || action === 'changed') {
      // Fetch full task details
      const task = await this.client.tasks.getTask(resource.gid, {
        opt_fields: 'name,notes,assignee,due_on,completed,projects,custom_fields,attachments,subtasks,memberships'
      });

      // Check if Morgan should process this task
      if (this.shouldProcessTask(task)) {
        await this.processTaskForMorgan(task);
      }
    }

    if (action === 'deleted') {
      logger.info('Task deleted', { gid: resource.gid });
    }
  }

  /**
   * Check if Morgan should process this task
   */
  shouldProcessTask(task) {
    const morganBotEmail = process.env.ASANA_BOT_EMAIL;

    // Check if assigned to Morgan
    if (task.assignee && task.assignee.email === morganBotEmail) {
      return true;
    }

    // Check if mentioned in notes or description
    if (task.notes && task.notes.includes('@morgan')) {
      return true;
    }

    return false;
  }

  /**
   * Process task assigned to Morgan
   */
  async processTaskForMorgan(task) {
    logger.info('Processing task for Morgan', {
      gid: task.gid,
      name: task.name
    });

    // Generate AI response
    const { getGeminiService } = require('./gemini');
    const gemini = getGeminiService();

    const response = await gemini.generateResponse(
      `Task assigned: ${task.name}\n\nDescription: ${task.notes}`,
      {
        platform: 'asana',
        taskGid: task.gid
      }
    );

    // Add comment to task with Morgan's response
    await this.addComment(task.gid, response);
  }

  /**
   * Create task in Asana
   */
  async createTask(projectGid, data) {
    await this.initialize();

    try {
      const task = await this.client.tasks.create({
        projects: [projectGid],
        name: data.name,
        notes: data.notes || '',
        due_on: data.dueDate || null,
        assignee: data.assignee || null
      });

      logger.info('Created Asana task', { gid: task.gid, name: task.name });
      return task;
    } catch (error) {
      logger.error('Failed to create Asana task', { error: error.message });
      throw error;
    }
  }

  /**
   * Update task status
   */
  async updateTaskStatus(taskGid, completed) {
    await this.initialize();

    try {
      const task = await this.client.tasks.update(taskGid, {
        completed: completed
      });

      logger.info('Updated task status', { gid: taskGid, completed });
      return task;
    } catch (error) {
      logger.error('Failed to update task status', { error: error.message });
      throw error;
    }
  }

  /**
   * Add comment to task
   */
  async addComment(taskGid, text) {
    await this.initialize();

    try {
      const story = await this.client.stories.createOnTask(taskGid, {
        text: text
      });

      logger.info('Added comment to task', { taskGid });
      return story;
    } catch (error) {
      logger.error('Failed to add comment', { error: error.message });
      throw error;
    }
  }

  /**
   * Get task with full details
   */
  async getTask(taskGid) {
    await this.initialize();

    try {
      const task = await this.client.tasks.getTask(taskGid, {
        opt_fields: 'name,notes,assignee,due_on,completed,projects,custom_fields,attachments,subtasks,tags,followers,memberships'
      });

      return task;
    } catch (error) {
      logger.error('Failed to get task', { error: error.message });
      throw error;
    }
  }

  /**
   * Search tasks in workspace
   */
  async searchTasks(params) {
    await this.initialize();

    try {
      const tasks = await this.client.tasks.searchTasksForWorkspace(
        this.workspaceGid,
        params
      );

      return tasks.data;
    } catch (error) {
      logger.error('Failed to search tasks', { error: error.message });
      throw error;
    }
  }

  /**
   * Get subtasks
   */
  async getSubtasks(taskGid) {
    await this.initialize();

    try {
      const subtasks = await this.client.tasks.getSubtasksForTask(taskGid);
      return subtasks.data;
    } catch (error) {
      logger.error('Failed to get subtasks', { error: error.message });
      throw error;
    }
  }

  /**
   * Handle comment event
   */
  async handleCommentEvent(action, resource, parent) {
    if (action === 'added' && parent && parent.resource_type === 'task') {
      // Fetch story details
      const story = await this.client.stories.getStory(resource.gid);

      // Check if Morgan is mentioned
      if (story.text && story.text.includes('@morgan')) {
        const task = await this.getTask(parent.gid);
        await this.processTaskForMorgan(task);
      }
    }
  }

  /**
   * Handle project event
   */
  async handleProjectEvent(action, resource) {
    logger.info('Project event', { action, gid: resource.gid });
    // Handle project-level events if needed
  }

  /**
   * Get section by name in a project
   */
  async getSectionByName(projectGid, sectionName) {
    await this.initialize();

    try {
      const sections = await this.client.sections.getSectionsForProject(projectGid);
      const section = sections.data.find(s => s.name === sectionName);
      return section || null;
    } catch (error) {
      logger.error('Failed to get section by name', { error: error.message });
      throw error;
    }
  }

  /**
   * Move task to a section
   */
  async moveTaskToSection(taskGid, sectionGid) {
    await this.initialize();

    try {
      await this.client.sections.addTask(sectionGid, {
        task: taskGid
      });

      logger.info('Moved task to section', { taskGid, sectionGid });
    } catch (error) {
      logger.error('Failed to move task to section', { error: error.message });
      throw error;
    }
  }
}

let instance = null;

function getAsanaService() {
  if (!instance) {
    instance = new AsanaService();
  }
  return instance;
}

module.exports = { getAsanaService };
