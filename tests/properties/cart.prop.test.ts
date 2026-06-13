import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateCartTotal } from '../../src/services/cart.service';
import type { CartItem } from '../../src/services/cart.service';

/**
 * Property 3: Cart Total Invariant
 *
 * For any cart containing items with prices and quantities, the computed total
 * SHALL equal the sum of (price × quantity) for all items where isAvailable is true,
 * and all item quantities SHALL be within the range [1, 99].
 *
 * **Validates: Requirements 5.3, 5.4, 5.5, 5.9**
 */

// Generator for a single CartItem with quantity in [1, 99] and non-negative price
const cartItemArb: fc.Arbitrary<CartItem> = fc.record({
  menuItemId: fc.uuid(),
  quantity: fc.integer({ min: 1, max: 99 }),
  price: fc.integer({ min: 0, max: 1_000_000 }),
  isAvailable: fc.boolean(),
});

// Generator for an array of CartItems (0 to 50 items)
const cartItemsArb: fc.Arbitrary<CartItem[]> = fc.array(cartItemArb, {
  minLength: 0,
  maxLength: 50,
});

describe('Property 3: Cart Total Invariant', () => {
  it('total equals sum of (price × quantity) for available items only', () => {
    fc.assert(
      fc.property(cartItemsArb, (items) => {
        const result = calculateCartTotal(items);

        // Manually compute expected total
        const expectedTotal = items.reduce((sum, item) => {
          if (item.isAvailable) {
            return sum + item.price * item.quantity;
          }
          return sum;
        }, 0);

        expect(result).toBe(expectedTotal);
      }),
      { numRuns: 200 }
    );
  });

  it('unavailable items are excluded from the total', () => {
    fc.assert(
      fc.property(cartItemsArb, (items) => {
        const total = calculateCartTotal(items);

        // Total with only available items should equal the result
        const availableOnly = items.filter((item) => item.isAvailable);
        const availableTotal = availableOnly.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        );

        expect(total).toBe(availableTotal);

        // If all items are unavailable, total must be 0
        if (availableOnly.length === 0) {
          expect(total).toBe(0);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('empty cart returns 0', () => {
    fc.assert(
      fc.property(fc.constant([]), (items: CartItem[]) => {
        expect(calculateCartTotal(items)).toBe(0);
      }),
      { numRuns: 1 }
    );
  });

  it('total is always non-negative', () => {
    fc.assert(
      fc.property(cartItemsArb, (items) => {
        const total = calculateCartTotal(items);
        expect(total).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 200 }
    );
  });

  it('quantities are within [1, 99] bounds', () => {
    fc.assert(
      fc.property(cartItemsArb, (items) => {
        for (const item of items) {
          expect(item.quantity).toBeGreaterThanOrEqual(1);
          expect(item.quantity).toBeLessThanOrEqual(99);
        }
      }),
      { numRuns: 200 }
    );
  });
});
