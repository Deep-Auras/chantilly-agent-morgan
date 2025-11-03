/**
 * Unit tests for enhanced prompt interpolation with nested variable support
 *
 * Tests the interpolate() function in config/prompts.js to ensure:
 * - Nested variable paths like {identity.name} work correctly
 * - Multiple nested levels like {traits.communication.formality} are supported
 * - Missing variables are preserved as placeholders
 * - Edge cases are handled gracefully
 */

const { interpolate } = require('../config/prompts');

describe('Prompt Interpolation - Enhanced Nested Variable Support', () => {
  describe('Nested Variable Handling', () => {
    test('handles simple nested variables (identity.name)', () => {
      const template = 'Hello {identity.name}';
      const vars = { identity: { name: 'Chantilly' } };

      const result = interpolate(template, vars);

      expect(result).toBe('Hello Chantilly');
    });

    test('handles nested variables in personality context', () => {
      const template = 'You are {identity.name}, {identity.role} at {identity.organization}';
      const vars = {
        identity: {
          name: 'Chantilly',
          role: 'AI Assistant',
          organization: 'Your Organization'
        }
      };

      const result = interpolate(template, vars);

      expect(result).toBe('You are Chantilly, AI Assistant at Your Organization');
    });

    test('handles multiple nested levels (traits.communication.formality)', () => {
      const template = 'Communication style: {traits.communication.formality}';
      const vars = {
        traits: {
          communication: {
            formality: 'professional'
          }
        }
      };

      const result = interpolate(template, vars);

      expect(result).toBe('Communication style: professional');
    });

    test('handles deep nesting (3+ levels)', () => {
      const template = 'Value: {level1.level2.level3.level4}';
      const vars = {
        level1: {
          level2: {
            level3: {
              level4: 'deep value'
            }
          }
        }
      };

      const result = interpolate(template, vars);

      expect(result).toBe('Value: deep value');
    });

    test('handles multiple nested variables in same template', () => {
      const template = '{identity.name} uses {traits.communication.formality} tone with {traits.communication.verbosity} responses';
      const vars = {
        identity: { name: 'Chantilly' },
        traits: {
          communication: {
            formality: 'professional',
            verbosity: 'balanced'
          }
        }
      };

      const result = interpolate(template, vars);

      expect(result).toBe('Chantilly uses professional tone with balanced responses');
    });
  });

  describe('Missing Variable Preservation', () => {
    test('preserves missing nested variables as placeholders', () => {
      const template = 'Hello {missing.var}';
      const vars = {};

      const result = interpolate(template, vars);

      expect(result).toBe('Hello {missing.var}');
    });

    test('preserves partially missing paths', () => {
      const template = 'Value: {identity.missingField}';
      const vars = {
        identity: { name: 'Chantilly' }
      };

      const result = interpolate(template, vars);

      expect(result).toBe('Value: {identity.missingField}');
    });

    test('preserves missing variables alongside valid ones', () => {
      const template = '{identity.name} has {identity.missing} property';
      const vars = {
        identity: { name: 'Chantilly' }
      };

      const result = interpolate(template, vars);

      expect(result).toBe('Chantilly has {identity.missing} property');
    });

    test('handles null values gracefully', () => {
      const template = 'Name: {identity.name}';
      const vars = {
        identity: { name: null }
      };

      const result = interpolate(template, vars);

      expect(result).toBe('Name: {identity.name}');
    });

    test('handles undefined values gracefully', () => {
      const template = 'Name: {identity.name}';
      const vars = {
        identity: { name: undefined }
      };

      const result = interpolate(template, vars);

      expect(result).toBe('Name: {identity.name}');
    });
  });

  describe('Edge Cases', () => {
    test('handles empty template', () => {
      const template = '';
      const vars = { identity: { name: 'Chantilly' } };

      const result = interpolate(template, vars);

      expect(result).toBe('');
    });

    test('handles template with no placeholders', () => {
      const template = 'This is a plain text template';
      const vars = { identity: { name: 'Chantilly' } };

      const result = interpolate(template, vars);

      expect(result).toBe('This is a plain text template');
    });

    test('handles empty variables object', () => {
      const template = 'Hello {identity.name}';
      const vars = {};

      const result = interpolate(template, vars);

      expect(result).toBe('Hello {identity.name}');
    });

    test('handles numeric values', () => {
      const template = 'Priority: {config.priority}';
      const vars = {
        config: { priority: 100 }
      };

      const result = interpolate(template, vars);

      expect(result).toBe('Priority: 100');
    });

    test('handles boolean values', () => {
      const template = 'Enabled: {config.enabled}';
      const vars = {
        config: { enabled: true }
      };

      const result = interpolate(template, vars);

      expect(result).toBe('Enabled: true');
    });

    test('handles zero as valid value', () => {
      const template = 'Count: {stats.count}';
      const vars = {
        stats: { count: 0 }
      };

      const result = interpolate(template, vars);

      expect(result).toBe('Count: 0');
    });

    test('handles empty string as valid value', () => {
      const template = 'Value: "{config.value}"';
      const vars = {
        config: { value: '' }
      };

      const result = interpolate(template, vars);

      expect(result).toBe('Value: ""');
    });

    test('handles special characters in values', () => {
      const template = 'Message: {data.message}';
      const vars = {
        data: { message: 'Hello $world! @user #tag' }
      };

      const result = interpolate(template, vars);

      expect(result).toBe('Message: Hello $world! @user #tag');
    });

    test('handles multiline templates', () => {
      const template = `Line 1: {identity.name}
Line 2: {identity.role}
Line 3: {traits.communication.formality}`;
      const vars = {
        identity: { name: 'Chantilly', role: 'AI Assistant' },
        traits: { communication: { formality: 'professional' } }
      };

      const result = interpolate(template, vars);

      expect(result).toBe(`Line 1: Chantilly
Line 2: AI Assistant
Line 3: professional`);
    });
  });

  describe('Real-World Use Cases', () => {
    test('interpolates complete personality prompt variables', () => {
      const template = 'You are {identity.name}, a {identity.role} at {identity.organization}. Communication: {traits.communication.formality} formality, {traits.communication.verbosity} verbosity.';
      const vars = {
        identity: {
          name: 'Chantilly',
          role: 'AI Assistant',
          organization: 'Your Organization'
        },
        traits: {
          communication: {
            formality: 'professional',
            verbosity: 'balanced'
          }
        }
      };

      const result = interpolate(template, vars);

      expect(result).toBe('You are Chantilly, a AI Assistant at Your Organization. Communication: professional formality, balanced verbosity.');
    });

    test('interpolates few-shot example variables', () => {
      const template = "I'm {identity.name}, {identity.role} at {identity.organization}. How can I help you today?";
      const vars = {
        identity: {
          name: 'Chantilly',
          role: 'AI Assistant',
          organization: 'Your Organization'
        }
      };

      const result = interpolate(template, vars);

      expect(result).toBe("I'm Chantilly, AI Assistant at Your Organization. How can I help you today?");
    });

    test('handles currentDate injection', () => {
      const template = 'Current date: {currentDate}';
      const vars = {
        currentDate: '2025-10-15'
      };

      const result = interpolate(template, vars);

      expect(result).toBe('Current date: 2025-10-15');
    });

    test('preserves unmatched placeholders for later interpolation', () => {
      const template = '{identity.name} will process {message} on {currentDate}';
      const vars = {
        identity: { name: 'Chantilly' },
        currentDate: '2025-10-15'
        // message not provided - should be preserved
      };

      const result = interpolate(template, vars);

      expect(result).toBe('Chantilly will process {message} on 2025-10-15');
    });
  });

  describe('Backwards Compatibility', () => {
    test('handles flat variables (non-nested) correctly', () => {
      const template = 'Hello {name}';
      const vars = { name: 'World' };

      const result = interpolate(template, vars);

      expect(result).toBe('Hello World');
    });

    test('handles mix of flat and nested variables', () => {
      const template = '{greeting} {identity.name} from {location}';
      const vars = {
        greeting: 'Hello',
        identity: { name: 'Chantilly' },
        location: 'Earth'
      };

      const result = interpolate(template, vars);

      expect(result).toBe('Hello Chantilly from Earth');
    });
  });
});
