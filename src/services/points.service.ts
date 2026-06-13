import prisma from '../config/database';
import { ApiError } from '../utils/api-error';

/**
 * Point rule configuration used for calculating points earned from a transaction.
 */
export interface PointRule {
  pointsPerAmount: number; // e.g., 1 point
  amountPerPoint: number;  // e.g., 10000 (Rp10.000)
}

/**
 * Calculates the number of points earned from a transaction total.
 * Uses floor rounding for fractional results.
 *
 * Validates: Req 8.2 — Points = floor(finalTotal / amountPerPoint) * pointsPerAmount
 */
export function calculatePoints(
  finalTotal: number,
  pointRule: PointRule
): number {
  if (finalTotal < 0 || pointRule.amountPerPoint <= 0 || pointRule.pointsPerAmount <= 0) {
    return 0;
  }
  return Math.floor(finalTotal / pointRule.amountPerPoint) * pointRule.pointsPerAmount;
}

/**
 * Awards points to a member after a successful order payment.
 * Creates a PointTransaction with type='earned' and updates the member's denormalized pointBalance.
 * Uses a Prisma transaction for atomicity.
 *
 * Validates: Req 8.3 — Maintain point balance and complete transaction history
 */
export async function awardPoints(
  memberId: string,
  amount: number,
  orderId: string
) {
  if (amount <= 0) {
    throw ApiError.badRequest('Jumlah poin harus lebih dari 0');
  }

  const result = await prisma.$transaction(async (tx) => {
    // Update member balance
    const member = await tx.member.update({
      where: { id: memberId },
      data: {
        pointBalance: { increment: amount },
      },
    });

    // Create point transaction record
    const transaction = await tx.pointTransaction.create({
      data: {
        memberId,
        type: 'earned',
        amount,
        orderId,
        resultingBalance: member.pointBalance,
      },
    });

    return transaction;
  });

  return result;
}

/**
 * Redeems points from a member's balance for a reward.
 * Checks that the member has sufficient balance before deducting.
 * Ensures balance never goes negative.
 * Uses a Prisma transaction for atomicity.
 *
 * Validates: Req 8.4 — Redeem points, deduct from balance, record in history
 * Validates: Req 8.5 — Reject redemption if insufficient balance
 */
export async function redeemPoints(
  memberId: string,
  amount: number,
  rewardId: string
) {
  if (amount <= 0) {
    throw ApiError.badRequest('Jumlah poin harus lebih dari 0');
  }

  const result = await prisma.$transaction(async (tx) => {
    // Get current member balance
    const member = await tx.member.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      throw ApiError.notFound('Member tidak ditemukan');
    }

    // Check sufficient balance (Req 8.5)
    if (member.pointBalance < amount) {
      throw ApiError.badRequest(
        `Poin tidak mencukupi. Saldo saat ini: ${member.pointBalance}, dibutuhkan: ${amount}`
      );
    }

    // Deduct from balance — ensure never negative
    const newBalance = member.pointBalance - amount;
    if (newBalance < 0) {
      throw ApiError.badRequest('Saldo poin tidak boleh negatif');
    }

    const updatedMember = await tx.member.update({
      where: { id: memberId },
      data: {
        pointBalance: newBalance,
      },
    });

    // Create point transaction record
    const transaction = await tx.pointTransaction.create({
      data: {
        memberId,
        type: 'redeemed',
        amount,
        rewardId,
        resultingBalance: updatedMember.pointBalance,
      },
    });

    return transaction;
  });

  return result;
}

/**
 * Retrieves paginated point transaction history for a member.
 * Sorted by createdAt descending (newest first).
 *
 * Validates: Req 8.3 — Complete transaction history (type, amount, orderId/rewardId, datetime, resulting balance)
 */
export async function getPointHistory(
  memberId: string,
  page: number,
  pageSize: number
) {
  const skip = (page - 1) * pageSize;

  const [transactions, total] = await Promise.all([
    prisma.pointTransaction.findMany({
      where: { memberId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.pointTransaction.count({
      where: { memberId },
    }),
  ]);

  return {
    transactions,
    total,
    page,
    pageSize,
  };
}

/**
 * Expires points for all members of a tenant based on the tenant's pointExpiryDays setting.
 * Finds earned point transactions older than the expiry threshold that haven't been
 * counteracted by an expiry transaction, marks them as expired, and deducts from member balance.
 *
 * Validates: Req 8.9 — Points expire based on tenant setting (minimum 30 days)
 */
export async function expirePoints(tenantId: string): Promise<number> {
  // Get tenant settings for expiry configuration
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
  });

  if (!settings || !settings.pointExpiryDays) {
    return 0;
  }

  // Minimum 30 days (Req 8.9)
  const expiryDays = Math.max(settings.pointExpiryDays, 30);

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() - expiryDays);

  // Find earned transactions older than expiry date that haven't been expired yet
  // We identify "not expired" by checking there's no corresponding expired transaction
  // referencing the same member with the same timestamp range
  const expirableTransactions = await prisma.pointTransaction.findMany({
    where: {
      type: 'earned',
      createdAt: { lt: expiryDate },
      member: { tenantId },
      // Only include transactions that don't already have a corresponding expiry
      NOT: {
        amount: 0,
      },
    },
    include: {
      member: true,
    },
  });

  // Filter out transactions that already have a matching expired entry
  const existingExpiries = await prisma.pointTransaction.findMany({
    where: {
      type: 'expired',
      member: { tenantId },
    },
    select: {
      memberId: true,
      orderId: true,
      amount: true,
      createdAt: true,
    },
  });

  // Create a set of already-expired transaction identifiers (memberId + orderId)
  const expiredSet = new Set(
    existingExpiries.map((e) => `${e.memberId}:${e.orderId || ''}:${e.amount}`)
  );

  // Filter to only transactions not yet expired
  const toExpire = expirableTransactions.filter(
    (t) => !expiredSet.has(`${t.memberId}:${t.id}:${t.amount}`)
  );

  if (toExpire.length === 0) {
    return 0;
  }

  // Process expiries in a transaction
  let expiredCount = 0;

  for (const transaction of toExpire) {
    await prisma.$transaction(async (tx) => {
      // Deduct expired points from member balance (never below 0)
      const member = await tx.member.findUnique({
        where: { id: transaction.memberId },
      });

      if (!member) return;

      const deductAmount = Math.min(transaction.amount, member.pointBalance);
      if (deductAmount <= 0) return;

      const updatedMember = await tx.member.update({
        where: { id: transaction.memberId },
        data: {
          pointBalance: { decrement: deductAmount },
        },
      });

      // Create expired transaction record — store original transaction ID in orderId
      // for tracking which earned transaction was expired
      await tx.pointTransaction.create({
        data: {
          memberId: transaction.memberId,
          type: 'expired',
          amount: deductAmount,
          orderId: transaction.id, // Reference to original earned transaction
          resultingBalance: updatedMember.pointBalance,
        },
      });

      expiredCount++;
    });
  }

  return expiredCount;
}

/**
 * Gets the effective redeemable balance for a member, excluding points that
 * should be expired based on the tenant's settings.
 *
 * Validates: Req 8.9 — Expired points excluded from redeemable balance
 */
export async function getRedeemableBalance(memberId: string): Promise<number> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      tenant: {
        include: { settings: true },
      },
    },
  });

  if (!member) {
    throw ApiError.notFound('Member tidak ditemukan');
  }

  const settings = member.tenant.settings;

  // If no expiry settings, the full balance is redeemable
  if (!settings || !settings.pointExpiryDays) {
    return member.pointBalance;
  }

  const expiryDays = Math.max(settings.pointExpiryDays, 30);
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() - expiryDays);

  // Sum of earned points that are past expiry and haven't been expired yet
  const earnedPastExpiry = await prisma.pointTransaction.findMany({
    where: {
      memberId,
      type: 'earned',
      createdAt: { lt: expiryDate },
    },
  });

  // Sum of already-expired transactions for this member
  const alreadyExpired = await prisma.pointTransaction.findMany({
    where: {
      memberId,
      type: 'expired',
    },
  });

  // Points that are earned past expiry but not yet formally expired
  const alreadyExpiredSet = new Set(
    alreadyExpired.map((e) => e.orderId) // orderId stores the original earned transaction ID
  );

  const pendingExpiryAmount = earnedPastExpiry
    .filter((t) => !alreadyExpiredSet.has(t.id))
    .reduce((sum, t) => sum + t.amount, 0);

  // Redeemable balance = current balance minus pending expiry amount (floor at 0)
  return Math.max(0, member.pointBalance - pendingExpiryAmount);
}
