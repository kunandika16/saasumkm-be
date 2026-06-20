import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import path from 'path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { authMiddleware } from '../middleware/auth';
import { adminGuard } from '../middleware/admin';
import { CreateRewardRequestSchema, UpdateRewardRequestSchema } from '../validators/reward.validator';
import { ApiError } from '../utils/api-error';
import prisma from '../config/database';
import { upload } from '../middleware/upload';
import { r2Client, R2_BUCKET, R2_PUBLIC_URL } from '../config/r2';
import {
  redeemRewardWithVoucher,
  createReward,
  updateReward,
} from '../services/reward.service';
import { getMemberRewardVouchers, validateRewardVoucher } from '../services/reward-voucher.service';
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

/**
 * Uploads a reward image to Cloudflare R2 under the `rewards/` key prefix.
 * Returns the public URL on success, throws ApiError on failure.
 */
async function uploadRewardImageToR2(file: Express.Multer.File): Promise<string> {
  const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
  const filename = `${randomUUID()}${ext}`;
  const key = `rewards/${filename}`;

  try {
    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
    );

    return `${R2_PUBLIC_URL}/${key}`;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[R2 Reward Upload Error]', { bucket: R2_BUCKET, key, error: errMsg });
    throw ApiError.internal('Gagal mengupload gambar, silakan coba lagi');
  }
}

// ─── Update Reward Schema ─────────────────────────────────────────────────────

const UpdateRewardSchema = UpdateRewardRequestSchema;

// ─── GET /api/rewards — member list all active rewards with menu item info ───

router.get(
  '/rewards',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.memberId) {
      throw ApiError.unauthorized('Member authentication required');
    }

    const rewards = await prisma.reward.findMany({
      where: {
        tenantId: req.user.tenantId,
        isActive: true,
      },
      include: {
        menuItem: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            isAvailable: true,
          },
        },
      },
      orderBy: { requiredPoints: 'asc' },
    });

    res.status(200).json({
      success: true,
      data: { rewards },
    });
  })
);

// ─── POST /api/rewards/:id/redeem — member redeem reward with voucher ────────

router.post(
  '/rewards/:id/redeem',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.memberId) {
      throw ApiError.unauthorized('Member authentication required');
    }

    const rewardId = req.params.id as string;
    const result = await redeemRewardWithVoucher(req.user.memberId, rewardId);

    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

// ─── GET /api/reward-vouchers — member's reward voucher history (paginated) ──

router.get(
  '/reward-vouchers',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.memberId) {
      throw ApiError.unauthorized('Member authentication required');
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(req.query.pageSize as string) || 20));

    const result = await getMemberRewardVouchers(req.user.memberId, page, pageSize);

    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

// ─── POST /api/reward-vouchers/validate — validate a reward voucher code ─────

router.post(
  '/reward-vouchers/validate',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.memberId) {
      throw ApiError.unauthorized('Member authentication required');
    }

    const { code } = req.body;

    if (!code || typeof code !== 'string') {
      throw ApiError.badRequest('Kode voucher diperlukan');
    }

    const result = await validateRewardVoucher(code.trim(), req.user.tenantId);

    if (!result.valid) {
      res.status(400).json({
        success: false,
        error: result.error,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: { voucher: result.voucher },
    });
  })
);

// ─── GET /api/admin/rewards — admin list all rewards ─────────────────────────

router.get(
  '/admin/rewards',
  authMiddleware,
  adminGuard,
  asyncHandler(async (req: Request, res: Response) => {
    const rewards = await prisma.reward.findMany({
      where: { tenantId: req.user!.tenantId },
      include: {
        menuItem: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            rewardVouchers: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Map to include redemptionCount at the top level
    const rewardsWithCount = rewards.map((reward) => ({
      ...reward,
      redemptionCount: reward._count.rewardVouchers,
      _count: undefined,
    }));

    res.status(200).json({
      success: true,
      data: { rewards: rewardsWithCount },
    });
  })
);

// ─── POST /api/admin/rewards — admin create reward ───────────────────────────

router.post(
  '/admin/rewards',
  authMiddleware,
  adminGuard,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    // Parse body fields from multipart form-data (strings from FormData)
    const name = req.body.name;
    const description = req.body.description || '';
    const requiredPoints = parseInt(req.body.requiredPoints, 10);
    const stockQuantity = parseInt(req.body.stockQuantity, 10);
    const isActive = req.body.isActive !== 'false';
    const menuItemId = req.body.menuItemId;
    const discountType = req.body.discountType;
    const discountSubType = req.body.discountSubType || null;
    const discountValue = req.body.discountValue ? parseInt(req.body.discountValue, 10) : null;

    // Validate with Zod schema
    const parsed = CreateRewardRequestSchema.safeParse({
      name,
      description,
      requiredPoints,
      stockQuantity,
      isActive,
      menuItemId,
      discountType,
      discountSubType,
      discountValue,
    });

    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      throw ApiError.badRequest(firstError.message);
    }

    // Upload image to R2 if file provided
    let imageUrl: string | undefined;
    if (req.file) {
      imageUrl = await uploadRewardImageToR2(req.file);
    }

    const reward = await createReward({
      tenantId: req.user!.tenantId,
      name: parsed.data.name,
      description: parsed.data.description,
      requiredPoints: parsed.data.requiredPoints,
      stockQuantity: parsed.data.stockQuantity,
      isActive: parsed.data.isActive,
      menuItemId: parsed.data.menuItemId,
      discountType: parsed.data.discountType,
      discountSubType: parsed.data.discountSubType ?? undefined,
      discountValue: parsed.data.discountValue ?? undefined,
      imageUrl,
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
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    const rewardId = req.params.id as string;

    // Verify reward exists and belongs to tenant
    const existing = await prisma.reward.findFirst({
      where: { id: rewardId, tenantId: req.user!.tenantId },
    });

    if (!existing) {
      throw ApiError.notFound('Reward tidak ditemukan');
    }

    // Build update data from multipart form fields
    const updateData: Record<string, unknown> = {};

    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.requiredPoints !== undefined) updateData.requiredPoints = parseInt(req.body.requiredPoints, 10);
    if (req.body.stockQuantity !== undefined) updateData.stockQuantity = parseInt(req.body.stockQuantity, 10);
    if (req.body.isActive !== undefined) updateData.isActive = req.body.isActive !== 'false';
    if (req.body.menuItemId !== undefined) updateData.menuItemId = req.body.menuItemId;
    if (req.body.discountType !== undefined) updateData.discountType = req.body.discountType;
    if (req.body.discountSubType !== undefined) {
      updateData.discountSubType = req.body.discountSubType === '' ? null : req.body.discountSubType;
    }
    if (req.body.discountValue !== undefined) {
      updateData.discountValue = req.body.discountValue === '' || req.body.discountValue === null
        ? null
        : parseInt(req.body.discountValue, 10);
    }

    // Validate update data with Zod schema
    const parsed = UpdateRewardSchema.safeParse(updateData);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      throw ApiError.badRequest(firstError.message);
    }

    // Upload new image to R2 if file provided
    if (req.file) {
      const imageUrl = await uploadRewardImageToR2(req.file);
      (parsed.data as Record<string, unknown>).imageUrl = imageUrl;
    } else if (req.body.imageUrl === 'null' || req.body.imageUrl === '') {
      // Explicitly remove image
      (parsed.data as Record<string, unknown>).imageUrl = null;
    }

    const reward = await updateReward(rewardId, parsed.data);

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
