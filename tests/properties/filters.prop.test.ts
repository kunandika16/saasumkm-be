import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 14: Active Promotions Filter
 *
 * The Landing_Page SHALL display Voucher promotions where the current date is within
 * the promotion start and end date and remaining claim quota is greater than zero,
 * showing a maximum of 10 promotions sorted by end date ascending.
 *
 * A promotion is "active" if:
 * - isActive = true
 * - expiryDate >= today (not expired)
 * - currentUsage < maxUsage (remaining quota > 0)
 *
 * The filter:
 * 1. Returns only vouchers matching ALL criteria
 * 2. Returns at most 10 items
 * 3. Returns items sorted by expiryDate ascending
 * 4. Returns empty array if no promotions match
 *
 * **Validates: Requirements 4.6**
 */

// ─── Voucher Promotion Interface ─────────────────────────────────────────────

interface VoucherPromotion {
  id: string;
  code: string;
  isActive: boolean;
  expiryDate: Date;
  currentUsage: number;
  maxUsage: number;
}

// ─── Pure Filter Function ────────────────────────────────────────────────────

/**
 * Pure filter function for active promotions.
 * Mirrors the logic that the backend/frontend would use to display active promotions
 * on the Landing Page.
 */
function filterActivePromotions(vouchers: VoucherPromotion[], today: Date): VoucherPromotion[] {
  const todayNormalized = new Date(today);
  todayNormalized.setHours(0, 0, 0, 0);

  const active = vouchers.filter((v) => {
    // Must be active
    if (!v.isActive) return false;

    // Must not be expired (expiryDate >= today)
    const expiryNormalized = new Date(v.expiryDate);
    expiryNormalized.setHours(0, 0, 0, 0);
    if (expiryNormalized < todayNormalized) return false;

    // Must have remaining quota (currentUsage < maxUsage)
    if (v.currentUsage >= v.maxUsage) return false;

    return true;
  });

  // Sort by expiryDate ascending
  active.sort((a, b) => {
    const aDate = new Date(a.expiryDate).getTime();
    const bDate = new Date(b.expiryDate).getTime();
    return aDate - bDate;
  });

  // Return max 10
  return active.slice(0, 10);
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const alphanumChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const alphanumCharArb = fc.constantFrom(...alphanumChars.split(''));

/** Generates a voucher code (1-20 alphanumeric characters) */
const codeArb = fc.array(alphanumCharArb, { minLength: 1, maxLength: 20 }).map((c) => c.join(''));

/** Generates a date in the past (1-365 days ago, normalized to midnight) */
const pastDateArb = fc.integer({ min: 1, max: 365 }).map((daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d;
});

/** Generates a date in the future (0-365 days from now, normalized to midnight) */
const futureDateArb = fc.integer({ min: 0, max: 365 }).map((daysAhead) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(0, 0, 0, 0);
  return d;
});

/** Generates a random voucher with mixed states (active/inactive, expired/future, used-up/available) */
const voucherPromotionArb: fc.Arbitrary<VoucherPromotion> = fc.record({
  id: fc.uuid(),
  code: codeArb,
  isActive: fc.boolean(),
  expiryDate: fc.oneof(pastDateArb, futureDateArb),
  currentUsage: fc.integer({ min: 0, max: 200 }),
  maxUsage: fc.integer({ min: 1, max: 100 }),
});

/** Generates a list of vouchers with various states */
const voucherListArb = fc.array(voucherPromotionArb, { minLength: 0, maxLength: 30 });

/** Generates a voucher that IS active (meets all criteria) */
const activeVoucherArb: fc.Arbitrary<VoucherPromotion> = fc.record({
  id: fc.uuid(),
  code: codeArb,
  isActive: fc.constant(true),
  expiryDate: futureDateArb,
  currentUsage: fc.integer({ min: 0, max: 49 }),
  maxUsage: fc.integer({ min: 50, max: 100 }),
});

/** Generates a voucher that is NOT active (fails at least one criterion) */
const inactiveVoucherArb: fc.Arbitrary<VoucherPromotion> = fc.oneof(
  // Inactive flag
  fc.record({
    id: fc.uuid(),
    code: codeArb,
    isActive: fc.constant(false),
    expiryDate: futureDateArb,
    currentUsage: fc.integer({ min: 0, max: 49 }),
    maxUsage: fc.integer({ min: 50, max: 100 }),
  }),
  // Expired
  fc.record({
    id: fc.uuid(),
    code: codeArb,
    isActive: fc.constant(true),
    expiryDate: pastDateArb,
    currentUsage: fc.integer({ min: 0, max: 49 }),
    maxUsage: fc.integer({ min: 50, max: 100 }),
  }),
  // Maxed out usage
  fc.record({
    id: fc.uuid(),
    code: codeArb,
    isActive: fc.constant(true),
    expiryDate: futureDateArb,
    currentUsage: fc.integer({ min: 50, max: 200 }),
    maxUsage: fc.integer({ min: 1, max: 50 }),
  }).filter((v) => v.currentUsage >= v.maxUsage),
);

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 14: Active Promotions Filter', () => {
  const today = new Date();

  it('should return only vouchers that are active, not expired, and have remaining quota', () => {
    fc.assert(
      fc.property(voucherListArb, (vouchers) => {
        const result = filterActivePromotions(vouchers, today);

        const todayNormalized = new Date(today);
        todayNormalized.setHours(0, 0, 0, 0);

        for (const v of result) {
          // Must be active
          expect(v.isActive).toBe(true);

          // Must not be expired
          const expiryNormalized = new Date(v.expiryDate);
          expiryNormalized.setHours(0, 0, 0, 0);
          expect(expiryNormalized.getTime()).toBeGreaterThanOrEqual(todayNormalized.getTime());

          // Must have remaining quota
          expect(v.currentUsage).toBeLessThan(v.maxUsage);
        }
      }),
      { numRuns: 300 }
    );
  });

  it('should return at most 10 promotions', () => {
    fc.assert(
      fc.property(voucherListArb, (vouchers) => {
        const result = filterActivePromotions(vouchers, today);
        expect(result.length).toBeLessThanOrEqual(10);
      }),
      { numRuns: 300 }
    );
  });

  it('should return results sorted by expiryDate ascending', () => {
    fc.assert(
      fc.property(voucherListArb, (vouchers) => {
        const result = filterActivePromotions(vouchers, today);

        for (let i = 1; i < result.length; i++) {
          const prevDate = new Date(result[i - 1].expiryDate).getTime();
          const currDate = new Date(result[i].expiryDate).getTime();
          expect(currDate).toBeGreaterThanOrEqual(prevDate);
        }
      }),
      { numRuns: 300 }
    );
  });

  it('should return empty array when no vouchers match criteria', () => {
    fc.assert(
      fc.property(
        fc.array(inactiveVoucherArb, { minLength: 0, maxLength: 20 }),
        (vouchers) => {
          const result = filterActivePromotions(vouchers, today);
          expect(result).toHaveLength(0);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('should include all matching vouchers when total active count is <= 10', () => {
    fc.assert(
      fc.property(
        fc.array(activeVoucherArb, { minLength: 0, maxLength: 10 }),
        (activeVouchers) => {
          const result = filterActivePromotions(activeVouchers, today);
          // All of them should be included since count <= 10
          expect(result.length).toBe(activeVouchers.length);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('should cap at 10 when more than 10 vouchers are active', () => {
    fc.assert(
      fc.property(
        fc.array(activeVoucherArb, { minLength: 11, maxLength: 25 }),
        (activeVouchers) => {
          const result = filterActivePromotions(activeVouchers, today);
          expect(result.length).toBe(10);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not include inactive vouchers even if other criteria are met', () => {
    fc.assert(
      fc.property(
        fc.array(activeVoucherArb, { minLength: 1, maxLength: 5 }),
        fc.array(inactiveVoucherArb, { minLength: 1, maxLength: 10 }),
        (activeVouchers, inactiveVouchers) => {
          const mixed = [...activeVouchers, ...inactiveVouchers];
          const result = filterActivePromotions(mixed, today);

          // Result should only contain items from the active vouchers
          const resultIds = new Set(result.map((r) => r.id));
          const inactiveIds = new Set(inactiveVouchers.map((v) => v.id));

          for (const id of resultIds) {
            expect(inactiveIds.has(id)).toBe(false);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('should select the 10 with earliest expiryDate when more than 10 are active', () => {
    fc.assert(
      fc.property(
        fc.array(activeVoucherArb, { minLength: 11, maxLength: 25 }),
        (activeVouchers) => {
          const result = filterActivePromotions(activeVouchers, today);

          // All active vouchers sorted by expiry date
          const allSorted = [...activeVouchers].sort(
            (a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
          );
          const expectedFirst10 = allSorted.slice(0, 10);

          // The result should contain the same items as the first 10 from the sorted list
          expect(result.length).toBe(10);
          for (let i = 0; i < 10; i++) {
            expect(result[i].id).toBe(expectedFirst10[i].id);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Property 18: Review Reward Idempotence
 *
 * Each Member may only receive the reward ONCE regardless of subsequent clicks.
 * First click grants the reward, subsequent clicks do not.
 *
 * The pure function models the review click logic:
 * - Maintains a set of members who have already been rewarded
 * - On each click event, checks if member has already been rewarded
 * - Grants reward only on the first click for each member
 * - Subsequent clicks are recorded but no reward is granted
 *
 * Properties verified:
 * 1. Reward granted exactly once (on first click)
 * 2. Subsequent clicks after the first do NOT grant additional rewards
 * 3. Total reward count for any member is always 0 or 1
 *
 * **Validates: Requirements 11.4, 11.5**
 */

// ─── Review Click Interface ──────────────────────────────────────────────────

interface ReviewClickEvent {
  memberId: string;
  clickIndex: number; // Order of this click in the sequence
}

interface ReviewClickResult {
  memberId: string;
  clickIndex: number;
  rewardGranted: boolean;
}

// ─── Pure Review Reward Function ─────────────────────────────────────────────

/**
 * Pure function modeling review reward granting logic.
 * Processes a sequence of click events and determines which ones get rewarded.
 * Each member receives the reward at most once (on their first click).
 */
function processReviewClicks(clickEvents: ReviewClickEvent[]): ReviewClickResult[] {
  const rewardedMembers = new Set<string>();
  const results: ReviewClickResult[] = [];

  for (const event of clickEvents) {
    const alreadyRewarded = rewardedMembers.has(event.memberId);
    const rewardGranted = !alreadyRewarded;

    if (rewardGranted) {
      rewardedMembers.add(event.memberId);
    }

    results.push({
      memberId: event.memberId,
      clickIndex: event.clickIndex,
      rewardGranted,
    });
  }

  return results;
}

// ─── Arbitraries for Property 18 ────────────────────────────────────────────

/** Generates a member ID (UUID-like) */
const memberIdArb = fc.uuid();

/** Generates a sequence of click events for a single member (1-100 clicks) */
const singleMemberClicksArb = (memberId: string): fc.Arbitrary<ReviewClickEvent[]> =>
  fc.integer({ min: 1, max: 100 }).map((count) =>
    Array.from({ length: count }, (_, i) => ({
      memberId,
      clickIndex: i,
    }))
  );

/** Generates click events for multiple members (simulating mixed traffic) */
const multiMemberClicksArb: fc.Arbitrary<ReviewClickEvent[]> = fc
  .array(
    fc.record({
      memberId: memberIdArb,
      clickCount: fc.integer({ min: 1, max: 20 }),
    }),
    { minLength: 1, maxLength: 10 }
  )
  .map((members) => {
    const events: ReviewClickEvent[] = [];
    let idx = 0;
    for (const { memberId, clickCount } of members) {
      for (let i = 0; i < clickCount; i++) {
        events.push({ memberId, clickIndex: idx++ });
      }
    }
    return events;
  })
  .chain((events) => fc.shuffledSubarray(events, { minLength: events.length, maxLength: events.length }));

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 18: Review Reward Idempotence', () => {
  it('should grant reward exactly once for a single member regardless of click count', () => {
    fc.assert(
      fc.property(memberIdArb, (memberId) => {
        return fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 100 }),
            (clickCount) => {
              const events: ReviewClickEvent[] = Array.from({ length: clickCount }, (_, i) => ({
                memberId,
                clickIndex: i,
              }));

              const results = processReviewClicks(events);

              // Count how many times reward was granted
              const rewardCount = results.filter((r) => r.rewardGranted).length;

              // Reward granted exactly once
              expect(rewardCount).toBe(1);
            }
          ),
          { numRuns: 50 }
        );
      }),
      { numRuns: 100 }
    );
  });

  it('should grant reward only on the first click for each member', () => {
    fc.assert(
      fc.property(memberIdArb, fc.integer({ min: 2, max: 100 }), (memberId, clickCount) => {
        const events: ReviewClickEvent[] = Array.from({ length: clickCount }, (_, i) => ({
          memberId,
          clickIndex: i,
        }));

        const results = processReviewClicks(events);

        // First click should grant reward
        expect(results[0].rewardGranted).toBe(true);

        // All subsequent clicks should NOT grant reward
        for (let i = 1; i < results.length; i++) {
          expect(results[i].rewardGranted).toBe(false);
        }
      }),
      { numRuns: 300 }
    );
  });

  it('should never grant more than 1 reward per member in mixed traffic', () => {
    fc.assert(
      fc.property(multiMemberClicksArb, (events) => {
        const results = processReviewClicks(events);

        // Group results by memberId
        const rewardsByMember = new Map<string, number>();
        for (const result of results) {
          if (result.rewardGranted) {
            const current = rewardsByMember.get(result.memberId) ?? 0;
            rewardsByMember.set(result.memberId, current + 1);
          }
        }

        // Each member should have received at most 1 reward
        for (const [, count] of rewardsByMember) {
          expect(count).toBe(1);
        }
      }),
      { numRuns: 300 }
    );
  });

  it('should have total reward count of 0 or 1 for any member', () => {
    fc.assert(
      fc.property(multiMemberClicksArb, (events) => {
        const results = processReviewClicks(events);

        // Get all unique member IDs from events
        const memberIds = new Set(events.map((e) => e.memberId));

        for (const memberId of memberIds) {
          const memberResults = results.filter((r) => r.memberId === memberId);
          const rewardCount = memberResults.filter((r) => r.rewardGranted).length;

          // Total reward count for any member is always 0 or 1
          expect(rewardCount).toBeGreaterThanOrEqual(0);
          expect(rewardCount).toBeLessThanOrEqual(1);
        }
      }),
      { numRuns: 300 }
    );
  });

  it('should ensure every member who clicks at least once gets exactly one reward', () => {
    fc.assert(
      fc.property(multiMemberClicksArb, (events) => {
        const results = processReviewClicks(events);

        // Get all unique member IDs
        const memberIds = new Set(events.map((e) => e.memberId));

        for (const memberId of memberIds) {
          const memberResults = results.filter((r) => r.memberId === memberId);
          const rewardCount = memberResults.filter((r) => r.rewardGranted).length;

          // Every member who clicked at least once should get exactly 1 reward
          expect(memberResults.length).toBeGreaterThanOrEqual(1);
          expect(rewardCount).toBe(1);
        }
      }),
      { numRuns: 300 }
    );
  });
});


/**
 * Property 19: Repeat Customer Identification
 *
 * THE Platform SHALL calculate Repeat Customer as a Member who has made more than one
 * validated Order within the last 30 days.
 *
 * A "validated order" is one where:
 * - status = 'paid'
 * - validatedAt is within the last 30 days (from "now")
 *
 * A member is a repeat customer iff count of such orders > 1.
 *
 * Properties:
 * 1. Member with > 1 paid orders validated in last 30 days → IS repeat customer
 * 2. Member with exactly 1 paid order validated in last 30 days → NOT repeat customer
 * 3. Member with 0 paid orders → NOT repeat customer
 * 4. Member with multiple paid orders ALL validated outside 30 days → NOT repeat customer
 *
 * **Validates: Requirements 12.3**
 */

// ─── Order Interface for Repeat Customer ─────────────────────────────────────

type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'expired';

interface MemberOrder {
  id: string;
  status: OrderStatus;
  validatedAt: Date | null;
}

// ─── Pure Function: Determine Repeat Customer ────────────────────────────────

/**
 * Determines whether a member is a "repeat customer" based on their orders.
 * A repeat customer has more than one paid order with validatedAt within the last 30 days.
 */
function isRepeatCustomer(orders: MemberOrder[], now: Date): boolean {
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const validatedPaidOrdersInWindow = orders.filter((order) => {
    return (
      order.status === 'paid' &&
      order.validatedAt !== null &&
      order.validatedAt.getTime() >= thirtyDaysAgo.getTime()
    );
  });

  return validatedPaidOrdersInWindow.length > 1;
}

// ─── Arbitraries for Repeat Customer ─────────────────────────────────────────

const orderStatusArb: fc.Arbitrary<OrderStatus> = fc.constantFrom('pending', 'paid', 'cancelled', 'expired');

/** Generates a date within the last 30 days from a reference "now" */
const recentDateArb = (now: Date): fc.Arbitrary<Date> =>
  fc.integer({ min: 0, max: 29 * 24 * 60 * 60 * 1000 }).map(
    (msAgo) => new Date(now.getTime() - msAgo)
  );

/** Generates a date older than 30 days from a reference "now" */
const oldDateArb = (now: Date): fc.Arbitrary<Date> =>
  fc.integer({ min: 30 * 24 * 60 * 60 * 1000 + 1, max: 365 * 24 * 60 * 60 * 1000 }).map(
    (msAgo) => new Date(now.getTime() - msAgo)
  );

/** Generates a validatedAt date (either recent or old, or null for unpaid orders) */
const validatedAtArb = (now: Date): fc.Arbitrary<Date | null> =>
  fc.oneof(
    fc.constant(null),
    recentDateArb(now),
    oldDateArb(now)
  );

/** Generates a generic member order with arbitrary status and validatedAt */
const memberOrderArb = (now: Date): fc.Arbitrary<MemberOrder> =>
  fc.record({
    id: fc.uuid(),
    status: orderStatusArb,
    validatedAt: validatedAtArb(now),
  });

/** Generates a paid order with validatedAt within the last 30 days */
const recentPaidOrderArb = (now: Date): fc.Arbitrary<MemberOrder> =>
  fc.record({
    id: fc.uuid(),
    status: fc.constant('paid' as OrderStatus),
    validatedAt: recentDateArb(now).map((d) => d as Date | null),
  });

/** Generates a paid order with validatedAt OLDER than 30 days */
const oldPaidOrderArb = (now: Date): fc.Arbitrary<MemberOrder> =>
  fc.record({
    id: fc.uuid(),
    status: fc.constant('paid' as OrderStatus),
    validatedAt: oldDateArb(now).map((d) => d as Date | null),
  });

/** Generates an order that is NOT paid (pending, cancelled, or expired) */
const nonPaidOrderArb = (now: Date): fc.Arbitrary<MemberOrder> =>
  fc.record({
    id: fc.uuid(),
    status: fc.constantFrom('pending' as OrderStatus, 'cancelled' as OrderStatus, 'expired' as OrderStatus),
    validatedAt: validatedAtArb(now),
  });

// ─── Property Tests: Repeat Customer Identification ──────────────────────────

describe('Property 19: Repeat Customer Identification', () => {
  const now = new Date();

  it('member with > 1 paid orders validated in last 30 days IS a repeat customer', () => {
    fc.assert(
      fc.property(
        fc.array(recentPaidOrderArb(now), { minLength: 2, maxLength: 10 }),
        fc.array(memberOrderArb(now), { minLength: 0, maxLength: 10 }),
        (recentPaidOrders, otherOrders) => {
          const allOrders = [...recentPaidOrders, ...otherOrders];
          expect(isRepeatCustomer(allOrders, now)).toBe(true);
        }
      ),
      { numRuns: 300 }
    );
  });

  it('member with exactly 1 paid order validated in last 30 days is NOT a repeat customer', () => {
    fc.assert(
      fc.property(
        recentPaidOrderArb(now),
        fc.array(nonPaidOrderArb(now), { minLength: 0, maxLength: 10 }),
        fc.array(oldPaidOrderArb(now), { minLength: 0, maxLength: 5 }),
        (singleRecentPaid, nonPaidOrders, oldPaidOrders) => {
          const allOrders = [singleRecentPaid, ...nonPaidOrders, ...oldPaidOrders];
          expect(isRepeatCustomer(allOrders, now)).toBe(false);
        }
      ),
      { numRuns: 300 }
    );
  });

  it('member with 0 paid orders is NOT a repeat customer', () => {
    fc.assert(
      fc.property(
        fc.array(nonPaidOrderArb(now), { minLength: 0, maxLength: 15 }),
        (nonPaidOrders) => {
          expect(isRepeatCustomer(nonPaidOrders, now)).toBe(false);
        }
      ),
      { numRuns: 300 }
    );
  });

  it('member with multiple paid orders ALL validated outside 30 days is NOT a repeat customer', () => {
    fc.assert(
      fc.property(
        fc.array(oldPaidOrderArb(now), { minLength: 2, maxLength: 10 }),
        fc.array(nonPaidOrderArb(now), { minLength: 0, maxLength: 5 }),
        (oldPaidOrders, nonPaidOrders) => {
          const allOrders = [...oldPaidOrders, ...nonPaidOrders];
          expect(isRepeatCustomer(allOrders, now)).toBe(false);
        }
      ),
      { numRuns: 300 }
    );
  });

  it('repeat customer iff count of paid orders with validatedAt in last 30 days > 1 (general)', () => {
    fc.assert(
      fc.property(
        fc.array(memberOrderArb(now), { minLength: 0, maxLength: 20 }),
        (orders) => {
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

          const validatedPaidCount = orders.filter(
            (o) =>
              o.status === 'paid' &&
              o.validatedAt !== null &&
              o.validatedAt.getTime() >= thirtyDaysAgo.getTime()
          ).length;

          const expectedRepeat = validatedPaidCount > 1;
          expect(isRepeatCustomer(orders, now)).toBe(expectedRepeat);
        }
      ),
      { numRuns: 500 }
    );
  });

  it('paid orders with null validatedAt do NOT count toward repeat customer', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            status: fc.constant('paid' as OrderStatus),
            validatedAt: fc.constant(null),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        (paidWithNullValidated) => {
          // Paid but never validated (no validatedAt) → not repeat
          expect(isRepeatCustomer(paidWithNullValidated, now)).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });
});
