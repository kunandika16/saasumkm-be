import { z } from 'zod';

/**
 * CreateRewardRequest schema
 * Req 2.1–2.3, 2.7: Reward creation with menu item link, discount config, and image
 *
 * Validation rules:
 * - menuItemId: required string
 * - discountType: 'free' | 'discount' (required)
 * - discountSubType: required when discountType = 'discount'
 * - discountValue: required (min 1) when discountType = 'discount'
 * - requiredPoints: min 1
 * - stockQuantity: min 0
 * - name: min 1
 * - imageUrl: optional string
 */
export const CreateRewardRequestSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Nama reward tidak boleh kosong')
      .max(100, 'Nama reward maksimal 100 karakter'),
    description: z
      .string()
      .max(500, 'Deskripsi maksimal 500 karakter')
      .optional()
      .default(''),
    requiredPoints: z
      .number()
      .int('Poin yang dibutuhkan harus bilangan bulat')
      .min(1, 'Poin yang dibutuhkan minimal 1'),
    stockQuantity: z
      .number()
      .int('Jumlah stok harus bilangan bulat')
      .min(0, 'Jumlah stok tidak boleh negatif'),
    isActive: z.boolean().optional().default(true),
    menuItemId: z.string().min(1, 'Menu item harus dipilih'),
    discountType: z.enum(['free', 'discount'], {
      errorMap: () => ({ message: 'Tipe diskon harus "free" atau "discount"' }),
    }),
    discountSubType: z
      .enum(['fixed', 'percentage'], {
        errorMap: () => ({
          message: 'Sub-tipe diskon harus "fixed" atau "percentage"',
        }),
      })
      .optional()
      .nullable(),
    discountValue: z
      .number()
      .int('Nilai diskon harus bilangan bulat')
      .min(1, 'Nilai diskon minimal 1')
      .optional()
      .nullable(),
    imageUrl: z.string().url('URL gambar tidak valid').optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.discountType === 'discount') {
      if (!data.discountSubType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['discountSubType'],
          message:
            'Sub-tipe diskon wajib diisi jika tipe diskon adalah "discount"',
        });
      }
      if (data.discountValue == null || data.discountValue < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['discountValue'],
          message:
            'Nilai diskon wajib diisi (minimal 1) jika tipe diskon adalah "discount"',
        });
      }
    }
  });

export type CreateRewardRequest = z.infer<typeof CreateRewardRequestSchema>;

/**
 * UpdateRewardRequest schema
 * All fields are optional for partial updates.
 * Same conditional validation applies for discount fields.
 */
export const UpdateRewardRequestSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Nama reward tidak boleh kosong')
      .max(100, 'Nama reward maksimal 100 karakter')
      .optional(),
    description: z
      .string()
      .max(500, 'Deskripsi maksimal 500 karakter')
      .optional(),
    requiredPoints: z
      .number()
      .int('Poin yang dibutuhkan harus bilangan bulat')
      .min(1, 'Poin yang dibutuhkan minimal 1')
      .optional(),
    stockQuantity: z
      .number()
      .int('Jumlah stok harus bilangan bulat')
      .min(0, 'Jumlah stok tidak boleh negatif')
      .optional(),
    isActive: z.boolean().optional(),
    menuItemId: z.string().min(1, 'Menu item harus dipilih').optional(),
    discountType: z
      .enum(['free', 'discount'], {
        errorMap: () => ({
          message: 'Tipe diskon harus "free" atau "discount"',
        }),
      })
      .optional(),
    discountSubType: z
      .enum(['fixed', 'percentage'], {
        errorMap: () => ({
          message: 'Sub-tipe diskon harus "fixed" atau "percentage"',
        }),
      })
      .optional()
      .nullable(),
    discountValue: z
      .number()
      .int('Nilai diskon harus bilangan bulat')
      .min(1, 'Nilai diskon minimal 1')
      .optional()
      .nullable(),
    imageUrl: z.string().url('URL gambar tidak valid').optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.discountType === 'discount') {
      if (!data.discountSubType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['discountSubType'],
          message:
            'Sub-tipe diskon wajib diisi jika tipe diskon adalah "discount"',
        });
      }
      if (data.discountValue == null || data.discountValue < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['discountValue'],
          message:
            'Nilai diskon wajib diisi (minimal 1) jika tipe diskon adalah "discount"',
        });
      }
    }
  });

export type UpdateRewardRequest = z.infer<typeof UpdateRewardRequestSchema>;
