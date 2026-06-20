import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { calculateRewardDiscount } from './reward-voucher.service';

/**
 * Feature: reward-redemption, Property 5: Discount calculation correctness
 * Validates: Requirements 5.4, 5.5, 5.6
 *
 * For any item price P >= 0 and reward voucher with discount configuration:
 * - If discount type is "free": final price = 0
 * - If discount type is "discount" with sub-type "fixed" and value V: final price = max(0, P - V)
 * - If discount type is "discount" with sub-type "percentage" and value V: final price = max(0, P - floor(P * V / 100))
 */
describe('Property 5: Discount calculation correctness', () => {
  it('free discount type always results in finalPrice = 0', () => {
    fc.assert(
      fc.property(fc.nat(), (itemPrice) => {
        const result = calculateRewardDiscount(itemPrice, 'free', null, null);
        expect(result.finalPrice).toBe(0);
        expect(result.discountAmount).toBe(itemPrice);
      }),
      { numRuns: 100 }
    );
  });

  it('fixed discount: finalPrice = max(0, P - V)', () => {
    fc.assert(
      fc.property(fc.nat(), fc.nat(), (itemPrice, discountValue) => {
        const result = calculateRewardDiscount(
          itemPrice,
          'discount',
          'fixed',
          discountValue
        );
        const expectedFinalPrice = Math.max(0, itemPrice - discountValue);
        expect(result.finalPrice).toBe(expectedFinalPrice);
      }),
      { numRuns: 100 }
    );
  });

  it('percentage discount: finalPrice = max(0, P - floor(P * V / 100))', () => {
    fc.assert(
      fc.property(fc.nat(), fc.nat(), (itemPrice, discountValue) => {
        const result = calculateRewardDiscount(
          itemPrice,
          'discount',
          'percentage',
          discountValue
        );
        const expectedFinalPrice = Math.max(
          0,
          itemPrice - Math.floor((itemPrice * discountValue) / 100)
        );
        expect(result.finalPrice).toBe(expectedFinalPrice);
      }),
      { numRuns: 100 }
    );
  });

  it('finalPrice is always non-negative', () => {
    const discountConfigArb = fc.oneof(
      fc.record({
        discountType: fc.constant('free' as const),
        discountSubType: fc.constant(null),
        discountValue: fc.constant(null),
      }),
      fc.record({
        discountType: fc.constant('discount' as const),
        discountSubType: fc.constant('fixed' as const),
        discountValue: fc.nat(),
      }),
      fc.record({
        discountType: fc.constant('discount' as const),
        discountSubType: fc.constant('percentage' as const),
        discountValue: fc.nat(),
      })
    );

    fc.assert(
      fc.property(fc.nat(), discountConfigArb, (itemPrice, config) => {
        const result = calculateRewardDiscount(
          itemPrice,
          config.discountType,
          config.discountSubType,
          config.discountValue
        );
        expect(result.finalPrice).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 }
    );
  });

  it('conservation: discountAmount + finalPrice = itemPrice', () => {
    const discountConfigArb = fc.oneof(
      fc.record({
        discountType: fc.constant('free' as const),
        discountSubType: fc.constant(null),
        discountValue: fc.constant(null),
      }),
      fc.record({
        discountType: fc.constant('discount' as const),
        discountSubType: fc.constant('fixed' as const),
        discountValue: fc.nat(),
      }),
      fc.record({
        discountType: fc.constant('discount' as const),
        discountSubType: fc.constant('percentage' as const),
        discountValue: fc.nat(),
      })
    );

    fc.assert(
      fc.property(fc.nat(), discountConfigArb, (itemPrice, config) => {
        const result = calculateRewardDiscount(
          itemPrice,
          config.discountType,
          config.discountSubType,
          config.discountValue
        );
        expect(result.discountAmount + result.finalPrice).toBe(itemPrice);
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: reward-redemption, Property 8: Voucher validation rules
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 *
 * For any reward voucher code submitted for validation, the voucher SHALL be accepted only if ALL of the following hold:
 * (1) the voucher exists and belongs to the same tenant
 * (2) isUsed is false
 * (3) current date <= expiry date
 * Violation of any condition SHALL produce a specific error message.
 */

// Mock Prisma for validateRewardVoucher and redeemRewardWithVoucher tests
vi.mock('../config/database', () => {
  return {
    default: {
      rewardVoucher: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      member: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      reward: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      pointTransaction: {
        create: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

import prisma from '../config/database';
import { validateRewardVoucher } from './reward-voucher.service';
import { redeemRewardWithVoucher } from './reward.service';

describe('Property 8: Voucher validation rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Arbitrary generators for test data
  const tenantIdArb = fc.string({ minLength: 1, maxLength: 36 });
  const voucherCodeArb = fc.string({ minLength: 1, maxLength: 20 });

  const validVoucherArb = (tenantId: string) =>
    fc.record({
      id: fc.uuid(),
      tenantId: fc.constant(tenantId),
      memberId: fc.uuid(),
      rewardId: fc.uuid(),
      menuItemId: fc.uuid(),
      code: voucherCodeArb,
      discountType: fc.constantFrom('free', 'discount'),
      discountSubType: fc.constantFrom('fixed', 'percentage', null),
      discountValue: fc.option(fc.nat({ max: 100 }), { nil: null }),
      expiryDate: fc.date({
        min: new Date(),
        max: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }),
      isUsed: fc.constant(false),
      usedAt: fc.constant(null),
      orderId: fc.constant(null),
      createdAt: fc.date({ max: new Date() }),
      menuItem: fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 1 }),
      }),
    });

  it('validation passes when ALL conditions hold: voucher exists, same tenant, not used, not expired', async () => {
    await fc.assert(
      fc.asyncProperty(tenantIdArb, fc.uuid(), async (tenantId, voucherId) => {
        // Create a valid voucher: exists, same tenant, not used, not expired
        const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const mockVoucher = {
          id: voucherId,
          tenantId: tenantId,
          memberId: 'member-1',
          rewardId: 'reward-1',
          menuItemId: 'menu-1',
          code: 'RW-ABC123',
          discountType: 'free',
          discountSubType: null,
          discountValue: null,
          expiryDate: futureDate,
          isUsed: false,
          usedAt: null,
          orderId: null,
          createdAt: new Date(),
          menuItem: { id: 'menu-1', name: 'Test Item' },
        };

        vi.mocked(prisma.rewardVoucher.findUnique).mockResolvedValue(mockVoucher as any);

        const result = await validateRewardVoucher('RW-ABC123', tenantId);

        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.voucher).toBeDefined();
      }),
      { numRuns: 100 }
    );
  });

  it('rejection when voucher does not exist (findUnique returns null)', async () => {
    await fc.assert(
      fc.asyncProperty(tenantIdArb, voucherCodeArb, async (tenantId, code) => {
        vi.mocked(prisma.rewardVoucher.findUnique).mockResolvedValue(null);

        const result = await validateRewardVoucher(code, tenantId);

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Kode voucher reward tidak valid');
      }),
      { numRuns: 100 }
    );
  });

  it('rejection when voucher belongs to a different tenant', async () => {
    await fc.assert(
      fc.asyncProperty(
        tenantIdArb,
        tenantIdArb.filter((t) => t.length > 0),
        voucherCodeArb,
        async (tenantId, otherTenantId, code) => {
          // Ensure the tenants are actually different
          fc.pre(tenantId !== otherTenantId);

          const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          const mockVoucher = {
            id: 'voucher-1',
            tenantId: otherTenantId, // Different tenant
            memberId: 'member-1',
            rewardId: 'reward-1',
            menuItemId: 'menu-1',
            code: code,
            discountType: 'free',
            discountSubType: null,
            discountValue: null,
            expiryDate: futureDate,
            isUsed: false,
            usedAt: null,
            orderId: null,
            createdAt: new Date(),
            menuItem: { id: 'menu-1', name: 'Test Item' },
          };

          vi.mocked(prisma.rewardVoucher.findUnique).mockResolvedValue(mockVoucher as any);

          const result = await validateRewardVoucher(code, tenantId);

          expect(result.valid).toBe(false);
          expect(result.error).toBe('Kode voucher reward tidak valid');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejection when voucher is already used (isUsed = true)', async () => {
    await fc.assert(
      fc.asyncProperty(tenantIdArb, voucherCodeArb, async (tenantId, code) => {
        const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const mockVoucher = {
          id: 'voucher-1',
          tenantId: tenantId, // Same tenant
          memberId: 'member-1',
          rewardId: 'reward-1',
          menuItemId: 'menu-1',
          code: code,
          discountType: 'free',
          discountSubType: null,
          discountValue: null,
          expiryDate: futureDate,
          isUsed: true, // Already used
          usedAt: new Date(),
          orderId: 'order-1',
          createdAt: new Date(),
          menuItem: { id: 'menu-1', name: 'Test Item' },
        };

        vi.mocked(prisma.rewardVoucher.findUnique).mockResolvedValue(mockVoucher as any);

        const result = await validateRewardVoucher(code, tenantId);

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Voucher reward sudah digunakan');
      }),
      { numRuns: 100 }
    );
  });

  it('rejection when voucher is expired (expiryDate < now)', async () => {
    await fc.assert(
      fc.asyncProperty(
        tenantIdArb,
        voucherCodeArb,
        fc.integer({ min: 1, max: 365 * 3 }).map(
          (daysAgo) => new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
        ),
        async (tenantId, code, pastExpiryDate) => {
          const mockVoucher = {
            id: 'voucher-1',
            tenantId: tenantId, // Same tenant
            memberId: 'member-1',
            rewardId: 'reward-1',
            menuItemId: 'menu-1',
            code: code,
            discountType: 'free',
            discountSubType: null,
            discountValue: null,
            expiryDate: pastExpiryDate, // Expired
            isUsed: false, // Not used
            usedAt: null,
            orderId: null,
            createdAt: new Date('2020-01-01'),
            menuItem: { id: 'menu-1', name: 'Test Item' },
          };

          vi.mocked(prisma.rewardVoucher.findUnique).mockResolvedValue(mockVoucher as any);

          const result = await validateRewardVoucher(code, tenantId);

          expect(result.valid).toBe(false);
          expect(result.error).toBe('Voucher reward sudah kedaluwarsa');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('any single condition violation produces rejection (combined property)', async () => {
    // Generate voucher states where exactly one condition is violated
    const violationTypeArb = fc.constantFrom(
      'not_found',
      'wrong_tenant',
      'already_used',
      'expired'
    );

    await fc.assert(
      fc.asyncProperty(
        tenantIdArb,
        voucherCodeArb,
        violationTypeArb,
        async (tenantId, code, violationType) => {
          const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

          if (violationType === 'not_found') {
            vi.mocked(prisma.rewardVoucher.findUnique).mockResolvedValue(null);
          } else if (violationType === 'wrong_tenant') {
            vi.mocked(prisma.rewardVoucher.findUnique).mockResolvedValue({
              id: 'voucher-1',
              tenantId: tenantId + '-other', // Different tenant
              memberId: 'member-1',
              rewardId: 'reward-1',
              menuItemId: 'menu-1',
              code: code,
              discountType: 'free',
              discountSubType: null,
              discountValue: null,
              expiryDate: futureDate,
              isUsed: false,
              usedAt: null,
              orderId: null,
              createdAt: new Date(),
              menuItem: { id: 'menu-1', name: 'Test Item' },
            } as any);
          } else if (violationType === 'already_used') {
            vi.mocked(prisma.rewardVoucher.findUnique).mockResolvedValue({
              id: 'voucher-1',
              tenantId: tenantId, // Same tenant
              memberId: 'member-1',
              rewardId: 'reward-1',
              menuItemId: 'menu-1',
              code: code,
              discountType: 'free',
              discountSubType: null,
              discountValue: null,
              expiryDate: futureDate,
              isUsed: true, // Used
              usedAt: new Date(),
              orderId: 'order-1',
              createdAt: new Date(),
              menuItem: { id: 'menu-1', name: 'Test Item' },
            } as any);
          } else if (violationType === 'expired') {
            vi.mocked(prisma.rewardVoucher.findUnique).mockResolvedValue({
              id: 'voucher-1',
              tenantId: tenantId, // Same tenant
              memberId: 'member-1',
              rewardId: 'reward-1',
              menuItemId: 'menu-1',
              code: code,
              discountType: 'free',
              discountSubType: null,
              discountValue: null,
              expiryDate: pastDate, // Expired
              isUsed: false,
              usedAt: null,
              orderId: null,
              createdAt: new Date('2020-01-01'),
              menuItem: { id: 'menu-1', name: 'Test Item' },
            } as any);
          }

          const result = await validateRewardVoucher(code, tenantId);

          // Any single violation should result in rejection
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error!.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Feature: reward-redemption, Property 1: Redemption balance gate
 * Validates: Requirements 4.1, 4.2
 *
 * For any member with point balance B and any reward with required points R,
 * the redemption SHALL succeed only if B >= R. If B < R, the redemption SHALL be rejected.
 */
describe('Property 1: Redemption balance gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redemption succeeds when balance >= requiredPoints', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100000 }), // requiredPoints R
        fc.integer({ min: 0, max: 100000 }), // extra points on top of R
        async (requiredPoints, extra) => {
          const balance = requiredPoints + extra; // B >= R guaranteed

          // Mock member with sufficient balance
          vi.mocked(prisma.member.findUnique).mockResolvedValue({
            id: 'member-1',
            tenantId: 'tenant-1',
            pointBalance: balance,
          } as any);

          // Mock reward with stock and active, linked to available menu item
          vi.mocked(prisma.reward.findUnique).mockResolvedValue({
            id: 'reward-1',
            tenantId: 'tenant-1',
            requiredPoints,
            stockQuantity: 5,
            isActive: true,
            menuItemId: 'menu-1',
            discountType: 'free',
            discountSubType: null,
            discountValue: null,
            menuItem: { id: 'menu-1', name: 'Test Item', isAvailable: true },
          } as any);

          // Mock voucher code collision check (no collision)
          vi.mocked(prisma.rewardVoucher.findUnique).mockResolvedValue(null);

          // Mock transaction returning expected results
          vi.mocked(prisma.$transaction).mockResolvedValue([
            { id: 'member-1', pointBalance: balance - requiredPoints }, // updatedMember
            { id: 'tx-1', memberId: 'member-1', type: 'redeemed', amount: requiredPoints, resultingBalance: balance - requiredPoints }, // transaction
            { id: 'reward-1', stockQuantity: 4 }, // updatedReward
            { id: 'voucher-1', code: 'RW-ABC123', menuItemId: 'menu-1', discountType: 'free', discountSubType: null, discountValue: null, expiryDate: new Date(), isUsed: false }, // rewardVoucher
          ]);

          // Mock the prisma methods that build the transaction array
          (prisma.member as any).update.mockReturnValue(Promise.resolve({}));
          (prisma.pointTransaction as any).create.mockReturnValue(Promise.resolve({}));
          (prisma.reward as any).update.mockReturnValue(Promise.resolve({}));
          (prisma.rewardVoucher as any).create.mockReturnValue(Promise.resolve({}));

          const result = await redeemRewardWithVoucher('member-1', 'reward-1');
          expect(result).toBeDefined();
          expect(result.rewardVoucher).toBeDefined();
          expect(result.rewardVoucher.code).toBe('RW-ABC123');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('redemption fails when balance < requiredPoints', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 100000 }), // requiredPoints R (at least 2 so we can have balance < R)
        fc.integer({ min: 0, max: 99999 }), // balance offset (will be clamped to < R)
        async (requiredPoints, balanceOffset) => {
          const balance = balanceOffset % requiredPoints; // Ensure balance < requiredPoints (0..R-1)

          // Mock member with insufficient balance
          vi.mocked(prisma.member.findUnique).mockResolvedValue({
            id: 'member-1',
            tenantId: 'tenant-1',
            pointBalance: balance,
          } as any);

          // Mock reward
          vi.mocked(prisma.reward.findUnique).mockResolvedValue({
            id: 'reward-1',
            tenantId: 'tenant-1',
            requiredPoints,
            stockQuantity: 5,
            isActive: true,
            menuItemId: 'menu-1',
            discountType: 'free',
            discountSubType: null,
            discountValue: null,
            menuItem: { id: 'menu-1', name: 'Test Item', isAvailable: true },
          } as any);

          await expect(redeemRewardWithVoucher('member-1', 'reward-1')).rejects.toThrow(
            /Poin tidak mencukupi/
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: reward-redemption, Property 2: Redemption stock gate
 * Validates: Requirements 4.3, 4.4
 *
 * For any reward with stock quantity S, the redemption SHALL succeed only if S > 0.
 * If S = 0, the redemption SHALL be rejected with an out-of-stock error.
 */
describe('Property 2: Redemption stock gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redemption succeeds when stock > 0', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }), // stock > 0
        async (stock) => {
          const requiredPoints = 100;
          const balance = 500;

          vi.mocked(prisma.member.findUnique).mockResolvedValue({
            id: 'member-1',
            tenantId: 'tenant-1',
            pointBalance: balance,
          } as any);

          vi.mocked(prisma.reward.findUnique).mockResolvedValue({
            id: 'reward-1',
            tenantId: 'tenant-1',
            requiredPoints,
            stockQuantity: stock,
            isActive: true,
            menuItemId: 'menu-1',
            discountType: 'free',
            discountSubType: null,
            discountValue: null,
            menuItem: { id: 'menu-1', name: 'Test Item', isAvailable: true },
          } as any);

          vi.mocked(prisma.rewardVoucher.findUnique).mockResolvedValue(null);

          // Mock the prisma methods that build the transaction array
          (prisma.member as any).update.mockReturnValue(Promise.resolve({}));
          (prisma.pointTransaction as any).create.mockReturnValue(Promise.resolve({}));
          (prisma.reward as any).update.mockReturnValue(Promise.resolve({}));
          (prisma.rewardVoucher as any).create.mockReturnValue(Promise.resolve({}));

          vi.mocked(prisma.$transaction).mockResolvedValue([
            { id: 'member-1', pointBalance: balance - requiredPoints },
            { id: 'tx-1', memberId: 'member-1', type: 'redeemed', amount: requiredPoints, resultingBalance: balance - requiredPoints },
            { id: 'reward-1', stockQuantity: stock - 1 },
            { id: 'voucher-1', code: 'RW-XYZ789', menuItemId: 'menu-1', discountType: 'free', discountSubType: null, discountValue: null, expiryDate: new Date(), isUsed: false },
          ]);

          const result = await redeemRewardWithVoucher('member-1', 'reward-1');
          expect(result).toBeDefined();
          expect(result.rewardVoucher).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('redemption fails when stock = 0', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 100, max: 10000 }), // balance (always sufficient)
        async (balance) => {
          const requiredPoints = 50;

          vi.mocked(prisma.member.findUnique).mockResolvedValue({
            id: 'member-1',
            tenantId: 'tenant-1',
            pointBalance: balance,
          } as any);

          vi.mocked(prisma.reward.findUnique).mockResolvedValue({
            id: 'reward-1',
            tenantId: 'tenant-1',
            requiredPoints,
            stockQuantity: 0, // Out of stock
            isActive: true,
            menuItemId: 'menu-1',
            discountType: 'free',
            discountSubType: null,
            discountValue: null,
            menuItem: { id: 'menu-1', name: 'Test Item', isAvailable: true },
          } as any);

          await expect(redeemRewardWithVoucher('member-1', 'reward-1')).rejects.toThrow(
            /Stok reward sudah habis/
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: reward-redemption, Property 3: Atomic redemption state consistency
 * Validates: Requirements 4.5
 *
 * For any successful redemption of a reward requiring R points with initial member balance B
 * and reward stock S, the resulting state SHALL have:
 * - member balance = B - R
 * - reward stock = S - 1
 * - exactly one new PointTransaction of type "redeemed" with amount R
 * - exactly one new RewardVoucher created
 */
describe('Property 3: Atomic redemption state consistency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successful redemption produces correct state changes: balance decremented by R, stock decremented by 1, one PointTransaction, one RewardVoucher', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5000 }),  // requiredPoints R
        fc.integer({ min: 0, max: 10000 }), // extra balance above R
        fc.integer({ min: 1, max: 1000 }),  // initial stock S
        async (requiredPoints, extra, stock) => {
          const balance = requiredPoints + extra; // B >= R

          // Reset mocks for each iteration to ensure clean state
          vi.clearAllMocks();

          vi.mocked(prisma.member.findUnique).mockResolvedValue({
            id: 'member-1',
            tenantId: 'tenant-1',
            pointBalance: balance,
          } as any);

          vi.mocked(prisma.reward.findUnique).mockResolvedValue({
            id: 'reward-1',
            tenantId: 'tenant-1',
            requiredPoints,
            stockQuantity: stock,
            isActive: true,
            menuItemId: 'menu-1',
            discountType: 'discount',
            discountSubType: 'fixed',
            discountValue: 5000,
            menuItem: { id: 'menu-1', name: 'Kopi Latte', isAvailable: true },
          } as any);

          vi.mocked(prisma.rewardVoucher.findUnique).mockResolvedValue(null);

          // Mock the prisma methods that build the transaction array
          (prisma.member as any).update.mockReturnValue(Promise.resolve({}));
          (prisma.pointTransaction as any).create.mockReturnValue(Promise.resolve({}));
          (prisma.reward as any).update.mockReturnValue(Promise.resolve({}));
          (prisma.rewardVoucher as any).create.mockReturnValue(Promise.resolve({}));

          // Mock $transaction to return expected atomic results
          vi.mocked(prisma.$transaction).mockResolvedValue([
            { id: 'member-1', pointBalance: balance - requiredPoints }, // member balance = B - R
            { id: 'tx-1', memberId: 'member-1', type: 'redeemed', amount: requiredPoints, resultingBalance: balance - requiredPoints }, // PointTransaction
            { id: 'reward-1', stockQuantity: stock - 1 }, // reward stock = S - 1
            { id: 'voucher-1', code: 'RW-TEST01', menuItemId: 'menu-1', discountType: 'discount', discountSubType: 'fixed', discountValue: 5000, expiryDate: new Date(), isUsed: false }, // RewardVoucher
          ]);

          const result = await redeemRewardWithVoucher('member-1', 'reward-1');

          // Verify atomic state consistency
          // 1. Transaction was called exactly once (atomicity)
          expect(prisma.$transaction).toHaveBeenCalledTimes(1);

          // 2. The transaction was called with an array of 4 operations
          const transactionArgs = vi.mocked(prisma.$transaction).mock.calls[0][0] as any[];
          expect(transactionArgs).toHaveLength(4);

          // 3. Result contains one PointTransaction with correct amount
          expect(result.transaction).toBeDefined();
          expect(result.transaction.type).toBe('redeemed');
          expect(result.transaction.amount).toBe(requiredPoints);
          expect(result.transaction.resultingBalance).toBe(balance - requiredPoints);

          // 4. Result contains one RewardVoucher
          expect(result.rewardVoucher).toBeDefined();
          expect(result.rewardVoucher.code).toBeDefined();
          expect(result.rewardVoucher.isUsed).toBe(false);

          // 5. Updated reward stock = S - 1
          expect(result.reward.stockQuantity).toBe(stock - 1);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: reward-redemption, Property 9: Menu item availability gates redemption
 * Validates: Requirements 8.2, 8.3
 *
 * For any reward linked to a menu item, redemption SHALL succeed only if the menu item's
 * isAvailable is true. When isAvailable is false, redemption SHALL be rejected regardless
 * of balance and stock.
 */
describe('Property 9: Menu item availability gates redemption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redemption fails when menu item isAvailable = false, regardless of balance and stock', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }), // requiredPoints
        fc.integer({ min: 0, max: 50000 }), // extra balance (balance always sufficient)
        fc.integer({ min: 1, max: 1000 }),  // stock (always > 0)
        async (requiredPoints, extra, stock) => {
          const balance = requiredPoints + extra;

          vi.mocked(prisma.member.findUnique).mockResolvedValue({
            id: 'member-1',
            tenantId: 'tenant-1',
            pointBalance: balance,
          } as any);

          vi.mocked(prisma.reward.findUnique).mockResolvedValue({
            id: 'reward-1',
            tenantId: 'tenant-1',
            requiredPoints,
            stockQuantity: stock,
            isActive: true,
            menuItemId: 'menu-1',
            discountType: 'free',
            discountSubType: null,
            discountValue: null,
            menuItem: { id: 'menu-1', name: 'Test Item', isAvailable: false }, // NOT available
          } as any);

          await expect(redeemRewardWithVoucher('member-1', 'reward-1')).rejects.toThrow(
            /Menu item sedang tidak tersedia/
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('redemption succeeds when menu item isAvailable = true (with sufficient balance and stock)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5000 }),  // requiredPoints
        fc.integer({ min: 0, max: 10000 }), // extra balance
        fc.integer({ min: 1, max: 500 }),   // stock
        async (requiredPoints, extra, stock) => {
          const balance = requiredPoints + extra;

          vi.mocked(prisma.member.findUnique).mockResolvedValue({
            id: 'member-1',
            tenantId: 'tenant-1',
            pointBalance: balance,
          } as any);

          vi.mocked(prisma.reward.findUnique).mockResolvedValue({
            id: 'reward-1',
            tenantId: 'tenant-1',
            requiredPoints,
            stockQuantity: stock,
            isActive: true,
            menuItemId: 'menu-1',
            discountType: 'free',
            discountSubType: null,
            discountValue: null,
            menuItem: { id: 'menu-1', name: 'Test Item', isAvailable: true }, // Available
          } as any);

          vi.mocked(prisma.rewardVoucher.findUnique).mockResolvedValue(null);

          // Mock the prisma methods that build the transaction array
          (prisma.member as any).update.mockReturnValue(Promise.resolve({}));
          (prisma.pointTransaction as any).create.mockReturnValue(Promise.resolve({}));
          (prisma.reward as any).update.mockReturnValue(Promise.resolve({}));
          (prisma.rewardVoucher as any).create.mockReturnValue(Promise.resolve({}));

          vi.mocked(prisma.$transaction).mockResolvedValue([
            { id: 'member-1', pointBalance: balance - requiredPoints },
            { id: 'tx-1', memberId: 'member-1', type: 'redeemed', amount: requiredPoints, resultingBalance: balance - requiredPoints },
            { id: 'reward-1', stockQuantity: stock - 1 },
            { id: 'voucher-1', code: 'RW-AVAIL1', menuItemId: 'menu-1', discountType: 'free', discountSubType: null, discountValue: null, expiryDate: new Date(), isUsed: false },
          ]);

          const result = await redeemRewardWithVoucher('member-1', 'reward-1');
          expect(result).toBeDefined();
          expect(result.rewardVoucher).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Feature: reward-redemption, Property 10: Multiple redemption voucher uniqueness
 * Validates: Requirements 9.2
 *
 * For any N consecutive redemptions of the same reward by the same member (where balance and stock allow),
 * the system SHALL generate N distinct voucher codes where no two codes are equal.
 */
describe('Property 10: Multiple redemption voucher uniqueness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('N consecutive redemptions produce N distinct voucher codes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        fc.integer({ min: 1, max: 500 }),
        async (n, requiredPoints) => {
          const initialBalance = requiredPoints * n;
          const initialStock = n;

          const mockMenuItem = {
            id: 'menu-item-1',
            name: 'Test Item',
            isAvailable: true,
          };

          const mockReward = {
            id: 'reward-1',
            tenantId: 'tenant-1',
            name: 'Test Reward',
            requiredPoints: requiredPoints,
            stockQuantity: initialStock,
            isActive: true,
            menuItemId: 'menu-item-1',
            discountType: 'free',
            discountSubType: null,
            discountValue: null,
            menuItem: mockMenuItem,
          };

          // Collect voucher codes from N redemptions
          const voucherCodes: string[] = [];

          for (let i = 0; i < n; i++) {
            const currentBalance = initialBalance - i * requiredPoints;

            // Mock member with enough points for this redemption
            vi.mocked(prisma.member.findUnique).mockResolvedValue({
              id: 'member-1',
              tenantId: 'tenant-1',
              pointBalance: currentBalance,
              name: 'Test Member',
            } as any);

            // Mock reward with remaining stock
            vi.mocked(prisma.reward.findUnique).mockResolvedValue({
              ...mockReward,
              stockQuantity: initialStock - i,
            } as any);

            // Mock rewardVoucher.findUnique to return null (no collision)
            vi.mocked(prisma.rewardVoucher.findUnique).mockResolvedValue(null);

            // Capture the voucher code passed to rewardVoucher.create
            // When building the $transaction array, prisma.rewardVoucher.create is called
            // with the generated code in data.code
            let capturedCode = '';
            vi.mocked((prisma as any).rewardVoucher.create).mockImplementation((args: any) => {
              capturedCode = args.data.code;
              return Promise.resolve({
                id: `voucher-${i}`,
                ...args.data,
              });
            });

            // Mock $transaction to resolve with expected results using the captured code
            vi.mocked(prisma.$transaction).mockImplementation(async () => {
              const updatedMember = {
                id: 'member-1',
                tenantId: 'tenant-1',
                pointBalance: currentBalance - requiredPoints,
              };
              const transaction = {
                id: `tx-${i}`,
                memberId: 'member-1',
                type: 'redeemed',
                amount: requiredPoints,
                rewardId: 'reward-1',
                resultingBalance: currentBalance - requiredPoints,
              };
              const updatedReward = {
                ...mockReward,
                stockQuantity: initialStock - i - 1,
              };
              const rewardVoucher = {
                id: `voucher-${i}`,
                tenantId: 'tenant-1',
                memberId: 'member-1',
                rewardId: 'reward-1',
                menuItemId: 'menu-item-1',
                code: capturedCode,
                discountType: 'free',
                discountSubType: null,
                discountValue: null,
                expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                isUsed: false,
                usedAt: null,
                orderId: null,
                createdAt: new Date(),
              };
              return [updatedMember, transaction, updatedReward, rewardVoucher];
            });

            const result = await redeemRewardWithVoucher('member-1', 'reward-1');
            voucherCodes.push(result.rewardVoucher.code);
          }

          // Assert all voucher codes are distinct — no two codes should be equal
          const uniqueCodes = new Set(voucherCodes);
          expect(uniqueCodes.size).toBe(n);
        }
      ),
      { numRuns: 100 }
    );
  });
});
