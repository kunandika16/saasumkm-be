import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';
import { env } from '../config/env';
import { ApiError } from '../utils/api-error';

/**
 * Allowed MIME types for image uploads.
 */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Max file size in bytes (2MB).
 */
const MAX_FILE_SIZE = parseInt(env.MAX_FILE_SIZE, 10) || 2097152;

/**
 * File filter to only allow specific image MIME types.
 */
function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new ApiError(400, 'Invalid file type. Only JPG, PNG, and WebP images are allowed.', {
        code: 'INVALID_FILE_TYPE',
      })
    );
  }
}

/**
 * Configured multer instance for single image uploads.
 * Uses memory storage — file buffer is uploaded to Cloudflare R2.
 * - Max file size: 2MB
 * - Allowed types: image/jpeg, image/png, image/webp
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter,
});
