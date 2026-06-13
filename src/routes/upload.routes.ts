import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { upload } from '../middleware/upload';
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

// ─── POST /api/upload/image ──────────────────────────────────────────────────

router.post(
  '/upload/image',
  authMiddleware,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw ApiError.badRequest('No file uploaded');
    }

    res.json({
      success: true,
      data: {
        url: `/uploads/${req.file.filename}`,
        filename: req.file.filename,
        size: req.file.size,
      },
    });
  })
);

export default router;
