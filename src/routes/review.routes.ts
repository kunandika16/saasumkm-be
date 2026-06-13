import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { adminGuard } from '../middleware/admin';
import { ApiError } from '../utils/api-error';
import { DiscountType } from '@prisma/client';
import crypto from 'crypto';

const router = Router();

/**
 * Wraps an async route handler to forward errors to Express error handler.
 */
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

/**
 * Generates a random review reward voucher code.
 * Format: REVIEW-XXXXXX (6 random alphanumeric chars)
 */
function generateReviewVoucherCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const randomPart = Array.from(crypto.randomBytes(6))
    .map((byte) => chars[byte % chars.length])
    .join('');
  return `REVIEW-${randomPart}`;
}

// ─── POST /api/reviews/click ─────────────────────────────────────────────────

router.post(
  '/reviews/click',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const memberId = req.user!.memberId;
    const tenantId = req.user!.tenantId;

    if (!memberId) {
      throw ApiError.unauthorized('Member authentication required');
    }

    // Check if tenant has Google Place URL configured
    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId },
    });

    if (!settings || !settings.googlePlaceUrl) {
      throw ApiError.badRequest('Google Review belum dikonfigurasi');
    }

    // Create the ReviewClick record
    const reviewClick = await prisma.reviewClick.create({
      data: {
        memberId,
        tenantId,
        rewardGranted: false,
      },
    });

    // Check if this is the member's first click (no prior ReviewClick with rewardGranted=true)
    const previousRewardedClick = await prisma.reviewClick.findFirst({
      where: {
        memberId,
        tenantId,
        rewardGranted: true,
        id: { not: reviewClick.id },
      },
    });

    let rewardGranted = false;
    let reward: { type: string; value: number } | undefined;

    // Grant first-time reward if eligible
    if (!previousRewardedClick && settings.reviewRewardType && settings.reviewRewardValue) {
      if (settings.reviewRewardType === 'points') {
        // Increment member's point balance and create PointTransaction
        const updatedMember = await prisma.member.update({
          where: { id: memberId },
          data: {
            pointBalance: { increment: settings.reviewRewardValue },
          },
        });

        await prisma.pointTransaction.create({
          data: {
            memberId,
            type: 'earned',
            amount: settings.reviewRewardValue,
            resultingBalance: updatedMember.pointBalance,
          },
        });

        rewardGranted = true;
        reward = { type: 'points', value: settings.reviewRewardValue };
      } else if (settings.reviewRewardType === 'voucher') {
        // Create a voucher for the member (similar to welcome voucher pattern)
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30); // 30 days validity

        await prisma.voucher.create({
          data: {
            tenantId,
            code: generateReviewVoucherCode(),
            discountType: DiscountType.percentage,
            discountValue: settings.reviewRewardValue,
            expiryDate,
            maxUsage: 1,
            currentUsage: 0,
            isActive: true,
            isWelcomeVoucher: false,
            issuedToMemberId: memberId,
          },
        });

        rewardGranted = true;
        reward = { type: 'voucher', value: settings.reviewRewardValue };
      }

      // Update the ReviewClick record to mark reward as granted
      if (rewardGranted) {
        await prisma.reviewClick.update({
          where: { id: reviewClick.id },
          data: { rewardGranted: true },
        });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        clicked: true,
        rewardGranted,
        ...(reward && { reward }),
      },
    });
  })
);

// ─── GET /api/admin/reviews/stats ────────────────────────────────────────────

router.get(
  '/admin/reviews/stats',
  authMiddleware,
  adminGuard,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.tenantId;

    // Get total members count for this tenant
    const totalMembers = await prisma.member.count({
      where: { tenantId },
    });

    // Get count of unique members who have at least one ReviewClick
    const uniqueClickersResult = await prisma.reviewClick.groupBy({
      by: ['memberId'],
      where: { tenantId },
    });
    const totalUniqueClickers = uniqueClickersResult.length;

    // Get total ReviewClick count
    const totalClicks = await prisma.reviewClick.count({
      where: { tenantId },
    });

    // Calculate conversion rate
    const conversionRate = totalMembers > 0
      ? parseFloat(((totalUniqueClickers / totalMembers) * 100).toFixed(2))
      : 0;

    res.status(200).json({
      success: true,
      data: {
        totalUniqueClickers,
        totalClicks,
        totalMembers,
        conversionRate,
      },
    });
  })
);

export default router;
