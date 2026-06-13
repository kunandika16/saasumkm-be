import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { validate } from '../middleware/validate';
import { authMiddleware } from '../middleware/auth';
import { adminGuard } from '../middleware/admin';
import {
  CreateMenuItemRequestSchema,
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
// Admin creates a new menu item.

router.post(
  '/admin/menu/items',
  authMiddleware,
  adminGuard,
  validate(CreateMenuItemRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, description, price, categoryId, imageUrl, isAvailable } = req.body;
    const tenantId = req.user!.tenantId;

    // Verify category belongs to tenant
    const category = await prisma.menuCategory.findFirst({
      where: { id: categoryId, tenantId },
    });

    if (!category) {
      throw ApiError.notFound('Kategori tidak ditemukan');
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
// Admin updates a menu item (partial update).

const UpdateMenuItemSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(200).optional(),
  price: z.number().int().min(0).optional(),
  categoryId: z.string().uuid().optional(),
  imageUrl: z.string().url().optional().nullable(),
  isAvailable: z.boolean().optional(),
});

router.patch(
  '/admin/menu/items/:id',
  authMiddleware,
  adminGuard,
  validate(UpdateMenuItemSchema),
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

    // If categoryId is being updated, verify the new category belongs to tenant
    if (req.body.categoryId) {
      const category = await prisma.menuCategory.findFirst({
        where: { id: req.body.categoryId, tenantId },
      });

      if (!category) {
        throw ApiError.notFound('Kategori tidak ditemukan');
      }
    }

    const updated = await prisma.menuItem.update({
      where: { id },
      data: req.body,
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
