import { z } from 'zod';

/**
 * CreateRewardRequest schema
 * Req 8.6: name max 100, description max 500, required points min 1,
 *           stock quantity, availability status (isActive)
 */
export const CreateRewardRequestSchema = z.object({
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
});

export type CreateRewardRequest = z.infer<typeof CreateRewardRequestSchema>;
