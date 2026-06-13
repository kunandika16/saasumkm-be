import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
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

const RecordVisitSchema = z.object({
  accessMethod: z.enum(['nfc', 'qr', 'direct']),
});

// ─── POST /api/visits ────────────────────────────────────────────────────────

/**
 * Records a member visit/access event.
 * Updates member's lastVisitAt and increments totalVisits.
 * Validates: Req 1.6 — record access event with timestamp and method.
 */
router.post(
  '/',
  authMiddleware,
  validate(RecordVisitSchema),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.memberId) {
      throw ApiError.unauthorized('Member access required');
    }

    const { accessMethod } = req.body;
    const memberId = req.user.memberId;

    // Create visit record and update member stats in a transaction
    const [visit] = await prisma.$transaction([
      prisma.visit.create({
        data: {
          memberId,
          accessMethod,
        },
      }),
      prisma.member.update({
        where: { id: memberId },
        data: {
          lastVisitAt: new Date(),
          totalVisits: { increment: 1 },
        },
      }),
    ]);

    res.status(201).json({
      success: true,
      data: visit,
    });
  })
);

export default router;
