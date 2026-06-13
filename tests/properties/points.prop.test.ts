import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 10: Point Balance Consistency
 *
 * For any valid sequence of earn/redeem operations:
 * - balance = sum(earned) - sum(redeemed)
 * - balance is NEVER negative at any point in the sequence
 * - a redemption attempt that would make balance negative is rejected
 *
 * Uses a pure balance tracking model (no DB needed) to verify
 * the invariants of the points system.
 *
 * **Validates: Requirements 8.3, 8.4**
 */

// --- Pure model mimicking the points service logic ---

type PointOperation =
  | { type: 'earn'; amount: number }
  | { type: 'redeem'; amount: number };

interface PointState {
  balance: number;
  totalEarned: number;
  totalRedeemed: number;
  history: Array<{ type: 'earned' | 'redeemed'; amount: number; resultingBalance: number }>;
}

/**
 * Applies a sequence of point operations to an initial state,
 * mimicking the real points service logic:
 * - earn: always succeeds (amount > 0), adds to balance
 * - redeem: rejected if balance < amount, otherwise deducts
 */
function applyOperations(operations: PointOperation[]): PointState {
  const state: PointState = {
    balance: 0,
    totalEarned: 0,
    totalRedeemed: 0,
    history: [],
  };

  for (const op of operations) {
    if (op.type === 'earn') {
      state.balance += op.amount;
      state.totalEarned += op.amount;
      state.history.push({
        type: 'earned',
        amount: op.amount,
        resultingBalance: state.balance,
      });
    } else if (op.type === 'redeem') {
      // Reject if insufficient balance (mirrors points.service.ts logic)
      if (state.balance < op.amount) {
        // Redemption rejected — state unchanged
        continue;
      }
      state.balance -= op.amount;
      state.totalRedeemed += op.amount;
      state.history.push({
        type: 'redeemed',
        amount: op.amount,
        resultingBalance: state.balance,
      });
    }
  }

  return state;
}

// --- Generators ---

// Single earn operation: positive amount
const earnOpArb: fc.Arbitrary<PointOperation> = fc.integer({ min: 1, max: 10_000 }).map(
  (amount) => ({ type: 'earn' as const, amount })
);

// Single redeem operation: positive amount
const redeemOpArb: fc.Arbitrary<PointOperation> = fc.integer({ min: 1, max: 10_000 }).map(
  (amount) => ({ type: 'redeem' as const, amount })
);

// Mixed operation (earn or redeem)
const operationArb: fc.Arbitrary<PointOperation> = fc.oneof(earnOpArb, redeemOpArb);

// Sequence of operations (1 to 50 operations)
const operationSequenceArb: fc.Arbitrary<PointOperation[]> = fc.array(operationArb, {
  minLength: 1,
  maxLength: 50,
});

// Sequence of only earn operations
const earnOnlySequenceArb: fc.Arbitrary<PointOperation[]> = fc.array(earnOpArb, {
  minLength: 1,
  maxLength: 50,
});

// Sequence of only redeem operations
const redeemOnlySequenceArb: fc.Arbitrary<PointOperation[]> = fc.array(redeemOpArb, {
  minLength: 1,
  maxLength: 50,
});

describe('Property 10: Point Balance Consistency', () => {
  it('balance equals sum(earned) - sum(redeemed) after any valid sequence', () => {
    fc.assert(
      fc.property(operationSequenceArb, (operations) => {
        const state = applyOperations(operations);

        // Core invariant: balance = totalEarned - totalRedeemed
        expect(state.balance).toBe(state.totalEarned - state.totalRedeemed);
      }),
      { numRuns: 500 }
    );
  });

  it('balance is NEVER negative at any point in the sequence', () => {
    fc.assert(
      fc.property(operationSequenceArb, (operations) => {
        // Replay step-by-step and check balance at every point
        let balance = 0;

        for (const op of operations) {
          if (op.type === 'earn') {
            balance += op.amount;
          } else if (op.type === 'redeem') {
            if (balance >= op.amount) {
              balance -= op.amount;
            }
            // If rejected, balance stays the same
          }

          // Balance must never be negative at any step
          expect(balance).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 500 }
    );
  });

  it('a redemption that would make balance negative is rejected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5_000 }),  // initial balance (via earns)
        fc.integer({ min: 1, max: 10_000 }), // redeem attempt
        (initialEarning, redeemAmount) => {
          // Start by earning some points
          const operations: PointOperation[] = [
            { type: 'earn', amount: initialEarning },
            { type: 'redeem', amount: redeemAmount },
          ];

          const state = applyOperations(operations);

          if (redeemAmount > initialEarning) {
            // Redemption should have been rejected
            expect(state.totalRedeemed).toBe(0);
            expect(state.balance).toBe(initialEarning);
          } else {
            // Redemption should have succeeded
            expect(state.totalRedeemed).toBe(redeemAmount);
            expect(state.balance).toBe(initialEarning - redeemAmount);
          }

          // Balance never negative regardless
          expect(state.balance).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 500 }
    );
  });

  it('all-earn sequences result in balance equal to total earned', () => {
    fc.assert(
      fc.property(earnOnlySequenceArb, (operations) => {
        const state = applyOperations(operations);

        const totalEarned = operations.reduce((sum, op) => sum + op.amount, 0);
        expect(state.balance).toBe(totalEarned);
        expect(state.totalRedeemed).toBe(0);
        expect(state.history.length).toBe(operations.length);
      }),
      { numRuns: 200 }
    );
  });

  it('all-redeem sequences from zero balance reject everything', () => {
    fc.assert(
      fc.property(redeemOnlySequenceArb, (operations) => {
        const state = applyOperations(operations);

        // Starting balance is 0, so all redemptions should be rejected
        expect(state.balance).toBe(0);
        expect(state.totalRedeemed).toBe(0);
        expect(state.totalEarned).toBe(0);
        expect(state.history.length).toBe(0);
      }),
      { numRuns: 200 }
    );
  });

  it('interleaved operations maintain consistency at every step', () => {
    fc.assert(
      fc.property(operationSequenceArb, (operations) => {
        const state = applyOperations(operations);

        // Verify history consistency: each resulting_balance matches incremental computation
        let runningBalance = 0;
        for (const entry of state.history) {
          if (entry.type === 'earned') {
            runningBalance += entry.amount;
          } else {
            runningBalance -= entry.amount;
          }
          expect(entry.resultingBalance).toBe(runningBalance);
        }

        // Final balance matches last history entry (if any)
        if (state.history.length > 0) {
          expect(state.balance).toBe(state.history[state.history.length - 1].resultingBalance);
        } else {
          expect(state.balance).toBe(0);
        }
      }),
      { numRuns: 300 }
    );
  });
});


/**
 * Property 12: Point Expiry Exclusion
 *
 * For any member with a configured point expiry period (≥ 30 days),
 * the redeemable balance SHALL exclude points from transactions whose
 * timestamp is older than (current date - expiry period days).
 * Non-expired points SHALL be fully included in the redeemable balance.
 *
 * Uses a pure function model that replicates getRedeemableBalance logic:
 * - If no expiry configured: redeemable = full balance
 * - If expiryDays configured (min 30): redeemable = max(0, balance - pendingExpiryAmount)
 * - pendingExpiryAmount = sum of earned transactions older than expiryDays
 *   that haven't been formally expired yet
 *
 * **Validates: Requirements 8.9**
 */

// --- Pure model for point expiry exclusion ---

interface EarnedTransaction {
  id: string;
  amount: number;
  createdAt: Date;
}

interface ExpiredTransaction {
  originalTransactionId: string; // references which earned tx was expired
  amount: number;
}

interface ExpiryConfig {
  expiryDays: number | null; // null means no expiry configured
}

/**
 * Pure function model of getRedeemableBalance.
 * Calculates redeemable balance by excluding pending expiry amounts.
 */
function calculateRedeemableBalance(
  currentBalance: number,
  earnedTransactions: EarnedTransaction[],
  expiredTransactions: ExpiredTransaction[],
  config: ExpiryConfig,
  now: Date
): number {
  // If no expiry settings, the full balance is redeemable
  if (config.expiryDays === null) {
    return currentBalance;
  }

  // Enforce minimum 30 days
  const expiryDays = Math.max(config.expiryDays, 30);

  // Calculate the expiry threshold date
  const expiryDate = new Date(now.getTime() - expiryDays * 24 * 60 * 60 * 1000);

  // Find earned transactions older than expiryDate
  const earnedPastExpiry = earnedTransactions.filter(
    (t) => t.createdAt.getTime() < expiryDate.getTime()
  );

  // Create set of already-expired transaction IDs
  const alreadyExpiredSet = new Set(
    expiredTransactions.map((e) => e.originalTransactionId)
  );

  // Pending expiry = sum of earned past expiry NOT yet formally expired
  const pendingExpiryAmount = earnedPastExpiry
    .filter((t) => !alreadyExpiredSet.has(t.id))
    .reduce((sum, t) => sum + t.amount, 0);

  // Redeemable = max(0, balance - pendingExpiryAmount)
  return Math.max(0, currentBalance - pendingExpiryAmount);
}

// --- Generators for Property 12 ---

/** Generate a timestamp within a range relative to 'now' */
const timestampArb = (now: Date, maxDaysAgo: number): fc.Arbitrary<Date> =>
  fc.integer({ min: 0, max: maxDaysAgo * 24 * 60 * 60 * 1000 }).map(
    (msAgo) => new Date(now.getTime() - msAgo)
  );

/** Generate an earned transaction with a timestamp */
const earnedTransactionArb = (now: Date, maxDaysAgo: number): fc.Arbitrary<EarnedTransaction> =>
  fc.record({
    id: fc.uuid(),
    amount: fc.integer({ min: 1, max: 5000 }),
    createdAt: timestampArb(now, maxDaysAgo),
  });

/** Generate expiry days (minimum 30, up to 365) */
const expiryDaysArb: fc.Arbitrary<number> = fc.integer({ min: 30, max: 365 });

describe('Property 12: Point Expiry Exclusion', () => {
  const NOW = new Date('2025-06-15T12:00:00Z');

  it('redeemable balance excludes points from transactions older than expiryDays', () => {
    fc.assert(
      fc.property(
        fc.array(earnedTransactionArb(NOW, 400), { minLength: 1, maxLength: 30 }),
        expiryDaysArb,
        (earnedTransactions, expiryDays) => {
          // Balance = sum of all earned (assume no redemptions for simplicity)
          const totalBalance = earnedTransactions.reduce((sum, t) => sum + t.amount, 0);

          const redeemable = calculateRedeemableBalance(
            totalBalance,
            earnedTransactions,
            [], // no already-expired transactions
            { expiryDays },
            NOW
          );

          // Calculate expected excluded amount
          const expiryDate = new Date(NOW.getTime() - Math.max(expiryDays, 30) * 24 * 60 * 60 * 1000);
          const expiredAmount = earnedTransactions
            .filter((t) => t.createdAt.getTime() < expiryDate.getTime())
            .reduce((sum, t) => sum + t.amount, 0);

          const expected = Math.max(0, totalBalance - expiredAmount);

          expect(redeemable).toBe(expected);
        }
      ),
      { numRuns: 500 }
    );
  });

  it('redeemable balance is never negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50000 }), // currentBalance
        fc.array(earnedTransactionArb(NOW, 400), { minLength: 0, maxLength: 30 }),
        expiryDaysArb,
        (currentBalance, earnedTransactions, expiryDays) => {
          const redeemable = calculateRedeemableBalance(
            currentBalance,
            earnedTransactions,
            [],
            { expiryDays },
            NOW
          );

          expect(redeemable).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 500 }
    );
  });

  it('when no expiry configured, redeemable equals full balance', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100000 }), // currentBalance
        fc.array(earnedTransactionArb(NOW, 400), { minLength: 0, maxLength: 30 }),
        (currentBalance, earnedTransactions) => {
          const redeemable = calculateRedeemableBalance(
            currentBalance,
            earnedTransactions,
            [],
            { expiryDays: null }, // no expiry configured
            NOW
          );

          expect(redeemable).toBe(currentBalance);
        }
      ),
      { numRuns: 500 }
    );
  });

  it('recent points (within expiry window) are always included in redeemable', () => {
    fc.assert(
      fc.property(
        expiryDaysArb,
        fc.array(
          // Generate only RECENT transactions (within expiry window)
          fc.record({
            id: fc.uuid(),
            amount: fc.integer({ min: 1, max: 5000 }),
            // Timestamp within last (expiryDays - 1) days — guaranteed not expired
            createdAt: fc.integer({ min: 0, max: 29 * 24 * 60 * 60 * 1000 }).map(
              (msAgo) => new Date(NOW.getTime() - msAgo)
            ),
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (expiryDays, recentTransactions) => {
          // All transactions are within the minimum expiry window (30 days)
          // so none should be excluded
          const totalBalance = recentTransactions.reduce((sum, t) => sum + t.amount, 0);

          const redeemable = calculateRedeemableBalance(
            totalBalance,
            recentTransactions,
            [],
            { expiryDays },
            NOW
          );

          // Since all transactions are recent (within 29 days, min expiry is 30),
          // the full balance should be redeemable
          expect(redeemable).toBe(totalBalance);
        }
      ),
      { numRuns: 500 }
    );
  });

  it('already-expired transactions are not double-counted in pending expiry', () => {
    fc.assert(
      fc.property(
        fc.array(earnedTransactionArb(NOW, 400), { minLength: 2, maxLength: 20 }),
        expiryDaysArb,
        (earnedTransactions, expiryDays) => {
          const totalBalance = earnedTransactions.reduce((sum, t) => sum + t.amount, 0);
          const effectiveExpiryDays = Math.max(expiryDays, 30);
          const expiryDate = new Date(NOW.getTime() - effectiveExpiryDays * 24 * 60 * 60 * 1000);

          // Find transactions that are past expiry
          const pastExpiry = earnedTransactions.filter(
            (t) => t.createdAt.getTime() < expiryDate.getTime()
          );

          if (pastExpiry.length === 0) return; // skip if none expired

          // Mark some as already formally expired
          const alreadyExpired: ExpiredTransaction[] = pastExpiry
            .slice(0, Math.ceil(pastExpiry.length / 2))
            .map((t) => ({ originalTransactionId: t.id, amount: t.amount }));

          const redeemableWithSomeExpired = calculateRedeemableBalance(
            totalBalance,
            earnedTransactions,
            alreadyExpired,
            { expiryDays },
            NOW
          );

          const redeemableWithNoneExpired = calculateRedeemableBalance(
            totalBalance,
            earnedTransactions,
            [],
            { expiryDays },
            NOW
          );

          // With some already expired, pending expiry amount is less,
          // so redeemable should be >= the case with no formal expiry
          expect(redeemableWithSomeExpired).toBeGreaterThanOrEqual(redeemableWithNoneExpired);
        }
      ),
      { numRuns: 300 }
    );
  });

  it('expiryDays below 30 is treated as 30 (minimum enforcement)', () => {
    fc.assert(
      fc.property(
        fc.array(earnedTransactionArb(NOW, 400), { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 29 }), // below minimum
        (earnedTransactions, belowMinDays) => {
          const totalBalance = earnedTransactions.reduce((sum, t) => sum + t.amount, 0);

          const redeemableWithBelowMin = calculateRedeemableBalance(
            totalBalance,
            earnedTransactions,
            [],
            { expiryDays: belowMinDays },
            NOW
          );

          const redeemableWith30Days = calculateRedeemableBalance(
            totalBalance,
            earnedTransactions,
            [],
            { expiryDays: 30 },
            NOW
          );

          // Both should produce the same result since below-30 is clamped to 30
          expect(redeemableWithBelowMin).toBe(redeemableWith30Days);
        }
      ),
      { numRuns: 300 }
    );
  });
});


/**
 * Property 11: Redemption Guard
 *
 * For any combination of member balance, reward requiredPoints,
 * reward isActive status, and reward stockQuantity:
 * - Redemption is accepted ONLY when ALL three conditions pass:
 *   balance >= requiredPoints AND isActive AND stockQuantity > 0
 * - If any condition fails, redemption is rejected with the correct reason
 * - The check order mirrors the service: inactive → out of stock → insufficient balance
 *
 * **Validates: Requirements 8.5, 8.8**
 */

// --- Pure model of the redemption guard logic (mirrors reward.service.ts) ---

type RedemptionResult =
  | { success: true }
  | { success: false; reason: string };

interface RewardState {
  isActive: boolean;
  stockQuantity: number;
  requiredPoints: number;
}

interface MemberState {
  pointBalance: number;
}

/**
 * Pure function modeling the redemption guard from reward.service.ts.
 * Checks are applied in the same order as the service:
 * 1. isActive check
 * 2. stockQuantity check
 * 3. pointBalance check
 */
function checkRedemptionGuard(member: MemberState, reward: RewardState): RedemptionResult {
  if (!reward.isActive) {
    return { success: false, reason: 'Reward sedang tidak tersedia' };
  }

  if (reward.stockQuantity <= 0) {
    return { success: false, reason: 'Stok reward sudah habis' };
  }

  if (member.pointBalance < reward.requiredPoints) {
    return {
      success: false,
      reason: `Poin tidak mencukupi. Saldo: ${member.pointBalance}, Dibutuhkan: ${reward.requiredPoints}`,
    };
  }

  return { success: true };
}

// --- Generators ---

const rewardStateArb: fc.Arbitrary<RewardState> = fc.record({
  isActive: fc.boolean(),
  stockQuantity: fc.integer({ min: -5, max: 100 }), // Include negative/zero to test edge cases
  requiredPoints: fc.integer({ min: 1, max: 10_000 }),
});

const memberStateArb: fc.Arbitrary<MemberState> = fc.record({
  pointBalance: fc.integer({ min: 0, max: 20_000 }),
});

// Generator that always produces valid (all-pass) combinations
const validRedemptionArb: fc.Arbitrary<{ member: MemberState; reward: RewardState }> = fc
  .integer({ min: 1, max: 10_000 })
  .chain((requiredPoints) =>
    fc.record({
      member: fc.record({
        pointBalance: fc.integer({ min: requiredPoints, max: requiredPoints + 10_000 }),
      }),
      reward: fc.record({
        isActive: fc.constant(true),
        stockQuantity: fc.integer({ min: 1, max: 100 }),
        requiredPoints: fc.constant(requiredPoints),
      }),
    })
  );

describe('Property 11: Redemption Guard', () => {
  it('accepts redemption ONLY when all three conditions pass (balance >= required AND isActive AND stock > 0)', () => {
    fc.assert(
      fc.property(memberStateArb, rewardStateArb, (member, reward) => {
        const result = checkRedemptionGuard(member, reward);

        const allConditionsPass =
          reward.isActive &&
          reward.stockQuantity > 0 &&
          member.pointBalance >= reward.requiredPoints;

        if (allConditionsPass) {
          expect(result.success).toBe(true);
        } else {
          expect(result.success).toBe(false);
        }
      }),
      { numRuns: 1000 }
    );
  });

  it('rejects with "Reward sedang tidak tersedia" when reward is inactive', () => {
    fc.assert(
      fc.property(
        memberStateArb,
        rewardStateArb.filter((r) => !r.isActive),
        (member, reward) => {
          const result = checkRedemptionGuard(member, reward);

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.reason).toBe('Reward sedang tidak tersedia');
          }
        }
      ),
      { numRuns: 500 }
    );
  });

  it('rejects with "Stok reward sudah habis" when stock <= 0 (and reward is active)', () => {
    fc.assert(
      fc.property(
        memberStateArb,
        rewardStateArb.filter((r) => r.isActive && r.stockQuantity <= 0),
        (member, reward) => {
          const result = checkRedemptionGuard(member, reward);

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.reason).toBe('Stok reward sudah habis');
          }
        }
      ),
      { numRuns: 500 }
    );
  });

  it('rejects with insufficient balance message when balance < required (active + in stock)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }).chain((requiredPoints) =>
          fc.record({
            member: fc.record({
              pointBalance: fc.integer({ min: 0, max: requiredPoints - 1 }),
            }),
            reward: fc.record({
              isActive: fc.constant(true),
              stockQuantity: fc.integer({ min: 1, max: 100 }),
              requiredPoints: fc.constant(requiredPoints),
            }),
          })
        ),
        ({ member, reward }) => {
          const result = checkRedemptionGuard(member, reward);

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.reason).toContain('Poin tidak mencukupi');
            expect(result.reason).toContain(`Saldo: ${member.pointBalance}`);
            expect(result.reason).toContain(`Dibutuhkan: ${reward.requiredPoints}`);
          }
        }
      ),
      { numRuns: 500 }
    );
  });

  it('succeeds for all valid combinations (active + stock > 0 + balance >= required)', () => {
    fc.assert(
      fc.property(validRedemptionArb, ({ member, reward }) => {
        const result = checkRedemptionGuard(member, reward);
        expect(result.success).toBe(true);
      }),
      { numRuns: 500 }
    );
  });

  it('at least one condition failing always means rejection', () => {
    fc.assert(
      fc.property(
        memberStateArb,
        rewardStateArb,
        (member, reward) => {
          const result = checkRedemptionGuard(member, reward);

          const isInactive = !reward.isActive;
          const noStock = reward.stockQuantity <= 0;
          const insufficientBalance = member.pointBalance < reward.requiredPoints;
          const atLeastOneFails = isInactive || noStock || insufficientBalance;

          if (atLeastOneFails) {
            expect(result.success).toBe(false);
          }
        }
      ),
      { numRuns: 1000 }
    );
  });
});
