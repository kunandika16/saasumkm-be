/**
 * Reward Voucher Service
 *
 * Handles voucher generation, validation, application, and discount calculation
 * for the reward redemption system.
 */

import prisma from '../config/database';
import { ApiError } from '../utils/api-error';

export interface RewardVoucherValidationResult {
  valid: boolean;
  voucher?: any;
  error?: string;
}

export interface DiscountResult {
  discountAmount: number;
  finalPrice: number;
}

/**
 * Pure function: calculates the discount amount and final price for a reward voucher.
 *
 * - "free" type: finalPrice = 0, discountAmount = itemPrice
 * - "discount" + "fixed": finalPrice = max(0, itemPrice - discountValue)
 * - "discount" + "percentage": finalPrice = max(0, itemPrice - floor(itemPrice * discountValue / 100))
 *
 * In all cases: discountAmount = itemPrice - finalPrice
 *
 * Validates: Requirements 5.4, 5.5, 5.6
 */
export function calculateRewardDiscount(
  itemPrice: number,
  discountType: 'free' | 'discount',
  discountSubType: 'fixed' | 'percentage' | null,
  discountValue: number | null
): DiscountResult {
  let finalPrice: number;

  if (discountType === 'free') {
    finalPrice = 0;
  } else if (discountSubType === 'fixed') {
    finalPrice = Math.max(0, itemPrice - (discountValue ?? 0));
  } else {
    // percentage
    finalPrice = Math.max(
      0,
      itemPrice - Math.floor((itemPrice * (discountValue ?? 0)) / 100)
    );
  }

  const discountAmount = itemPrice - finalPrice;

  return { discountAmount, finalPrice };
}

/**
 * Validates a reward voucher code for use in an order.
 *
 * Checks:
 * 1. Voucher code exists and belongs to the specified tenant
 * 2. Voucher has not already been used (isUsed === false)
 * 3. Voucher has not expired (expiryDate >= now)
 *
 * Returns a typed validation result with specific error messages per failure case.
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
 */
export async function validateRewardVoucher(
  code: string,
  tenantId: string
): Promise<RewardVoucherValidationResult> {
  // Find voucher by code (regardless of tenant, so we can give proper error messages)
  const voucher = await prisma.rewardVoucher.findUnique({
    where: { code },
    include: { menuItem: true },
  });

  // Voucher code not found OR belongs to a different tenant
  if (!voucher || voucher.tenantId !== tenantId) {
    return {
      valid: false,
      error: 'Kode voucher reward tidak valid',
    };
  }

  // Voucher already used
  if (voucher.isUsed) {
    return {
      valid: false,
      error: 'Voucher reward sudah digunakan',
    };
  }

  // Voucher expired
  if (voucher.expiryDate < new Date()) {
    return {
      valid: false,
      error: 'Voucher reward sudah kedaluwarsa',
    };
  }

  // All checks passed
  return {
    valid: true,
    voucher,
  };
}

/**
 * Gets a paginated list of a member's reward vouchers, ordered by creation date descending.
 *
 * Includes:
 * - Reward name (via reward relation)
 * - Menu item name (via menuItem relation)
 * - Voucher status: active (not used, not expired), used, or expired
 *
 * Validates: Requirements 7.1, 7.2
 */
export async function getMemberRewardVouchers(
  memberId: string,
  page: number,
  pageSize: number
): Promise<{ vouchers: any[]; total: number }> {
  const skip = (page - 1) * pageSize;

  const [vouchers, total] = await Promise.all([
    prisma.rewardVoucher.findMany({
      where: { memberId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: {
        reward: { select: { name: true } },
        menuItem: { select: { name: true } },
      },
    }),
    prisma.rewardVoucher.count({
      where: { memberId },
    }),
  ]);

  // Map vouchers to include a computed status field
  const now = new Date();
  const vouchersWithStatus = vouchers.map((voucher) => {
    let status: 'active' | 'used' | 'expired';

    if (voucher.isUsed) {
      status = 'used';
    } else if (voucher.expiryDate < now) {
      status = 'expired';
    } else {
      status = 'active';
    }

    return {
      ...voucher,
      status,
      rewardName: voucher.reward.name,
      menuItemName: voucher.menuItem.name,
    };
  });

  return { vouchers: vouchersWithStatus, total };
}

/**
 * Applies a reward voucher discount to an existing order.
 *
 * Steps:
 * 1. Fetch the voucher with its menuItem relation
 * 2. Fetch the order with its items
 * 3. Verify the order contains the voucher's linked menuItemId
 * 4. Calculate discount for ONE unit of the linked menu item
 * 5. Update order's discountAmount and finalTotal
 * 6. Mark voucher as used (isUsed=true, usedAt=now, orderId)
 *
 * All DB operations are performed in a Prisma transaction.
 *
 * Validates: Requirements 5.2, 5.3, 5.7, 6.6
 */
export async function applyRewardVoucher(
  voucherId: string,
  orderId: string
): Promise<void> {
  // Fetch the voucher with its linked menu item
  const voucher = await prisma.rewardVoucher.findUnique({
    where: { id: voucherId },
    include: { menuItem: true },
  });

  if (!voucher) {
    throw ApiError.badRequest('Voucher reward tidak ditemukan');
  }

  // Fetch the order with its items
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) {
    throw ApiError.notFound('Order tidak ditemukan');
  }

  // Check if order contains the voucher's linked menuItemId
  const matchingItem = order.items.find(
    (item) => item.menuItemId === voucher.menuItemId
  );

  if (!matchingItem) {
    throw ApiError.badRequest(
      `Voucher hanya berlaku untuk: ${voucher.menuItem.name}`
    );
  }

  // Calculate discount for ONE unit of the linked menu item
  const { discountAmount } = calculateRewardDiscount(
    matchingItem.itemPrice,
    voucher.discountType as 'free' | 'discount',
    (voucher.discountSubType as 'fixed' | 'percentage') || null,
    voucher.discountValue
  );

  // Update order and mark voucher as used in a transaction
  await prisma.$transaction(async (tx) => {
    // Update order's discountAmount and finalTotal
    await tx.order.update({
      where: { id: orderId },
      data: {
        discountAmount: order.discountAmount + discountAmount,
        finalTotal: Math.max(0, order.finalTotal - discountAmount),
      },
    });

    // Mark voucher as used
    await tx.rewardVoucher.update({
      where: { id: voucherId },
      data: {
        isUsed: true,
        usedAt: new Date(),
        orderId: orderId,
      },
    });
  });
}
