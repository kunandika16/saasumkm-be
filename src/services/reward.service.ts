import prisma from '../config/database';
import { Reward, PointTransaction } from '@prisma/client';
import { ApiError } from '../utils/api-error';

export interface RedeemRewardResult {
  reward: Reward;
  transaction: PointTransaction;
  rewardVoucher: {
    id: string;
    code: string;
    menuItemId: string;
    menuItemName: string;
    discountType: 'free' | 'discount';
    discountSubType: 'fixed' | 'percentage' | null;
    discountValue: number | null;
    expiryDate: Date;
    isUsed: boolean;
  };
}

/**
 * Generates a unique reward voucher code in the format: RW-{6 alphanumeric chars}
 * Characters: uppercase letters (A-Z) + digits (0-9)
 */
export function generateVoucherCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'RW-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export interface CreateRewardInput {
  tenantId: string;
  name: string;
  description?: string;
  requiredPoints: number;
  stockQuantity: number;
  isActive?: boolean;
  menuItemId: string;
  discountType: 'free' | 'discount';
  discountSubType?: 'fixed' | 'percentage';
  discountValue?: number;
  imageUrl?: string;
}

export interface UpdateRewardInput {
  name?: string;
  description?: string;
  requiredPoints?: number;
  stockQuantity?: number;
  isActive?: boolean;
  menuItemId?: string;
  discountType?: 'free' | 'discount';
  discountSubType?: 'fixed' | 'percentage' | null;
  discountValue?: number | null;
  imageUrl?: string | null;
}

/**
 * Creates a new reward for a tenant.
 *
 * Validates: Req 8.6 — Admin defines rewards with name (max 100),
 * description (max 500), requiredPoints (≥1), stockQuantity, isActive.
 */
export async function createReward(data: CreateRewardInput) {
  const reward = await prisma.reward.create({
    data: {
      tenantId: data.tenantId,
      name: data.name,
      description: data.description ?? '',
      requiredPoints: data.requiredPoints,
      stockQuantity: data.stockQuantity,
      isActive: data.isActive ?? true,
      menuItemId: data.menuItemId,
      discountType: data.discountType,
      discountSubType: data.discountSubType ?? null,
      discountValue: data.discountValue ?? null,
      imageUrl: data.imageUrl ?? null,
    },
  });

  return reward;
}

/**
 * Retrieves all rewards for a tenant, sorted by creation date descending.
 */
export async function getRewards(tenantId: string) {
  const rewards = await prisma.reward.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });

  return rewards;
}

/**
 * Retrieves redeemable rewards for a member based on their point balance.
 * Returns only active rewards with stock > 0 that the member can afford.
 * Sorted by requiredPoints ascending (cheapest first).
 *
 * Validates: Req 10.4 — Profile page shows redeemable rewards (active + affordable).
 */
export async function getRedeemableRewards(
  tenantId: string,
  memberPointBalance: number
) {
  const rewards = await prisma.reward.findMany({
    where: {
      tenantId,
      isActive: true,
      requiredPoints: { lte: memberPointBalance },
      stockQuantity: { gt: 0 },
    },
    orderBy: { requiredPoints: 'asc' },
  });

  return rewards;
}

/**
 * Redeems a reward for a member. Performs atomic transaction to:
 * - Deduct points from member balance
 * - Create a point transaction record (type=redeemed)
 * - Decrement reward stock by 1
 *
 * Validates: Req 8.4 — Redeem points for reward, deduct from balance, record in history.
 * Validates: Req 8.5 — Reject if insufficient balance (show current and required).
 * Validates: Req 8.8 — Reject if reward inactive or zero stock.
 */
export async function redeemReward(memberId: string, rewardId: string) {
  // Fetch member and reward
  const member = await prisma.member.findUnique({
    where: { id: memberId },
  });

  if (!member) {
    throw ApiError.notFound('Member tidak ditemukan');
  }

  const reward = await prisma.reward.findUnique({
    where: { id: rewardId },
  });

  if (!reward) {
    throw ApiError.notFound('Reward tidak ditemukan');
  }

  if (!reward.isActive) {
    throw ApiError.badRequest('Reward sedang tidak tersedia');
  }

  if (reward.stockQuantity <= 0) {
    throw ApiError.badRequest('Stok reward sudah habis');
  }

  if (member.pointBalance < reward.requiredPoints) {
    throw ApiError.badRequest(
      `Poin tidak mencukupi. Saldo: ${member.pointBalance}, Dibutuhkan: ${reward.requiredPoints}`
    );
  }

  // Atomic transaction: deduct points, record transaction, decrement stock
  const [updatedMember, transaction, updatedReward] =
    await prisma.$transaction([
      prisma.member.update({
        where: { id: memberId },
        data: {
          pointBalance: { decrement: reward.requiredPoints },
        },
      }),
      prisma.pointTransaction.create({
        data: {
          memberId,
          type: 'redeemed',
          amount: reward.requiredPoints,
          rewardId: reward.id,
          resultingBalance: member.pointBalance - reward.requiredPoints,
        },
      }),
      prisma.reward.update({
        where: { id: rewardId },
        data: {
          stockQuantity: { decrement: 1 },
        },
      }),
    ]);

  return { reward: updatedReward, transaction };
}

/**
 * Updates an existing reward's fields.
 */
export async function updateReward(rewardId: string, data: UpdateRewardInput) {
  const reward = await prisma.reward.update({
    where: { id: rewardId },
    data,
  });

  return reward;
}

/**
 * Redeems a reward for a member and generates a unique RewardVoucher.
 *
 * Performs validation:
 * - Member exists
 * - Reward exists and is active
 * - Reward has stock > 0
 * - Member has sufficient point balance
 * - Linked menu item is available
 *
 * Atomic transaction:
 * - Deducts points from member balance
 * - Decrements reward stock by 1
 * - Creates PointTransaction (type=redeemed)
 * - Generates RewardVoucher (unique code, 7-day expiry)
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 8.2
 */
export async function redeemRewardWithVoucher(
  memberId: string,
  rewardId: string
): Promise<RedeemRewardResult> {
  // Fetch member
  const member = await prisma.member.findUnique({
    where: { id: memberId },
  });

  if (!member) {
    throw ApiError.notFound('Member tidak ditemukan');
  }

  // Fetch reward with linked menu item
  const reward = await prisma.reward.findUnique({
    where: { id: rewardId },
    include: { menuItem: true },
  });

  if (!reward) {
    throw ApiError.notFound('Reward tidak ditemukan');
  }

  if (!reward.isActive) {
    throw ApiError.badRequest('Reward sedang tidak tersedia');
  }

  if (reward.stockQuantity <= 0) {
    throw ApiError.badRequest('Stok reward sudah habis');
  }

  if (member.pointBalance < reward.requiredPoints) {
    throw ApiError.badRequest(
      `Poin tidak mencukupi. Saldo: ${member.pointBalance}, Dibutuhkan: ${reward.requiredPoints}`
    );
  }

  // Validate linked menu item is available
  if (!reward.menuItem || !reward.menuItem.isAvailable) {
    throw ApiError.badRequest('Menu item sedang tidak tersedia');
  }

  // Generate a unique voucher code, retry on collision
  let voucherCode = generateVoucherCode();
  let existingVoucher = await prisma.rewardVoucher.findUnique({
    where: { code: voucherCode },
  });
  while (existingVoucher) {
    voucherCode = generateVoucherCode();
    existingVoucher = await prisma.rewardVoucher.findUnique({
      where: { code: voucherCode },
    });
  }

  // Calculate expiry date: 7 days from now
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 7);

  // Atomic transaction: deduct points, decrement stock, create PointTransaction, create RewardVoucher
  const [updatedMember, transaction, updatedReward, rewardVoucher] =
    await prisma.$transaction([
      prisma.member.update({
        where: { id: memberId },
        data: {
          pointBalance: { decrement: reward.requiredPoints },
        },
      }),
      prisma.pointTransaction.create({
        data: {
          memberId,
          type: 'redeemed',
          amount: reward.requiredPoints,
          rewardId: reward.id,
          resultingBalance: member.pointBalance - reward.requiredPoints,
        },
      }),
      prisma.reward.update({
        where: { id: rewardId },
        data: {
          stockQuantity: { decrement: 1 },
        },
      }),
      prisma.rewardVoucher.create({
        data: {
          tenantId: member.tenantId,
          memberId,
          rewardId: reward.id,
          menuItemId: reward.menuItemId!,
          code: voucherCode,
          discountType: reward.discountType,
          discountSubType: reward.discountSubType ?? null,
          discountValue: reward.discountValue ?? null,
          expiryDate,
        },
      }),
    ]);

  return {
    reward: updatedReward,
    transaction,
    rewardVoucher: {
      id: rewardVoucher.id,
      code: rewardVoucher.code,
      menuItemId: rewardVoucher.menuItemId,
      menuItemName: reward.menuItem.name,
      discountType: rewardVoucher.discountType as 'free' | 'discount',
      discountSubType: rewardVoucher.discountSubType as 'fixed' | 'percentage' | null,
      discountValue: rewardVoucher.discountValue,
      expiryDate: rewardVoucher.expiryDate,
      isUsed: rewardVoucher.isUsed,
    },
  };
}
