import { z } from 'zod';

/**
 * CreateMenuItemRequest schema
 * Req 5.1: name, description max 200, price in IDR, categoryId, imageUrl
 */
export const CreateMenuItemRequestSchema = z.object({
  name: z
    .string()
    .min(1, 'Nama menu tidak boleh kosong')
    .max(100, 'Nama menu maksimal 100 karakter'),
  description: z
    .string()
    .max(200, 'Deskripsi maksimal 200 karakter')
    .optional()
    .default(''),
  price: z
    .number()
    .int('Harga harus bilangan bulat (IDR tanpa desimal)')
    .min(0, 'Harga tidak boleh negatif'),
  categoryId: z.string().uuid('Category ID harus berupa UUID yang valid'),
  imageUrl: z
    .string()
    .url('URL gambar tidak valid')
    .optional(),
  isAvailable: z.boolean().optional().default(true),
});

export type CreateMenuItemRequest = z.infer<typeof CreateMenuItemRequestSchema>;

/**
 * CreateCategoryRequest schema
 * Req 5.2: Admin can organize menu items into categories
 */
export const CreateCategoryRequestSchema = z.object({
  name: z
    .string()
    .min(1, 'Nama kategori tidak boleh kosong')
    .max(50, 'Nama kategori maksimal 50 karakter'),
  sortOrder: z
    .number()
    .int('Sort order harus bilangan bulat')
    .min(0, 'Sort order minimal 0')
    .optional()
    .default(0),
});

export type CreateCategoryRequest = z.infer<typeof CreateCategoryRequestSchema>;
