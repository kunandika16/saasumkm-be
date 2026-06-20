import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  getTemplate,
  resolveTemplate,
  validateMessage,
  type BlastCategory,
} from './blast-template.service';

describe('Blast Template Service', () => {
  describe('getTemplate', () => {
    it('should return reminder template with {{nama}} placeholder', () => {
      const template = getTemplate('reminder');
      expect(template).toContain('{{nama}}');
      expect(template).toContain('Halo');
      expect(template).toContain('kamu');
      expect(template.length).toBeGreaterThan(0);
      expect(template.length).toBeLessThanOrEqual(1000);
    });

    it('should return promo template with {{nama}} placeholder', () => {
      const template = getTemplate('promo');
      expect(template).toContain('{{nama}}');
      expect(template).toContain('Halo');
      expect(template).toContain('kamu');
      expect(template.length).toBeGreaterThan(0);
      expect(template.length).toBeLessThanOrEqual(1000);
    });

    it('should return announcement template with {{nama}} placeholder', () => {
      const template = getTemplate('announcement');
      expect(template).toContain('{{nama}}');
      expect(template).toContain('Halo');
      expect(template.length).toBeGreaterThan(0);
      expect(template.length).toBeLessThanOrEqual(1000);
    });

    it('should return empty string for custom category', () => {
      const template = getTemplate('custom');
      expect(template).toBe('');
    });

    it('should use casual Indonesian without formal honorifics', () => {
      const categories: BlastCategory[] = ['reminder', 'promo', 'announcement'];
      for (const category of categories) {
        const template = getTemplate(category);
        expect(template).not.toContain('Bapak');
        expect(template).not.toContain('Ibu');
        expect(template).not.toContain('Dengan hormat');
      }
    });
  });

  describe('resolveTemplate', () => {
    it('should replace {{nama}} with recipient name', () => {
      const result = resolveTemplate('Halo {{nama}}, apa kabar?', 'Budi');
      expect(result).toBe('Halo Budi, apa kabar?');
    });

    it('should replace all occurrences of {{nama}}', () => {
      const result = resolveTemplate('{{nama}} hi {{nama}}', 'Sari');
      expect(result).toBe('Sari hi Sari');
    });

    it('should use "Pelanggan" as fallback for null name', () => {
      const result = resolveTemplate('Halo {{nama}}', null);
      expect(result).toBe('Halo Pelanggan');
    });

    it('should use "Pelanggan" as fallback for undefined name', () => {
      const result = resolveTemplate('Halo {{nama}}', undefined);
      expect(result).toBe('Halo Pelanggan');
    });

    it('should use "Pelanggan" as fallback for empty string name', () => {
      const result = resolveTemplate('Halo {{nama}}', '');
      expect(result).toBe('Halo Pelanggan');
    });

    it('should use "Pelanggan" as fallback for whitespace-only name', () => {
      const result = resolveTemplate('Halo {{nama}}', '   ');
      expect(result).toBe('Halo Pelanggan');
    });

    it('should use "Pelanggan" as fallback for tab/newline-only name', () => {
      const result = resolveTemplate('Halo {{nama}}', '\t\n');
      expect(result).toBe('Halo Pelanggan');
    });

    it('should preserve template without {{nama}} placeholder unchanged', () => {
      const result = resolveTemplate('Hello world', 'Budi');
      expect(result).toBe('Hello world');
    });
  });

  describe('validateMessage', () => {
    it('should accept a valid message', () => {
      const result = validateMessage('Hello World');
      expect(result).toEqual({ valid: true });
    });

    it('should accept a message with exactly 1000 characters', () => {
      const message = 'a'.repeat(1000);
      const result = validateMessage(message);
      expect(result).toEqual({ valid: true });
    });

    it('should reject an empty string', () => {
      const result = validateMessage('');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject whitespace-only message (spaces)', () => {
      const result = validateMessage('     ');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject whitespace-only message (tabs and newlines)', () => {
      const result = validateMessage('\t\n\r  ');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject message exceeding 1000 characters', () => {
      const message = 'a'.repeat(1001);
      const result = validateMessage(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should accept a single non-whitespace character', () => {
      const result = validateMessage('a');
      expect(result).toEqual({ valid: true });
    });

    it('should accept message with leading/trailing whitespace if non-whitespace exists', () => {
      const result = validateMessage('   hello   ');
      expect(result).toEqual({ valid: true });
    });
  });

  /**
   * Feature: whatsapp-blast, Property 4: Placeholder resolution with fallback
   *
   * For any message template containing {{nama}} and for any recipient name
   * (including null, empty string, or valid name), resolving the placeholder
   * SHALL produce a message where {{nama}} is replaced by the recipient's name
   * if non-empty, or "Pelanggan" if the name is null or empty.
   *
   * **Validates: Requirements 4.2, 6.6**
   */
  describe('Property 4: Placeholder resolution with fallback', () => {
    const FALLBACK = 'Pelanggan';

    it('should replace {{nama}} with recipient name when name is a valid non-empty string', () => {
      fc.assert(
        fc.property(
          // Generate a template that contains at least one {{nama}} placeholder
          fc.tuple(fc.string(), fc.string()).map(([prefix, suffix]) => `${prefix}{{nama}}${suffix}`),
          // Generate a valid non-empty, non-whitespace-only name that avoids regex replacement special chars
          fc.string({ minLength: 1 })
            .filter((s) => s.trim().length > 0)
            .filter((s) => !s.includes('$')),
          (template, name) => {
            const result = resolveTemplate(template, name);
            expect(result).not.toContain('{{nama}}');
            expect(result).toContain(name);
          }
        )
      );
    });

    it('should replace {{nama}} with "Pelanggan" when name is null', () => {
      fc.assert(
        fc.property(
          fc.tuple(fc.string(), fc.string()).map(([prefix, suffix]) => `${prefix}{{nama}}${suffix}`),
          (template) => {
            const result = resolveTemplate(template, null);
            expect(result).not.toContain('{{nama}}');
            expect(result).toContain(FALLBACK);
          }
        )
      );
    });

    it('should replace {{nama}} with "Pelanggan" when name is undefined', () => {
      fc.assert(
        fc.property(
          fc.tuple(fc.string(), fc.string()).map(([prefix, suffix]) => `${prefix}{{nama}}${suffix}`),
          (template) => {
            const result = resolveTemplate(template, undefined);
            expect(result).not.toContain('{{nama}}');
            expect(result).toContain(FALLBACK);
          }
        )
      );
    });

    it('should replace {{nama}} with "Pelanggan" when name is empty string', () => {
      fc.assert(
        fc.property(
          fc.tuple(fc.string(), fc.string()).map(([prefix, suffix]) => `${prefix}{{nama}}${suffix}`),
          (template) => {
            const result = resolveTemplate(template, '');
            expect(result).not.toContain('{{nama}}');
            expect(result).toContain(FALLBACK);
          }
        )
      );
    });

    it('should replace {{nama}} with "Pelanggan" when name is whitespace-only', () => {
      fc.assert(
        fc.property(
          fc.tuple(fc.string(), fc.string()).map(([prefix, suffix]) => `${prefix}{{nama}}${suffix}`),
          // Generate whitespace-only strings (spaces, tabs, newlines)
          fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 20 })
            .map((chars) => chars.join('')),
          (template, whitespaceName) => {
            const result = resolveTemplate(template, whitespaceName);
            expect(result).not.toContain('{{nama}}');
            expect(result).toContain(FALLBACK);
          }
        )
      );
    });

    it('should replace all occurrences of {{nama}} in a template', () => {
      fc.assert(
        fc.property(
          // Generate template with multiple {{nama}} placeholders
          fc.nat({ max: 5 }).chain((count) =>
            fc.tuple(
              ...Array.from({ length: count + 2 }, () => fc.string())
            ).map((parts) => parts.join('{{nama}}'))
          ),
          fc.oneof(
            fc.constant(null as string | null | undefined),
            fc.constant(undefined as string | null | undefined),
            fc.constant('' as string | null | undefined),
            fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0) as fc.Arbitrary<string | null | undefined>
          ),
          (template, name) => {
            const result = resolveTemplate(template, name);
            expect(result).not.toContain('{{nama}}');
          }
        )
      );
    });
  });

  /**
   * Feature: whatsapp-blast, Property 5: Whitespace-only message rejection
   *
   * For any string composed entirely of whitespace characters (spaces, tabs,
   * newlines, or any combination thereof), the message validation function SHALL
   * reject it as invalid. For any string containing at least one non-whitespace
   * character, the validation SHALL accept it (subject to length constraint).
   *
   * **Validates: Requirements 4.4, 4.6**
   */
  describe('Property 5: Whitespace-only message rejection', () => {
    it('should reject any string composed entirely of whitespace characters', () => {
      fc.assert(
        fc.property(
          // Generate whitespace-only strings from spaces, tabs, newlines, carriage returns
          fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 100 })
            .map((chars) => chars.join('')),
          (whitespaceStr) => {
            const result = validateMessage(whitespaceStr);
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
          }
        )
      );
    });

    it('should accept any string containing at least one non-whitespace character (within length limit)', () => {
      fc.assert(
        fc.property(
          // Generate strings that contain at least one non-whitespace char and are within 1-1000 length
          fc.string({ minLength: 1, maxLength: 1000 })
            .filter((s) => s.trim().length > 0),
          (validStr) => {
            const result = validateMessage(validStr);
            expect(result.valid).toBe(true);
          }
        )
      );
    });
  });

  /**
   * Feature: whatsapp-blast, Property 6: Message length constraint
   *
   * For any message string, the validation function SHALL accept it if and only
   * if its length is between 1 and 1000 characters (inclusive) and it contains
   * at least one non-whitespace character.
   *
   * **Validates: Requirements 4.4, 4.6**
   */
  describe('Property 6: Message length constraint', () => {
    it('should accept messages with 1-1000 chars that have at least one non-whitespace character', () => {
      fc.assert(
        fc.property(
          // Generate valid messages: 1-1000 chars with at least one non-whitespace
          fc.string({ minLength: 1, maxLength: 1000 })
            .filter((s) => s.trim().length > 0),
          (msg) => {
            const result = validateMessage(msg);
            expect(result.valid).toBe(true);
          }
        )
      );
    });

    it('should reject empty strings (length 0)', () => {
      const result = validateMessage('');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject messages exceeding 1000 characters', () => {
      fc.assert(
        fc.property(
          // Generate strings longer than 1000 chars with at least one non-whitespace
          fc.integer({ min: 1001, max: 2000 }).chain((len) =>
            fc.string({ minLength: len, maxLength: len })
              .filter((s) => s.trim().length > 0)
          ),
          (longMsg) => {
            const result = validateMessage(longMsg);
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
          }
        )
      );
    });

    it('should correctly validate messages at boundary lengths', () => {
      fc.assert(
        fc.property(
          // Generate random strings of varying lengths (0-2000)
          fc.integer({ min: 0, max: 2000 }).chain((len) =>
            len === 0
              ? fc.constant('')
              : fc.string({ minLength: len, maxLength: len })
          ),
          (msg) => {
            const result = validateMessage(msg);
            const hasNonWhitespace = msg.trim().length > 0;
            const withinLength = msg.length >= 1 && msg.length <= 1000;

            if (hasNonWhitespace && withinLength) {
              expect(result.valid).toBe(true);
            } else {
              expect(result.valid).toBe(false);
              expect(result.error).toBeDefined();
            }
          }
        )
      );
    });
  });
});
