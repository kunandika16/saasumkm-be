import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatIDR } from '../../src/utils/formatting';

/**
 * Property 2: IDR Currency Formatting
 *
 * For any non-negative integer representing a price in IDR,
 * the formatting function SHALL produce a string with "Rp " prefix
 * and the number formatted with period as thousands separator.
 *
 * **Validates: Requirements 5.1, 5.4**
 */
describe('Property 2: IDR Currency Formatting', () => {
  it('should always produce a string starting with "Rp " prefix', () => {
    fc.assert(
      fc.property(
        fc.nat(), // non-negative integer
        (amount) => {
          const result = formatIDR(amount);
          expect(result.startsWith('Rp ')).toBe(true);
        }
      )
    );
  });

  it('should use periods as thousands separators', () => {
    fc.assert(
      fc.property(
        fc.nat(),
        (amount) => {
          const result = formatIDR(amount);
          // Extract the numeric part after "Rp "
          const numericPart = result.slice(3);

          if (amount < 1000) {
            // Numbers below 1000 should have no periods
            expect(numericPart).not.toContain('.');
          } else {
            // Numbers >= 1000 should have periods as thousands separators
            expect(numericPart).toContain('.');
            // Each group between periods (except the first) should be exactly 3 digits
            const groups = numericPart.split('.');
            // First group can be 1-3 digits
            expect(groups[0].length).toBeGreaterThanOrEqual(1);
            expect(groups[0].length).toBeLessThanOrEqual(3);
            // All subsequent groups must be exactly 3 digits
            for (let i = 1; i < groups.length; i++) {
              expect(groups[i].length).toBe(3);
            }
          }
        }
      )
    );
  });

  it('should be reversible: removing "Rp " and periods yields the original amount', () => {
    fc.assert(
      fc.property(
        fc.nat(),
        (amount) => {
          const result = formatIDR(amount);
          // Remove "Rp " prefix and all period separators
          const stripped = result.slice(3).replace(/\./g, '');
          const parsed = parseInt(stripped, 10);
          expect(parsed).toBe(amount);
        }
      )
    );
  });

  it('should only contain valid characters: "Rp ", digits, and periods', () => {
    fc.assert(
      fc.property(
        fc.nat(),
        (amount) => {
          const result = formatIDR(amount);
          // Must match pattern: "Rp " followed by digits optionally separated by periods
          expect(result).toMatch(/^Rp \d{1,3}(\.\d{3})*$/);
        }
      )
    );
  });

  it('should format 0 as "Rp 0"', () => {
    expect(formatIDR(0)).toBe('Rp 0');
  });

  it('should format single digits without separator', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9 }),
        (amount) => {
          const result = formatIDR(amount);
          expect(result).toBe(`Rp ${amount}`);
          expect(result).not.toContain('.');
        }
      )
    );
  });

  it('should format numbers < 1000 without separator', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 999 }),
        (amount) => {
          const result = formatIDR(amount);
          expect(result).toBe(`Rp ${amount}`);
          expect(result).not.toContain('.');
        }
      )
    );
  });
});
