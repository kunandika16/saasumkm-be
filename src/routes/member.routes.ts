import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { adminGuard } from '../middleware/admin';
import { validate } from '../middleware/validate';
import { getMemberById, updateProfile, getMembersByTenant } from '../services/member.service';
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

// ─── Validation Schemas ──────────────────────────────────────────────────────

const UpdateProfileSchema = z.object({
  name: z.string().min(2).max(50),
});

const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── GET /api/members/me ─────────────────────────────────────────────────────

/**
 * Returns the authenticated member's profile data.
 * Validates: Req 3.1 — display member name and point balance.
 * Validates: Req 10.1 — profile shows name, whatsapp, member ID, registration date, point balance, total visits.
 */
router.get(
  '/me',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.memberId) {
      throw ApiError.unauthorized('Member access required');
    }

    const member = await getMemberById(req.user.memberId);

    res.status(200).json({
      success: true,
      data: member,
    });
  })
);

// ─── PATCH /api/members/me ───────────────────────────────────────────────────

/**
 * Updates the authenticated member's name.
 * Validates: Req 10.5 — name update 2-50 chars with allowed characters.
 */
router.patch(
  '/me',
  authMiddleware,
  validate(UpdateProfileSchema),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.memberId) {
      throw ApiError.unauthorized('Member access required');
    }

    const { name } = req.body;
    const updated = await updateProfile(req.user.memberId, { name });

    res.status(200).json({
      success: true,
      data: updated,
    });
  })
);

// ─── GET /api/admin/members ──────────────────────────────────────────────────

/**
 * Returns paginated list of members for the admin's tenant.
 * Requires admin authentication.
 */
router.get(
  '/admin/members',
  authMiddleware,
  adminGuard,
  validate(PaginationQuerySchema, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    const tenantId = req.user!.tenantId;

    const skip = (page - 1) * pageSize;

    const members = await getMembersByTenant(tenantId);

    // Apply pagination manually since the service returns all members
    const paginatedMembers = members.slice(skip, skip + pageSize);
    const totalItems = members.length;
    const totalPages = Math.ceil(totalItems / pageSize);

    res.status(200).json({
      success: true,
      data: {
        members: paginatedMembers,
        pagination: {
          page,
          pageSize,
          totalItems,
          totalPages,
        },
      },
    });
  })
);

export default router;
