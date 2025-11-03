const BaseTool = require('../lib/baseTool');

class ReminderTool extends BaseTool {
  constructor(context) {
    super(context);
    this.name = 'reminder';
    this.description = 'Set reminders by creating tasks in Bitrix24';
    this.category = 'productivity';
    this.version = '1.0.0';
    this.author = 'Chantilly Agent';

    this.parameters = {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The reminder/task title'
        },
        description: {
          type: 'string',
          description: 'Detailed description of the task'
        },
        dueDate: {
          type: 'string',
          description: 'Due date in YYYY-MM-DD format'
        },
        priority: {
          type: 'string',
          description: 'Task priority level',
          enum: ['low', 'medium', 'high'],
          default: 'medium'
        }
      },
      required: ['title']
    };
  }

  async shouldTrigger(message) {
    const reminderKeywords = ['remind', 'task', 'todo', 'deadline', 'schedule'];
    const lowerMessage = message.toLowerCase();
    return reminderKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  async execute(params, messageData) {
    try {
      const { title, description, dueDate, priority = 'medium' } = params;

      // Create task in Bitrix24 using CRM API
      const taskData = {
        TITLE: title,
        DESCRIPTION: description || '',
        RESPONSIBLE_ID: messageData.userId,
        PRIORITY: this.getPriorityCode(priority),
        CREATED_BY: messageData.userId
      };

      if (dueDate) {
        taskData.DEADLINE = dueDate;
      }

      // Call Bitrix24 API to create task
      const result = await this.callBitrix24('tasks.task.add', {
        fields: taskData
      });

      const taskId = result.result?.task?.id;

      if (taskId) {
        // Save reminder data to Firestore for tracking
        await this.saveToFirestore('reminders', taskId.toString(), {
          taskId,
          title,
          userId: messageData.userId,
          chatId: messageData.chatId,
          createdAt: new Date().toISOString(),
          priority,
          dueDate
        });

        const response = `✅ Reminder created successfully!

📝 Task: ${title}
👤 Assigned to: User #${messageData.userId}
📅 Due: ${dueDate || 'No deadline set'}
🎯 Priority: ${priority.toUpperCase()}
🔗 Task ID: ${taskId}`;

        this.log('info', 'Reminder created', {
          taskId,
          title,
          userId: messageData.userId
        });

        return response;
      } else {
        throw new Error('Failed to create task in Bitrix24');
      }
    } catch (error) {
      this.log('error', 'Reminder creation failed', {
        error: error.message,
        params
      });
      throw new Error(`Failed to create reminder: ${error.message}`);
    }
  }

  getPriorityCode(priority) {
    const priorities = {
      low: '0',
      medium: '1',
      high: '2'
    };
    return priorities[priority] || '1';
  }

  async listReminders(userId) {
    try {
      // Get user's reminders from Firestore
      const snapshot = await this.firestore
        .collection('reminders')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

      const reminders = [];
      snapshot.forEach(doc => {
        reminders.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return reminders;
    } catch (error) {
      this.log('error', 'Failed to list reminders', {
        error: error.message,
        userId
      });
      return [];
    }
  }
}

module.exports = ReminderTool;