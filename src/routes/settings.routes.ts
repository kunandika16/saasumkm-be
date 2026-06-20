import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import path from 'path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import prisma from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { adminGuard } from '../middleware/admin';
import { validate } from '../middleware/validate';
import { upload } from '../middleware/upload';
import { r2Client, R2_BUCKET, R2_PUBLIC_URL } from '../config/r2';
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

/**
 * Helper: upload a file buffer to R2 and return public URL.
 */
async function uploadToR2(file: Express.Multer.File, folder: string): Promise<string> {
  const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
  const filename = `${Date.now()}-${randomUUID()}${ext}`;
  const key = `${folder}/${filename}`;

  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    })
  );

  return `${R2_PUBLIC_URL}/${key}`;
}

// ─── GET /api/tenant ─────────────────────────────────────────────────────────
// Member-facing: returns tenant public info + landing page URL.
// Requires authentication (uses tenantId from JWT).

router.get(
  '/tenant',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.tenantId;

    const [tenant, settings] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          businessName: true,
          slug: true,
          description: true,
          logoUrl: true,
          bannerUrl: true,
          locationMapUrl: true,
          socialLinks: true,
        },
      }),
      prisma.tenantSettings.findUnique({
        where: { tenantId },
      }),
    ]);

    if (!tenant) {
      throw ApiError.notFound('Tenant tidak ditemukan');
    }

    res.json({
      success: true,
      data: { ...tenant, landingPageUrl: (settings as Record<string, unknown>)?.landingPageUrl ?? null },
    });
  })
);

// ─── GET /api/admin/settings ─────────────────────────────────────────────────

router.get(
  '/admin/settings',
  authMiddleware,
  adminGuard,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.tenantId;

    const [settings, tenant] = await Promise.all([
      prisma.tenantSettings.findUnique({ where: { tenantId } }),
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          businessName: true,
          description: true,
          logoUrl: true,
          bannerUrl: true,
          locationMapUrl: true,
          socialLinks: true,
        },
      }),
    ]);

    res.json({
      success: true,
      data: { ...settings, tenantId, tenant },
    });
  })
);

// ─── PATCH /api/admin/settings ───────────────────────────────────────────────
// Updates tenant settings (point rules, voucher config, review config).

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

// ─── PATCH /api/admin/settings/branding ──────────────────────────────────────
// Updates tenant branding (logo, banner, description, etc.) with file upload.
// Content-Type: multipart/form-data
// Fields: businessName, description, locationMapUrl, socialLinks (JSON string)
// Files: logo, banner

router.patch(
  '/admin/settings/branding',
  authMiddleware,
  adminGuard,
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
  ]),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.tenantId;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

    const updateData: Record<string, unknown> = {};

    // Text fields
    if (req.body.businessName !== undefined) updateData.businessName = req.body.businessName;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.locationMapUrl !== undefined) updateData.locationMapUrl = req.body.locationMapUrl || null;
    if (req.body.socialLinks !== undefined) {
      try {
        updateData.socialLinks = JSON.parse(req.body.socialLinks);
      } catch {
        throw ApiError.badRequest('socialLinks harus berupa JSON valid');
      }
    }

    // File uploads
    if (files?.logo?.[0]) {
      updateData.logoUrl = await uploadToR2(files.logo[0], 'branding');
    } else if (req.body.logoUrl === 'null' || req.body.logoUrl === '') {
      updateData.logoUrl = null;
    }

    if (files?.banner?.[0]) {
      updateData.bannerUrl = await uploadToR2(files.banner[0], 'branding');
    } else if (req.body.bannerUrl === 'null' || req.body.bannerUrl === '') {
      updateData.bannerUrl = null;
    }

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: updateData,
    });

    res.json({
      success: true,
      data: tenant,
    });
  })
);

export default router;
