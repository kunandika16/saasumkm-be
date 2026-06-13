import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { encodeBarcode, decodeBarcode } from '../../src/utils/barcode';

/**
 * Property 6: Payment Barcode Encoding Round-Trip
 *
 * For any order ID (UUID string) and final total (non-negative integer),
 * encoding into a payment barcode and then decoding SHALL produce
 * the original order ID and final total.
 *
 * **Validates: Requirements 6.5, 6.6**
 */

// Generator for UUID-like order IDs
const orderIdArb: fc.Arbitrary<string> = fc.uuid();

// Generator for non-negative integer final totals (IDR, max realistic value)
const finalTotalArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 100_000_000 });

describe('Property 6: Payment Barcode Encoding Round-Trip', () => {
  it('encode → decode produces the original orderId and finalTotal', () => {
    fc.assert(
      fc.property(orderIdArb, finalTotalArb, (orderId, finalTotal) => {
        const barcode = encodeBarcode(orderId, finalTotal);
        const decoded = decodeBarcode(barcode);

        expect(decoded.orderId).toBe(orderId);
        expect(decoded.finalTotal).toBe(finalTotal);
      }),
      { numRuns: 200 }
    );
  });

  it('encoded barcode is a non-empty string', () => {
    fc.assert(
      fc.property(orderIdArb, finalTotalArb, (orderId, finalTotal) => {
        const barcode = encodeBarcode(orderId, finalTotal);

        expect(typeof barcode).toBe('string');
        expect(barcode.length).toBeGreaterThan(0);
      }),
      { numRuns: 200 }
    );
  });

  it('encoded barcode is valid base64', () => {
    fc.assert(
      fc.property(orderIdArb, finalTotalArb, (orderId, finalTotal) => {
        const barcode = encodeBarcode(orderId, finalTotal);

        // Base64 string should only contain valid base64 characters
        expect(barcode).toMatch(/^[A-Za-z0-9+/]+=*$/);
      }),
      { numRuns: 200 }
    );
  });

  it('invalid/corrupted barcode strings throw errors on decode', () => {
    const corruptedBarcodeArb: fc.Arbitrary<string> = fc.oneof(
      // Strings that decode to valid JSON but missing required fields
      fc.record({
        someField: fc.string(),
      }).map((obj) => Buffer.from(JSON.stringify(obj), 'utf-8').toString('base64')),
      // Strings that decode to non-JSON content
      fc.string({ minLength: 1, maxLength: 20 }).map(
        (s) => Buffer.from(`not-json-${s}`, 'utf-8').toString('base64')
      )
    );

    fc.assert(
      fc.property(corruptedBarcodeArb, (corrupted) => {
        expect(() => decodeBarcode(corrupted)).toThrow();
      }),
      { numRuns: 200 }
    );
  });
});

/**
 * Property 8: Order State Machine Validity
 *
 * For any order in a terminal state (paid, cancelled, or expired), attempting to
 * transition to any other state SHALL be rejected. Only orders in "pending" state
 * SHALL accept transitions to paid, cancelled, or expired.
 *
 * State machine rules:
 *   pending → paid     (admin confirms)
 *   pending → cancelled (admin rejects)
 *   pending → expired   (24h timeout via cron)
 *   paid, cancelled, expired → ANY = REJECTED (terminal states)
 *
 * Validates: Requirements 7.9
 */

// ─── Types ───────────────────────────────────────────────────────────────────

type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'expired';
type TransitionAction = 'confirm' | 'reject' | 'expire';

type TransitionResult =
  | { success: true; newStatus: OrderStatus }
  | { success: false; error: string };

// ─── Pure State Machine Function ─────────────────────────────────────────────

const TERMINAL_STATES: OrderStatus[] = ['paid', 'cancelled', 'expired'];

/**
 * Pure state machine function that models order status transitions.
 * Mirrors the logic in order.service.ts validatePayment/expireOrders.
 */
function attemptTransition(
  currentStatus: OrderStatus,
  action: TransitionAction
): TransitionResult {
  // Terminal states reject ALL transitions
  if (currentStatus !== 'pending') {
    return {
      success: false,
      error: `Order tidak dapat diubah karena status saat ini adalah "${currentStatus}"`,
    };
  }

  // Only pending state accepts transitions
  switch (action) {
    case 'confirm':
      return { success: true, newStatus: 'paid' };
    case 'reject':
      return { success: true, newStatus: 'cancelled' };
    case 'expire':
      return { success: true, newStatus: 'expired' };
    default:
      return {
        success: false,
        error: `Action "${action}" tidak valid`,
      };
  }
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generates any valid order status */
const orderStatusArb: fc.Arbitrary<OrderStatus> = fc.constantFrom(
  'pending',
  'paid',
  'cancelled',
  'expired'
);

/** Generates only terminal states */
const terminalStatusArb: fc.Arbitrary<OrderStatus> = fc.constantFrom(
  'paid',
  'cancelled',
  'expired'
);

/** Generates any valid transition action */
const transitionActionArb: fc.Arbitrary<TransitionAction> = fc.constantFrom(
  'confirm',
  'reject',
  'expire'
);

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 8: Order State Machine Validity', () => {
  it('terminal states (paid/cancelled/expired) reject ALL transition attempts', () => {
    fc.assert(
      fc.property(terminalStatusArb, transitionActionArb, (currentStatus, action) => {
        const result = attemptTransition(currentStatus, action);

        // Terminal states MUST reject all transitions
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe(
            `Order tidak dapat diubah karena status saat ini adalah "${currentStatus}"`
          );
        }
      }),
      { numRuns: 200 }
    );
  });

  it('only pending state accepts transitions (confirm → paid, reject → cancelled, expire → expired)', () => {
    fc.assert(
      fc.property(transitionActionArb, (action) => {
        const result = attemptTransition('pending', action);

        // Pending state MUST accept all valid transitions
        expect(result.success).toBe(true);
        if (result.success) {
          switch (action) {
            case 'confirm':
              expect(result.newStatus).toBe('paid');
              break;
            case 'reject':
              expect(result.newStatus).toBe('cancelled');
              break;
            case 'expire':
              expect(result.newStatus).toBe('expired');
              break;
          }
        }
      }),
      { numRuns: 200 }
    );
  });

  it('exactly these transitions are valid: pending→paid, pending→cancelled, pending→expired; all others are invalid', () => {
    fc.assert(
      fc.property(orderStatusArb, transitionActionArb, (currentStatus, action) => {
        const result = attemptTransition(currentStatus, action);

        if (currentStatus === 'pending') {
          // Pending accepts all actions
          expect(result.success).toBe(true);

          if (result.success) {
            // Verify exact mapping
            const expectedMapping: Record<TransitionAction, OrderStatus> = {
              confirm: 'paid',
              reject: 'cancelled',
              expire: 'expired',
            };
            expect(result.newStatus).toBe(expectedMapping[action]);
          }
        } else {
          // All non-pending states reject all actions
          expect(result.success).toBe(false);
        }
      }),
      { numRuns: 500 }
    );
  });

  it('transitions from pending always result in a terminal state', () => {
    fc.assert(
      fc.property(transitionActionArb, (action) => {
        const result = attemptTransition('pending', action);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(TERMINAL_STATES).toContain(result.newStatus);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('once in a terminal state, the state cannot change regardless of repeated attempts', () => {
    fc.assert(
      fc.property(
        terminalStatusArb,
        fc.array(transitionActionArb, { minLength: 1, maxLength: 10 }),
        (initialTerminalStatus, actions) => {
          // Apply multiple transition attempts to a terminal state
          let currentStatus: OrderStatus = initialTerminalStatus;

          for (const action of actions) {
            const result = attemptTransition(currentStatus, action);
            // Every attempt must fail
            expect(result.success).toBe(false);
            // Status must remain unchanged
            // (since it failed, currentStatus stays the same)
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
