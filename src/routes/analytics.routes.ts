import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { adminGuard } from '../middleware/admin';
import {
  getOverview,
  getDailyVisitors,
  getDormantMembers,
  getMenuPopularity,
} from '../services/analytics.service';

const router = Router();

/**
 * Wraps an async route handler to forward errors to Express error handler.
 */
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ─── GET /api/admin/analytics/overview ───────────────────────────────────────

router.get(
  '/admin/analytics/overview',
  authMiddleware,
  adminGuard,
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.user!;
    const data = await getOverview(tenantId);
    res.json({ success: true, data });
  })
);

// ─── GET /api/admin/analytics/daily-visitors ─────────────────────────────────

router.get(
  '/admin/analytics/daily-visitors',
  authMiddleware,
  adminGuard,
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.user!;
    const data = await getDailyVisitors(tenantId);
    res.json({ success: true, data });
  })
);

// ─── GET /api/admin/analytics/dormant-members ────────────────────────────────

router.get(
  '/admin/analytics/dormant-members',
  authMiddleware,
  adminGuard,
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.user!;
    const data = await getDormantMembers(tenantId);
    res.json({ success: true, data });
  })
);

// ─── GET /api/admin/analytics/menu-popularity ────────────────────────────────

router.get(
  '/admin/analytics/menu-popularity',
  authMiddleware,
  adminGuard,
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.user!;
    const data = await getMenuPopularity(tenantId);
    res.json({ success: true, data });
  })
);

export default router;
