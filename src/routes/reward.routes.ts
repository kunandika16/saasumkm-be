import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { adminGuard } from '../middleware/admin';
import { validate } from '../middleware/validate';
import { CreateRewardRequestSchema } from '../validators/reward.validator';
import { ApiError } from '../utils/api-error';
import prisma from '../config/database';
import {
  getRewards,
  getRedeemableRewards,
  redeemReward,
  createReward,
  updateReward,
} from '../services/reward.service';
import { getPointHistory } from '../services/points.service';

const router = Router();

/**
 * Wraps an async route handler to forward errors to Express error handler.
 */
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ─── Update Reward Schema (partial of Create — all fields optional) ──────────

const UpdateRewardSchema = CreateRewardRequestSchema.partial();

// ─── GET /api/rewards — member list redeemable rewards ───────────────────────

router.get(
  '/rewards',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.memberId) {
      throw ApiError.unauthorized('Member authentication required');
    }

    const member = await prisma.member.findUnique({
      where: { id: req.user.memberId },
    });

    if (!member) {
      throw ApiError.notFound('Member tidak ditemukan');
    }

    const rewards = await getRedeemableRewards(req.user.tenantId, member.pointBalance);

    res.status(200).json({
      success: true,
      data: { rewards },
    });
  })
);

// ─── POST /api/rewards/:id/redeem — member redeem reward ─────────────────────

router.post(
  '/rewards/:id/redeem',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.memberId) {
      throw ApiError.unauthorized('Member authentication required');
    }

    const rewardId = req.params.id as string;
    const result = await redeemReward(req.user.memberId, rewardId);

    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

// ─── GET /api/admin/rewards — admin list all rewards ─────────────────────────

router.get(
  '/admin/rewards',
  authMiddleware,
  adminGuard,
  asyncHandler(async (req: Request, res: Response) => {
    const rewards = await getRewards(req.user!.tenantId);

    res.status(200).json({
      success: true,
      data: { rewards },
    });
  })
);

// ─── POST /api/admin/rewards — admin create reward ───────────────────────────

router.post(
  '/admin/rewards',
  authMiddleware,
  adminGuard,
  validate(CreateRewardRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, description, requiredPoints, stockQuantity, isActive } = req.body;

    const reward = await createReward({
      tenantId: req.user!.tenantId,
      name,
      description,
      requiredPoints,
      stockQuantity,
      isActive,
    });

    res.status(201).json({
      success: true,
      data: { reward },
    });
  })
);

// ─── PATCH /api/admin/rewards/:id — admin update reward ──────────────────────

router.patch(
  '/admin/rewards/:id',
  authMiddleware,
  adminGuard,
  validate(UpdateRewardSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const rewardId = req.params.id as string;
    const reward = await updateReward(rewardId, req.body);

    res.status(200).json({
      success: true,
      data: { reward },
    });
  })
);

// ─── GET /api/members/me/points — member point history (paginated) ───────────

router.get(
  '/members/me/points',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.memberId) {
      throw ApiError.unauthorized('Member authentication required');
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(req.query.pageSize as string) || 20));

    const result = await getPointHistory(req.user.memberId, page, pageSize);

    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

export default router;
