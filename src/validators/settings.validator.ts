import { z } from 'zod';

/**
 * Google Maps Place URL regex pattern.
 * Req 11.2: validate Google Maps Place URL format
 * Accepts various Google Maps URL formats:
 * - https://maps.google.com/...
 * - https://www.google.com/maps/...
 * - https://goo.gl/maps/...
 * - https://maps.app.goo.gl/...
 */
const GOOGLE_MAPS_URL_REGEX =
  /^https:\/\/(maps\.google\.com|www\.google\.com\/maps|goo\.gl\/maps|maps\.app\.goo\.gl)(\/.*)?$/;

/**
 * UpdateSettingsRequest schema
 * Req 8.1: pointsPerAmount and amountPerPoint (1000-100000)
 * Req 8.9: point expiry days min 30
 * Req 11.2: Google Maps Place URL max 2048 chars
 * Req 9.7: welcome voucher config (type, value, validity days)
 */
export const UpdateSettingsRequestSchema = z.object({
  pointsPerAmount: z
    .number()
    .int('Poin per jumlah harus bilangan bulat')
    .min(1, 'Poin per jumlah minimal 1')
    .optional(),
  amountPerPoint: z
    .number()
    .int('Jumlah per poin harus bilangan bulat')
    .min(1000, 'Jumlah per poin minimal Rp1.000')
    .max(100000, 'Jumlah per poin maksimal Rp100.000')
    .optional(),
  pointExpiryDays: z
    .number()
    .int('Masa berlaku poin harus bilangan bulat')
    .min(30, 'Masa berlaku poin minimal 30 hari')
    .optional()
    .nullable(),
  googlePlaceUrl: z
    .string()
    .max(2048, 'Google Maps URL maksimal 2048 karakter')
    .regex(GOOGLE_MAPS_URL_REGEX, 'Format Google Maps Place URL tidak valid')
    .optional()
    .nullable(),
  reviewRewardType: z
    .enum(['points', 'voucher'], {
      errorMap: () => ({ message: 'Tipe reward review harus points atau voucher' }),
    })
    .optional()
    .nullable(),
  reviewRewardValue: z
    .number()
    .int('Nilai reward review harus bilangan bulat')
    .min(1, 'Nilai reward review minimal 1')
    .optional()
    .nullable(),
  welcomeVoucherType: z
    .enum(['percentage', 'fixed'], {
      errorMap: () => ({ message: 'Tipe voucher welcome harus percentage atau fixed' }),
    })
    .optional()
    .nullable(),
  welcomeVoucherValue: z
    .number()
    .int('Nilai voucher welcome harus bilangan bulat')
    .min(1, 'Nilai voucher welcome minimal 1')
    .optional()
    .nullable(),
  welcomeVoucherDays: z
    .number()
    .int('Masa berlaku voucher welcome harus bilangan bulat')
    .min(1, 'Masa berlaku voucher welcome minimal 1 hari')
    .optional()
    .nullable(),
  landingPageUrl: z
    .string()
    .url('URL landing page tidak valid')
    .max(500, 'URL landing page maksimal 500 karakter')
    .optional()
    .nullable(),
});

export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequestSchema>;
