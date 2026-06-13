import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 5: Voucher State Validation
 *
 * For any voucher code submission, the validation function SHALL reject with the correct
 * reason if: (a) the code does not exist → "Kode voucher tidak valid",
 * (b) is_active = false → "Voucher sudah tidak aktif",
 * (c) expiry_date < current date → "Voucher sudah kedaluwarsa",
 * (d) current_usage >= max_usage → "Voucher sudah mencapai batas penggunaan".
 * Valid vouchers (existing, active, not expired, under limit) SHALL be accepted.
 *
 * Validates: Requirements 6.3, 9.6, 9.8
 */

// ─── Pure Validation Function (mirrors voucher.service.ts logic) ─────────────

interface VoucherState {
  exists: boolean;
  isActive: boolean;
  expiryDate: Date;
  currentUsage: number;
  maxUsage: number;
}

type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Pure voucher state validation function.
 * Implements the same validation logic and precedence as validateVoucher in voucher.service.ts.
 */
function validateVoucherState(state: VoucherState, today: Date): ValidationResult {
  if (!state.exists) {
    return { valid: false, reason: 'Kode voucher tidak valid' };
  }

  if (!state.isActive) {
    return { valid: false, reason: 'Voucher sudah tidak aktif' };
  }

  // Compare dates at day level (same as service: today.setHours(0,0,0,0))
  const todayNormalized = new Date(today);
  todayNormalized.setHours(0, 0, 0, 0);

  if (state.expiryDate < todayNormalized) {
    return { valid: false, reason: 'Voucher sudah kedaluwarsa' };
  }

  if (state.currentUsage >= state.maxUsage) {
    return { valid: false, reason: 'Voucher sudah mencapai batas penggunaan' };
  }

  return { valid: true };
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generates a date in the past (1-365 days ago) */
const pastDateArb = fc.integer({ min: 1, max: 365 }).map((daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d;
});

/** Generates a date in the future (1-365 days from now) */
const futureDateArb = fc.integer({ min: 1, max: 365 }).map((daysAhead) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(0, 0, 0, 0);
  return d;
});

/** Generates a valid voucher state (exists, active, not expired, under max usage) */
const validVoucherStateArb: fc.Arbitrary<VoucherState> = fc.record({
  exists: fc.constant(true),
  isActive: fc.constant(true),
  expiryDate: futureDateArb,
  currentUsage: fc.integer({ min: 0, max: 98 }),
  maxUsage: fc.integer({ min: 1, max: 99 }),
}).filter((state) => state.currentUsage < state.maxUsage);

/** Generates an arbitrary voucher state (may be valid or invalid) */
const arbitraryVoucherStateArb: fc.Arbitrary<VoucherState> = fc.record({
  exists: fc.boolean(),
  isActive: fc.boolean(),
  expiryDate: fc.oneof(pastDateArb, futureDateArb),
  currentUsage: fc.integer({ min: 0, max: 200 }),
  maxUsage: fc.integer({ min: 1, max: 100 }),
});

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 5: Voucher State Validation', () => {
  const today = new Date();

  it('should accept valid vouchers (exists, active, not expired, under max usage)', () => {
    fc.assert(
      fc.property(validVoucherStateArb, (state) => {
        const result = validateVoucherState(state, today);
        expect(result.valid).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it('should reject non-existent voucher with "Kode voucher tidak valid"', () => {
    fc.assert(
      fc.property(
        fc.record({
          exists: fc.constant(false as const),
          isActive: fc.boolean(),
          expiryDate: fc.oneof(pastDateArb, futureDateArb),
          currentUsage: fc.integer({ min: 0, max: 200 }),
          maxUsage: fc.integer({ min: 1, max: 100 }),
        }),
        (state) => {
          const result = validateVoucherState(state, today);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.reason).toBe('Kode voucher tidak valid');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject inactive voucher with "Voucher sudah tidak aktif"', () => {
    fc.assert(
      fc.property(
        fc.record({
          exists: fc.constant(true as const),
          isActive: fc.constant(false as const),
          expiryDate: futureDateArb,
          currentUsage: fc.integer({ min: 0, max: 50 }),
          maxUsage: fc.integer({ min: 51, max: 100 }),
        }),
        (state) => {
          const result = validateVoucherState(state, today);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.reason).toBe('Voucher sudah tidak aktif');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject expired voucher with "Voucher sudah kedaluwarsa"', () => {
    fc.assert(
      fc.property(
        fc.record({
          exists: fc.constant(true as const),
          isActive: fc.constant(true as const),
          expiryDate: pastDateArb,
          currentUsage: fc.integer({ min: 0, max: 50 }),
          maxUsage: fc.integer({ min: 51, max: 100 }),
        }),
        (state) => {
          const result = validateVoucherState(state, today);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.reason).toBe('Voucher sudah kedaluwarsa');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject maxed-out voucher with "Voucher sudah mencapai batas penggunaan"', () => {
    fc.assert(
      fc.property(
        fc.record({
          exists: fc.constant(true as const),
          isActive: fc.constant(true as const),
          expiryDate: futureDateArb,
          currentUsage: fc.integer({ min: 50, max: 200 }),
          maxUsage: fc.integer({ min: 1, max: 50 }),
        }).filter((s) => s.currentUsage >= s.maxUsage),
        (state) => {
          const result = validateVoucherState(state, today);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.reason).toBe('Voucher sudah mencapai batas penggunaan');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should enforce validation precedence: non-existent > inactive > expired > maxed', () => {
    fc.assert(
      fc.property(arbitraryVoucherStateArb, (state) => {
        const result = validateVoucherState(state, today);

        if (!state.exists) {
          // Non-existent always takes precedence
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.reason).toBe('Kode voucher tidak valid');
          }
        } else if (!state.isActive) {
          // Inactive takes precedence over expired and maxed
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.reason).toBe('Voucher sudah tidak aktif');
          }
        } else {
          // Normalize today for date comparison
          const todayNormalized = new Date(today);
          todayNormalized.setHours(0, 0, 0, 0);

          if (state.expiryDate < todayNormalized) {
            // Expired takes precedence over maxed
            expect(result.valid).toBe(false);
            if (!result.valid) {
              expect(result.reason).toBe('Voucher sudah kedaluwarsa');
            }
          } else if (state.currentUsage >= state.maxUsage) {
            expect(result.valid).toBe(false);
            if (!result.valid) {
              expect(result.reason).toBe('Voucher sudah mencapai batas penggunaan');
            }
          } else {
            expect(result.valid).toBe(true);
          }
        }
      }),
      { numRuns: 500 }
    );
  });

  it('should always return exactly one rejection reason for invalid states', () => {
    fc.assert(
      fc.property(
        arbitraryVoucherStateArb.filter((s) => {
          const todayNorm = new Date();
          todayNorm.setHours(0, 0, 0, 0);
          // Filter to only invalid states
          return !s.exists || !s.isActive || s.expiryDate < todayNorm || s.currentUsage >= s.maxUsage;
        }),
        (state) => {
          const result = validateVoucherState(state, today);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            const validReasons = [
              'Kode voucher tidak valid',
              'Voucher sudah tidak aktif',
              'Voucher sudah kedaluwarsa',
              'Voucher sudah mencapai batas penggunaan',
            ];
            expect(validReasons).toContain(result.reason);
          }
        }
      ),
      { numRuns: 300 }
    );
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// Property 13: Voucher Creation Validation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Property 13: Voucher Creation Validation
 *
 * For any voucher creation input, the validation SHALL accept if and only if:
 * - code is 1-20 alphanumeric characters
 * - discountValue is in valid range per type (percentage: 1-100, fixed: 1000-10000000)
 * - expiryDate is a future ISO datetime
 * - maxUsage >= 1
 *
 * Validates: Requirements 9.1, 9.2, 9.3
 */

import { CreateVoucherRequestSchema } from '../../src/validators/voucher.validator';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a future ISO datetime string offset by given milliseconds */
function futureISODate(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

/** Generate a past ISO datetime string offset by given milliseconds */
function pastISODate(offsetMs: number): string {
  return new Date(Date.now() - offsetMs).toISOString();
}

// ─── Arbitraries for Property 13 ─────────────────────────────────────────────

const alphanumChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const alphanumCharArb = fc.constantFrom(...alphanumChars.split(''));

/** Valid voucher code: 1-20 alphanumeric characters */
const validCodeArb = fc
  .array(alphanumCharArb, { minLength: 1, maxLength: 20 })
  .map((chars) => chars.join(''));

/** Invalid code: empty string */
const emptyCodeArb = fc.constant('');

/** Invalid code: too long (21-50 chars, alphanumeric) */
const tooLongCodeArb = fc
  .array(alphanumCharArb, { minLength: 21, maxLength: 50 })
  .map((chars) => chars.join(''));

/** Invalid code: contains non-alphanumeric characters */
const nonAlphanumCodeArb = fc
  .tuple(
    fc.array(alphanumCharArb, { minLength: 0, maxLength: 10 }).map((c) => c.join('')),
    fc.constantFrom('!', '@', '#', '$', '%', '^', '&', '*', '-', '_', ' ', '.', '/'),
    fc.array(alphanumCharArb, { minLength: 0, maxLength: 9 }).map((c) => c.join(''))
  )
  .map(([prefix, special, suffix]) => prefix + special + suffix)
  .filter((s) => s.length >= 1 && s.length <= 20);

/** Valid percentage discount value: 1-100 */
const validPercentageValueArb = fc.integer({ min: 1, max: 100 });

/** Invalid percentage discount value: outside 1-100 */
const invalidPercentageValueArb = fc.oneof(
  fc.integer({ min: -1000, max: 0 }),
  fc.integer({ min: 101, max: 10000 })
);

/** Valid fixed discount value: 1000-10000000 */
const validFixedValueArb = fc.integer({ min: 1000, max: 10_000_000 });

/** Invalid fixed discount value: outside 1000-10000000 */
const invalidFixedValueArb = fc.oneof(
  fc.integer({ min: -1000, max: 999 }),
  fc.integer({ min: 10_000_001, max: 100_000_000 })
);

/** Future expiry date (1 hour to 365 days ahead) */
const validExpiryArb = fc
  .integer({ min: 3600000, max: 365 * 24 * 3600000 })
  .map((offset) => futureISODate(offset));

/** Past expiry date (1 hour to 365 days ago) */
const pastExpiryArb = fc
  .integer({ min: 3600000, max: 365 * 24 * 3600000 })
  .map((offset) => pastISODate(offset));

/** Valid maxUsage: >= 1 */
const validMaxUsageArb = fc.integer({ min: 1, max: 10000 });

/** Invalid maxUsage: < 1 */
const invalidMaxUsageArb = fc.integer({ min: -100, max: 0 });

/** Discount type arbitrary */
const discountTypeArb = fc.constantFrom('percentage' as const, 'fixed' as const);

// ─── Full valid voucher creation input ───────────────────────────────────────

const validVoucherInputArb = fc
  .record({
    code: validCodeArb,
    discountType: discountTypeArb,
    expiryDate: validExpiryArb,
    maxUsage: validMaxUsageArb,
  })
  .chain((base) => {
    const valueArb =
      base.discountType === 'percentage' ? validPercentageValueArb : validFixedValueArb;
    return valueArb.map((discountValue) => ({
      ...base,
      discountValue,
    }));
  });

// ─── Property 13 Tests ──────────────────────────────────────────────────────

describe('Property 13: Voucher Creation Validation', () => {
  it('should accept all valid voucher creation inputs', () => {
    fc.assert(
      fc.property(validVoucherInputArb, (input) => {
        const result = CreateVoucherRequestSchema.safeParse(input);
        expect(result.success).toBe(true);
      }),
      { numRuns: 300 }
    );
  });

  it('should reject empty voucher codes', () => {
    fc.assert(
      fc.property(
        fc.record({
          code: emptyCodeArb,
          discountType: discountTypeArb,
          discountValue: validPercentageValueArb,
          expiryDate: validExpiryArb,
          maxUsage: validMaxUsageArb,
        }),
        (input) => {
          const result = CreateVoucherRequestSchema.safeParse(input);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should reject voucher codes longer than 20 characters', () => {
    fc.assert(
      fc.property(
        fc.record({
          code: tooLongCodeArb,
          discountType: fc.constant('percentage' as const),
          discountValue: validPercentageValueArb,
          expiryDate: validExpiryArb,
          maxUsage: validMaxUsageArb,
        }),
        (input) => {
          const result = CreateVoucherRequestSchema.safeParse(input);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject voucher codes with non-alphanumeric characters', () => {
    fc.assert(
      fc.property(
        fc.record({
          code: nonAlphanumCodeArb,
          discountType: fc.constant('percentage' as const),
          discountValue: validPercentageValueArb,
          expiryDate: validExpiryArb,
          maxUsage: validMaxUsageArb,
        }),
        (input) => {
          const result = CreateVoucherRequestSchema.safeParse(input);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject percentage discount values outside 1-100', () => {
    fc.assert(
      fc.property(
        fc.record({
          code: validCodeArb,
          discountType: fc.constant('percentage' as const),
          discountValue: invalidPercentageValueArb,
          expiryDate: validExpiryArb,
          maxUsage: validMaxUsageArb,
        }),
        (input) => {
          const result = CreateVoucherRequestSchema.safeParse(input);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject fixed discount values outside 1000-10000000', () => {
    fc.assert(
      fc.property(
        fc.record({
          code: validCodeArb,
          discountType: fc.constant('fixed' as const),
          discountValue: invalidFixedValueArb,
          expiryDate: validExpiryArb,
          maxUsage: validMaxUsageArb,
        }),
        (input) => {
          const result = CreateVoucherRequestSchema.safeParse(input);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject past expiry dates', () => {
    fc.assert(
      fc.property(
        fc.record({
          code: validCodeArb,
          discountType: fc.constant('percentage' as const),
          discountValue: validPercentageValueArb,
          expiryDate: pastExpiryArb,
          maxUsage: validMaxUsageArb,
        }),
        (input) => {
          const result = CreateVoucherRequestSchema.safeParse(input);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject maxUsage less than 1', () => {
    fc.assert(
      fc.property(
        fc.record({
          code: validCodeArb,
          discountType: fc.constant('percentage' as const),
          discountValue: validPercentageValueArb,
          expiryDate: validExpiryArb,
          maxUsage: invalidMaxUsageArb,
        }),
        (input) => {
          const result = CreateVoucherRequestSchema.safeParse(input);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept iff ALL conditions are met (combined validation)', () => {
    // Generate inputs that are either fully valid or have exactly one invalid field
    const inputWithPossibleInvalidFieldArb = fc
      .record({
        validCode: fc.boolean(),
        validValue: fc.boolean(),
        validExpiry: fc.boolean(),
        validUsage: fc.boolean(),
        discountType: discountTypeArb,
      })
      .chain((flags) => {
        const codeArb = flags.validCode ? validCodeArb : fc.oneof(emptyCodeArb, tooLongCodeArb, nonAlphanumCodeArb);
        const valueArb = flags.validValue
          ? (flags.discountType === 'percentage' ? validPercentageValueArb : validFixedValueArb)
          : (flags.discountType === 'percentage' ? invalidPercentageValueArb : invalidFixedValueArb);
        const expiryArb = flags.validExpiry ? validExpiryArb : pastExpiryArb;
        const usageArb = flags.validUsage ? validMaxUsageArb : invalidMaxUsageArb;

        return fc
          .tuple(codeArb, valueArb, expiryArb, usageArb)
          .map(([code, discountValue, expiryDate, maxUsage]) => ({
            input: {
              code,
              discountType: flags.discountType,
              discountValue,
              expiryDate,
              maxUsage,
            },
            allValid: flags.validCode && flags.validValue && flags.validExpiry && flags.validUsage,
          }));
      });

    fc.assert(
      fc.property(inputWithPossibleInvalidFieldArb, ({ input, allValid }) => {
        const result = CreateVoucherRequestSchema.safeParse(input);
        if (allValid) {
          expect(result.success).toBe(true);
        } else {
          expect(result.success).toBe(false);
        }
      }),
      { numRuns: 500 }
    );
  });
});
