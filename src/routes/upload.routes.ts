import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import path from 'path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { authMiddleware } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { r2Client, R2_BUCKET, R2_PUBLIC_URL } from '../config/r2';
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
// Uploads image to Cloudflare R2 and returns public URL.

router.post(
  '/upload/image',
  authMiddleware,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw ApiError.badRequest('No file uploaded');
    }

    // Generate unique filename
    const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
    const filename = `${Date.now()}-${randomUUID()}${ext}`;
    const key = `uploads/${filename}`;

    // Upload to R2
    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      })
    );

    // Build public URL
    const publicUrl = `${R2_PUBLIC_URL}/${key}`;

    res.json({
      success: true,
      data: {
        url: publicUrl,
        filename,
        size: req.file.size,
      },
    });
  })
);

export default router;
