/**
 * Unit tests for Bitrix24 PII sanitization
 * Tests that sensitive user data is properly removed before being sent to Gemini
 *
 * OWASP LLM02: Sensitive Information Disclosure Prevention
 */

const { Bitrix24QueueManager } = require('../../services/bitrix24-queue');

describe('Bitrix24 PII Sanitization', () => {
  let queueManager;

  beforeEach(() => {
    queueManager = new Bitrix24QueueManager();
  });

  describe('formatDisplayName', () => {
    test('formats full name as "First L."', () => {
      const user = {
        NAME: 'Royce',
        LAST_NAME: 'Williams'
      };

      const result = queueManager.formatDisplayName(user);

      expect(result).toBe('Royce W.');
    });

    test('handles missing last name', () => {
      const user = {
        NAME: 'Royce',
        LAST_NAME: null
      };

      const result = queueManager.formatDisplayName(user);

      expect(result).toBe('Royce');
    });

    test('handles missing first name', () => {
      const user = {
        NAME: null,
        LAST_NAME: 'Williams'
      };

      const result = queueManager.formatDisplayName(user);

      expect(result).toBe('User W.');
    });

    test('handles empty names', () => {
      const user = {
        NAME: '',
        LAST_NAME: ''
      };

      const result = queueManager.formatDisplayName(user);

      expect(result).toBe('User');
    });
  });

  describe('sanitizeUser', () => {
    test('removes all PII fields from user object', () => {
      const fullUser = {
        ID: '123',
        NAME: 'Royce',
        LAST_NAME: 'Williams',
        EMAIL: 'royce.williams@company.com',
        PERSONAL_EMAIL: 'royce@personal.com',
        PERSONAL_MOBILE: '+1234567890',
        WORK_PHONE: '+0987654321',
        UF_PHONE_INNER: '1234',
        PERSONAL_STREET: '123 Main St',
        PERSONAL_CITY: 'San Francisco',
        PERSONAL_STATE: 'CA',
        PERSONAL_ZIP: '94102',
        WORK_STREET: '456 Office Blvd',
        WORK_CITY: 'San Francisco',
        WORK_STATE: 'CA',
        WORK_ZIP: '94105',
        PERSONAL_BIRTHDAY: '1990-01-15',
        PERSONAL_PHOTO: 'https://cdn.bitrix24.com/photo.jpg',
        WORK_POSITION: 'Sales Manager',
        ACTIVE: 'Y',
        UF_CUSTOM_FIELD: 'sensitive data'
      };

      const sanitized = queueManager.sanitizeUser(fullUser);

      // Should only have safe fields
      expect(sanitized).toEqual({
        id: '123',
        displayName: 'Royce W.',
        active: true,
        workPosition: 'Sales Manager'
      });

      // PII should be completely removed
      expect(sanitized.EMAIL).toBeUndefined();
      expect(sanitized.PERSONAL_EMAIL).toBeUndefined();
      expect(sanitized.PERSONAL_MOBILE).toBeUndefined();
      expect(sanitized.WORK_PHONE).toBeUndefined();
      expect(sanitized.UF_PHONE_INNER).toBeUndefined();
      expect(sanitized.PERSONAL_STREET).toBeUndefined();
      expect(sanitized.PERSONAL_CITY).toBeUndefined();
      expect(sanitized.PERSONAL_ZIP).toBeUndefined();
      expect(sanitized.WORK_STREET).toBeUndefined();
      expect(sanitized.PERSONAL_BIRTHDAY).toBeUndefined();
      expect(sanitized.PERSONAL_PHOTO).toBeUndefined();
      expect(sanitized.UF_CUSTOM_FIELD).toBeUndefined();
      expect(sanitized.NAME).toBeUndefined();
      expect(sanitized.LAST_NAME).toBeUndefined();
    });

    test('handles inactive users', () => {
      const user = {
        ID: '456',
        NAME: 'Larry',
        LAST_NAME: 'Smith',
        ACTIVE: 'N',
        EMAIL: 'larry@company.com'
      };

      const sanitized = queueManager.sanitizeUser(user);

      expect(sanitized.active).toBe(false);
      expect(sanitized.EMAIL).toBeUndefined();
    });

    test('handles boolean ACTIVE field', () => {
      const user = {
        ID: '789',
        NAME: 'Test',
        LAST_NAME: 'User',
        ACTIVE: true
      };

      const sanitized = queueManager.sanitizeUser(user);

      expect(sanitized.active).toBe(true);
    });

    test('handles null user', () => {
      const sanitized = queueManager.sanitizeUser(null);

      expect(sanitized).toBeNull();
    });

    test('handles undefined user', () => {
      const sanitized = queueManager.sanitizeUser(undefined);

      expect(sanitized).toBeUndefined();
    });
  });

  describe('sanitizeUserResponse', () => {
    test('sanitizes array of users', () => {
      const response = {
        result: [
          {
            ID: '123',
            NAME: 'Royce',
            LAST_NAME: 'Williams',
            EMAIL: 'royce@company.com',
            ACTIVE: 'Y'
          },
          {
            ID: '456',
            NAME: 'Larry',
            LAST_NAME: 'Smith',
            EMAIL: 'larry@company.com',
            ACTIVE: 'Y'
          }
        ],
        total: 2
      };

      const sanitized = queueManager.sanitizeUserResponse(response);

      expect(sanitized.result).toHaveLength(2);
      expect(sanitized.result[0]).toEqual({
        id: '123',
        displayName: 'Royce W.',
        active: true,
        workPosition: null
      });
      expect(sanitized.result[1]).toEqual({
        id: '456',
        displayName: 'Larry S.',
        active: true,
        workPosition: null
      });
      expect(sanitized.total).toBe(2);

      // Verify no PII
      expect(sanitized.result[0].EMAIL).toBeUndefined();
      expect(sanitized.result[1].EMAIL).toBeUndefined();
    });

    test('sanitizes single user object', () => {
      const response = {
        result: {
          ID: '123',
          NAME: 'Royce',
          LAST_NAME: 'Williams',
          EMAIL: 'royce@company.com',
          ACTIVE: 'Y'
        }
      };

      const sanitized = queueManager.sanitizeUserResponse(response);

      expect(sanitized.result).toEqual({
        id: '123',
        displayName: 'Royce W.',
        active: true,
        workPosition: null
      });
      expect(sanitized.result.EMAIL).toBeUndefined();
    });

    test('handles null response', () => {
      const sanitized = queueManager.sanitizeUserResponse(null);

      expect(sanitized).toBeNull();
    });

    test('handles response without result', () => {
      const response = { error: 'Some error' };

      const sanitized = queueManager.sanitizeUserResponse(response);

      expect(sanitized).toEqual({ error: 'Some error' });
    });
  });

  describe('sanitizeContact', () => {
    test('removes PII from CRM contact', () => {
      const contact = {
        ID: '999',
        NAME: 'John',
        LAST_NAME: 'Doe',
        EMAIL: [{ VALUE: 'john@example.com' }],
        PHONE: [{ VALUE: '+1234567890' }],
        COMPANY_ID: '100'
      };

      const sanitized = queueManager.sanitizeContact(contact);

      expect(sanitized).toEqual({
        id: '999',
        name: 'J. Doe',
        companyId: '100'
      });

      expect(sanitized.EMAIL).toBeUndefined();
      expect(sanitized.PHONE).toBeUndefined();
    });

    test('handles contact without last name', () => {
      const contact = {
        ID: '888',
        NAME: 'Jane',
        LAST_NAME: null
      };

      const sanitized = queueManager.sanitizeContact(contact);

      expect(sanitized.name).toBe('J.');
    });

    test('handles null contact', () => {
      const sanitized = queueManager.sanitizeContact(null);

      expect(sanitized).toBeNull();
    });
  });

  describe('sanitizeResponse', () => {
    test('routes user.* methods to sanitizeUserResponse', () => {
      const spy = jest.spyOn(queueManager, 'sanitizeUserResponse');

      const response = {
        result: [{
          ID: '123',
          NAME: 'Test',
          EMAIL: 'test@example.com'
        }]
      };

      queueManager.sanitizeResponse('user.search', response);

      expect(spy).toHaveBeenCalledWith(response);
    });

    test('routes crm.contact.* methods to sanitizeContactResponse', () => {
      const spy = jest.spyOn(queueManager, 'sanitizeContactResponse');

      const response = {
        result: [{
          ID: '999',
          NAME: 'Contact',
          EMAIL: 'contact@example.com'
        }]
      };

      queueManager.sanitizeResponse('crm.contact.get', response);

      expect(spy).toHaveBeenCalledWith(response);
    });

    test('routes im.user.* methods to sanitizeUserResponse', () => {
      const spy = jest.spyOn(queueManager, 'sanitizeUserResponse');

      const response = {
        result: [{
          ID: '123',
          NAME: 'Test'
        }]
      };

      queueManager.sanitizeResponse('im.user.get', response);

      expect(spy).toHaveBeenCalledWith(response);
    });

    test('returns non-PII methods unchanged', () => {
      const response = {
        result: [{
          ID: '1',
          TITLE: 'Test Deal',
          OPPORTUNITY: 10000
        }]
      };

      const sanitized = queueManager.sanitizeResponse('crm.deal.list', response);

      expect(sanitized).toEqual(response);
    });
  });

  describe('OWASP LLM02 Compliance', () => {
    test('no email addresses in sanitized output', () => {
      const user = {
        ID: '123',
        NAME: 'Test',
        LAST_NAME: 'User',
        EMAIL: 'test@company.com',
        PERSONAL_EMAIL: 'test@personal.com'
      };

      const sanitized = queueManager.sanitizeUser(user);
      const serialized = JSON.stringify(sanitized);

      expect(serialized).not.toContain('@');
      expect(serialized).not.toContain('test@company.com');
      expect(serialized).not.toContain('test@personal.com');
    });

    test('no phone numbers in sanitized output', () => {
      const user = {
        ID: '123',
        NAME: 'Test',
        LAST_NAME: 'User',
        PERSONAL_MOBILE: '+1234567890',
        WORK_PHONE: '+0987654321'
      };

      const sanitized = queueManager.sanitizeUser(user);
      const serialized = JSON.stringify(sanitized);

      expect(serialized).not.toContain('+1234567890');
      expect(serialized).not.toContain('+0987654321');
    });

    test('no full names in sanitized output', () => {
      const user = {
        ID: '123',
        NAME: 'Royce',
        LAST_NAME: 'Williams'
      };

      const sanitized = queueManager.sanitizeUser(user);
      const serialized = JSON.stringify(sanitized);

      expect(serialized).not.toContain('Williams');
      expect(serialized).toContain('Royce W.');
    });

    test('no addresses in sanitized output', () => {
      const user = {
        ID: '123',
        NAME: 'Test',
        PERSONAL_STREET: '123 Main St',
        PERSONAL_CITY: 'San Francisco',
        PERSONAL_ZIP: '94102'
      };

      const sanitized = queueManager.sanitizeUser(user);
      const serialized = JSON.stringify(sanitized);

      expect(serialized).not.toContain('123 Main St');
      expect(serialized).not.toContain('San Francisco');
      expect(serialized).not.toContain('94102');
    });

    test('no custom fields in sanitized output', () => {
      const user = {
        ID: '123',
        NAME: 'Test',
        UF_CUSTOM_SSN: '123-45-6789',
        UF_CREDIT_CARD: '4111-1111-1111-1111'
      };

      const sanitized = queueManager.sanitizeUser(user);

      expect(sanitized.UF_CUSTOM_SSN).toBeUndefined();
      expect(sanitized.UF_CREDIT_CARD).toBeUndefined();
    });
  });

  describe('Performance', () => {
    test('sanitizes large user arrays efficiently', () => {
      const users = Array.from({ length: 1000 }, (_, i) => ({
        ID: String(i),
        NAME: `User${i}`,
        LAST_NAME: `Last${i}`,
        EMAIL: `user${i}@company.com`,
        PERSONAL_MOBILE: `+123456789${i}`,
        ACTIVE: 'Y'
      }));

      const response = { result: users };

      const start = Date.now();
      const sanitized = queueManager.sanitizeUserResponse(response);
      const duration = Date.now() - start;

      expect(sanitized.result).toHaveLength(1000);
      expect(duration).toBeLessThan(1000); // Should complete in < 1 second
      expect(sanitized.result[0].EMAIL).toBeUndefined();
    });
  });
});
