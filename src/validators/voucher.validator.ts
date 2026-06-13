import { z } from 'zod';

/**
 * Voucher code regex: 1-20 alphanumeric characters.
 * Req 9.1: voucher code 1-20 alphanumeric
 */
const VOUCHER_CODE_REGEX = /^[a-zA-Z0-9]{1,20}$/;

/**
 * CreateVoucherRequest schema
 * Req 9.1: code 1-20 alphanum, discount type, expiry date (future), max usage min 1
 * Req 9.2: percentage discount value 1-100
 * Req 9.3: fixed discount value Rp1.000 - Rp10.000.000
 */
export const CreateVoucherRequestSchema = z
  .object({
    code: z
      .string()
      .min(1, 'Kode voucher minimal 1 karakter')
      .max(20, 'Kode voucher maksimal 20 karakter')
      .regex(VOUCHER_CODE_REGEX, 'Kode voucher hanya boleh huruf dan angka'),
    discountType: z.enum(['percentage', 'fixed'], {
      errorMap: () => ({ message: 'Tipe diskon harus percentage atau fixed' }),
    }),
    discountValue: z.number().int('Nilai diskon harus bilangan bulat'),
    expiryDate: z
      .string()
      .datetime({ message: 'Format tanggal tidak valid (ISO 8601)' })
      .refine(
        (date) => new Date(date) > new Date(),
        'Tanggal kedaluwarsa harus di masa depan'
      ),
    maxUsage: z
      .number()
      .int('Maksimal penggunaan harus bilangan bulat')
      .min(1, 'Maksimal penggunaan minimal 1'),
  })
  .superRefine((data, ctx) => {
    if (data.discountType === 'percentage') {
      if (data.discountValue < 1 || data.discountValue > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Nilai diskon persentase harus antara 1 dan 100',
          path: ['discountValue'],
        });
      }
    } else if (data.discountType === 'fixed') {
      if (data.discountValue < 1000 || data.discountValue > 10_000_000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Nilai diskon fixed harus antara Rp1.000 dan Rp10.000.000',
          path: ['discountValue'],
        });
      }
    }
  });

export type CreateVoucherRequest = z.infer<typeof CreateVoucherRequestSchema>;

/**
 * ValidateVoucherRequest schema
 * Req 6.1: voucher code input for validation
 */
export const ValidateVoucherRequestSchema = z.object({
  code: z
    .string()
    .min(1, 'Kode voucher tidak boleh kosong')
    .max(20, 'Kode voucher maksimal 20 karakter'),
});

export type ValidateVoucherRequest = z.infer<typeof ValidateVoucherRequestSchema>;
