import prisma from '../config/database';
import { ApiError } from '../utils/api-error';

export interface CreateRewardInput {
  tenantId: string;
  name: string;
  description?: string;
  requiredPoints: number;
  stockQuantity: number;
  isActive?: boolean;
}

export interface UpdateRewardInput {
  name?: string;
  description?: string;
  requiredPoints?: number;
  stockQuantity?: number;
  isActive?: boolean;
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
