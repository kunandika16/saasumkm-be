import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { adminGuard } from '../middleware/admin';
import { validate } from '../middleware/validate';
import { CheckoutRequestSchema } from '../validators/order.validator';
import { ApiError } from '../utils/api-error';
import {
  createOrder,
  getOrdersByMember,
  getPendingOrders,
  validatePayment,
} from '../services/order.service';
import prisma from '../config/database';

const router = Router();

/**
 * Wraps an async route handler to forward errors to Express error handler.
 */
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ─── Validators ──────────────────────────────────────────────────────────────

const ValidatePaymentSchema = z.object({
  action: z.enum(['confirm', 'reject']),
});

// ─── POST /api/orders/checkout — Member checkout ─────────────────────────────

router.post(
  '/orders/checkout',
  authMiddleware,
  validate(CheckoutRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.memberId) {
      throw ApiError.unauthorized('Member access required');
    }

    const { items, voucherCode } = req.body;

    const result = await createOrder({
      memberId: req.user.memberId,
      tenantId: req.user.tenantId,
      items,
      voucherCode,
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  })
);

// ─── GET /api/orders — Member order history (paginated, sorted desc) ─────────

router.get(
  '/orders',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.memberId) {
      throw ApiError.unauthorized('Member access required');
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));

    const result = await getOrdersByMember(req.user.memberId, { page, pageSize });

    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

// ─── GET /api/admin/orders — Admin list orders (filterable, paginated) ───────

router.get(
  '/admin/orders',
  authMiddleware,
  adminGuard,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.tenantId;
    const status = req.query.status as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 50));

    // If filtering by pending status, use the dedicated service method
    if (status === 'pending') {
      const result = await getPendingOrders(tenantId, { page, pageSize });
      res.status(200).json({
        success: true,
        data: result,
      });
      return;
    }

    // For other status filters or all orders
    const skip = (page - 1) * pageSize;
    const where: Record<string, unknown> = { tenantId };
    if (status) {
      where.status = status;
    }

    // Sort: oldest first for pending, newest first for others
    const orderBy = { createdAt: status === 'pending' ? 'asc' as const : 'desc' as const };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          member: {
            select: {
              id: true,
              name: true,
              whatsapp: true,
            },
          },
          items: true,
          voucher: {
            select: {
              code: true,
              discountType: true,
              discountValue: true,
            },
          },
        },
        orderBy,
        skip,
        take: pageSize,
      }),
      prisma.order.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        orders,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  })
);

// ─── POST /api/admin/orders/:orderId/validate — Admin confirm/reject ─────────

router.post(
  '/admin/orders/:orderId/validate',
  authMiddleware,
  adminGuard,
  validate(ValidatePaymentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const orderId = req.params.orderId as string;
    const { action } = req.body;

    const result = await validatePayment({ orderId, action });

    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

export default router;
