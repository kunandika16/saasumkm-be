import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { adminGuard } from '../middleware/admin';
import { validate } from '../middleware/validate';
import {
  CreateVoucherRequestSchema,
  ValidateVoucherRequestSchema,
} from '../validators/voucher.validator';
import {
  validateVoucher,
  createVoucher,
  deactivateVoucher,
  getVoucherStats,
} from '../services/voucher.service';

const router = Router();

/**
 * Wraps an async route handler to forward errors to Express error handler.
 */
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ─── POST /api/vouchers/validate ─────────────────────────────────────────────
// Member validates a voucher code before applying it.
// Validates: Req 6.2, 6.3

router.post(
  '/vouchers/validate',
  authMiddleware,
  validate(ValidateVoucherRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { code } = req.body;
    const tenantId = req.user!.tenantId;

    const voucher = await validateVoucher(code, tenantId);

    res.status(200).json({
      success: true,
      data: {
        code: voucher.code,
        discountType: voucher.discountType,
        discountValue: voucher.discountValue,
        expiryDate: voucher.expiryDate,
      },
    });
  })
);

// ─── POST /api/admin/vouchers ────────────────────────────────────────────────
// Admin creates a new voucher.
// Validates: Req 9.1, 9.4

router.post(
  '/admin/vouchers',
  authMiddleware,
  adminGuard,
  validate(CreateVoucherRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { code, discountType, discountValue, expiryDate, maxUsage } = req.body;
    const tenantId = req.user!.tenantId;

    const voucher = await createVoucher({
      tenantId,
      code,
      discountType,
      discountValue,
      expiryDate: new Date(expiryDate),
      maxUsage,
    });

    res.status(201).json({
      success: true,
      data: voucher,
    });
  })
);

// ─── PATCH /api/admin/vouchers/:id/deactivate ────────────────────────────────
// Admin deactivates a voucher.
// Validates: Req 9.8

router.patch(
  '/admin/vouchers/:id/deactivate',
  authMiddleware,
  adminGuard,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;

    const voucher = await deactivateVoucher(id);

    res.status(200).json({
      success: true,
      data: voucher,
    });
  })
);

// ─── GET /api/admin/vouchers ─────────────────────────────────────────────────
// Admin lists all vouchers with stats.
// Validates: Req 9.9

router.get(
  '/admin/vouchers',
  authMiddleware,
  adminGuard,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.tenantId;

    const vouchers = await getVoucherStats(tenantId);

    res.status(200).json({
      success: true,
      data: vouchers,
    });
  })
);

export default router;
