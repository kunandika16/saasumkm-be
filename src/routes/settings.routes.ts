import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { adminGuard } from '../middleware/admin';
import { validate } from '../middleware/validate';
import { UpdateSettingsRequestSchema } from '../validators/settings.validator';
import { ApiError } from '../utils/api-error';

const router = Router();

/**
 * Wraps an async route handler to forward errors to Express error handler.
 */
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ─── GET /api/admin/settings ─────────────────────────────────────────────────

router.get(
  '/admin/settings',
  authMiddleware,
  adminGuard,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.tenantId;

    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId },
    });

    res.json({
      success: true,
      data: settings,
    });
  })
);

// ─── PATCH /api/admin/settings ───────────────────────────────────────────────

router.patch(
  '/admin/settings',
  authMiddleware,
  adminGuard,
  validate(UpdateSettingsRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.tenantId;

    const settings = await prisma.tenantSettings.upsert({
      where: { tenantId },
      update: req.body,
      create: {
        tenantId,
        ...req.body,
      },
    });

    res.json({
      success: true,
      data: settings,
    });
  })
);

export default router;
