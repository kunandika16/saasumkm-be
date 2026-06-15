import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import path from 'path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import prisma from '../config/database';
import { validate } from '../middleware/validate';
import { authMiddleware } from '../middleware/auth';
import { adminGuard } from '../middleware/admin';
import { upload } from '../middleware/upload';
import { r2Client, R2_BUCKET, R2_PUBLIC_URL } from '../config/r2';
import {
  CreateCategoryRequestSchema,
} from '../validators/menu.validator';
import { ApiError } from '../utils/api-error';
import { z } from 'zod';

const router = Router();

/**
 * Wraps an async route handler to forward errors to Express error handler.
 */
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ─── Query schema for public categories endpoint ─────────────────────────────

const CategoriesQuerySchema = z.object({
  tenantId: z.string().uuid('tenantId harus berupa UUID yang valid'),
});

// ─── GET /api/menu/categories ────────────────────────────────────────────────
// Public endpoint — returns all categories with their menu items for a tenant.

router.get(
  '/menu/categories',
  validate(CategoriesQuerySchema, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.query as { tenantId: string };

    const categories = await prisma.menuCategory.findMany({
      where: { tenantId },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    res.status(200).json({
      success: true,
      data: categories,
    });
  })
);

// ─── POST /api/admin/menu/categories ─────────────────────────────────────────
// Admin creates a new menu category.

router.post(
  '/admin/menu/categories',
  authMiddleware,
  adminGuard,
  validate(CreateCategoryRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, sortOrder } = req.body;
    const tenantId = req.user!.tenantId;

    const category = await prisma.menuCategory.create({
      data: {
        tenantId,
        name,
        sortOrder,
      },
    });

    res.status(201).json({
      success: true,
      data: category,
    });
  })
);

// ─── POST /api/admin/menu/items ──────────────────────────────────────────────
// Admin creates a new menu item with optional image file (multipart/form-data).
// Fields: name, description, price, categoryId, isAvailable, image (file)

router.post(
  '/admin/menu/items',
  authMiddleware,
  adminGuard,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user!.tenantId;

    // Parse fields from multipart form-data
    const name = req.body.name;
    const description = req.body.description || '';
    const price = parseInt(req.body.price, 10);
    const categoryId = req.body.categoryId;
    const isAvailable = req.body.isAvailable !== 'false';

    // Validate required fields
    if (!name || name.length < 1 || name.length > 100) {
      throw ApiError.badRequest('Nama menu wajib diisi (1-100 karakter)');
    }
    if (isNaN(price) || price < 0) {
      throw ApiError.badRequest('Harga harus bilangan bulat minimal 0');
    }
    if (!categoryId) {
      throw ApiError.badRequest('categoryId wajib diisi');
    }

    // Verify category belongs to tenant
    const category = await prisma.menuCategory.findFirst({
      where: { id: categoryId, tenantId },
    });

    if (!category) {
      throw ApiError.notFound('Kategori tidak ditemukan');
    }

    // Upload image to R2 if provided
    let imageUrl: string | null = null;
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
      const filename = `${Date.now()}-${randomUUID()}${ext}`;
      const key = `menu/${filename}`;

      await r2Client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        })
      );

      imageUrl = `${R2_PUBLIC_URL}/${key}`;
    }

    const item = await prisma.menuItem.create({
      data: {
        tenantId,
        categoryId,
        name,
        description,
        price,
        imageUrl,
        isAvailable,
      },
    });

    res.status(201).json({
      success: true,
      data: item,
    });
  })
);

// ─── PATCH /api/admin/menu/items/:id ─────────────────────────────────────────
// Admin updates a menu item (multipart/form-data with optional image file).

router.patch(
  '/admin/menu/items/:id',
  authMiddleware,
  adminGuard,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const tenantId = req.user!.tenantId;

    // Verify item belongs to tenant
    const existing = await prisma.menuItem.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw ApiError.notFound('Menu item tidak ditemukan');
    }

    // Build update data from form fields
    const updateData: Record<string, unknown> = {};

    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.price !== undefined) updateData.price = parseInt(req.body.price, 10);
    if (req.body.isAvailable !== undefined) updateData.isAvailable = req.body.isAvailable !== 'false';

    // If categoryId is being updated, verify the new category belongs to tenant
    if (req.body.categoryId) {
      const category = await prisma.menuCategory.findFirst({
        where: { id: req.body.categoryId, tenantId },
      });
      if (!category) {
        throw ApiError.notFound('Kategori tidak ditemukan');
      }
      updateData.categoryId = req.body.categoryId;
    }

    // Upload new image to R2 if provided
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
      const filename = `${Date.now()}-${randomUUID()}${ext}`;
      const key = `menu/${filename}`;

      await r2Client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        })
      );

      updateData.imageUrl = `${R2_PUBLIC_URL}/${key}`;
    } else if (req.body.imageUrl === 'null' || req.body.imageUrl === '') {
      // Explicitly remove image
      updateData.imageUrl = null;
    }

    const updated = await prisma.menuItem.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      data: updated,
    });
  })
);

// ─── DELETE /api/admin/menu/items/:id ────────────────────────────────────────
// Admin hard-deletes a menu item.

router.delete(
  '/admin/menu/items/:id',
  authMiddleware,
  adminGuard,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const tenantId = req.user!.tenantId;

    // Verify item belongs to tenant
    const existing = await prisma.menuItem.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw ApiError.notFound('Menu item tidak ditemukan');
    }

    await prisma.menuItem.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      data: { message: 'Menu item berhasil dihapus' },
    });
  })
);

export default router;
