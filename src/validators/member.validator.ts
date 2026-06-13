import { z } from 'zod';

/**
 * Name validation regex: letters (including accented), spaces, periods, apostrophes.
 * Req 2.2: name contains only letters, spaces, periods, or apostrophes
 */
const NAME_REGEX = /^[a-zA-Z\s.']+$/;

/**
 * Profile update name regex: letters, spaces, periods, apostrophes, hyphens.
 * Req 10.5: letters, spaces, period, apostrophe, hyphen
 */
const PROFILE_NAME_REGEX = /^[a-zA-Z\s.'\-]+$/;

/**
 * Indonesian WhatsApp number format.
 * Accepts: 08xx, +628xx, or 628xx with 10-13 total digits.
 * Req 2.2: 08xx or +628xx with 10-13 digits
 */
const WHATSAPP_REGEX = /^(\+62|62|0)8[1-9][0-9]{7,10}$/;

/**
 * RegisterRequest schema
 * Req 2.2: name 2-100 chars letters/spaces/periods/apostrophes,
 *           WhatsApp Indonesian format (08xx or +628xx) 10-13 digits
 */
export const RegisterRequestSchema = z.object({
  name: z
    .string()
    .min(2, 'Nama minimal 2 karakter')
    .max(100, 'Nama maksimal 100 karakter')
    .regex(NAME_REGEX, 'Nama hanya boleh huruf, spasi, titik, atau apostrof'),
  whatsapp: z
    .string()
    .transform((val) => val.replace(/[\s\-]/g, ''))
    .pipe(
      z
        .string()
        .regex(WHATSAPP_REGEX, 'Format nomor WhatsApp tidak valid (08xx atau +628xx, 10-13 digit)')
    ),
  tenantId: z.string().uuid('Tenant ID harus berupa UUID yang valid'),
  accessMethod: z.enum(['nfc', 'qr', 'direct']),
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

/**
 * LoginRequest schema
 */
export const LoginRequestSchema = z.object({
  whatsapp: z
    .string()
    .transform((val) => val.replace(/[\s\-]/g, ''))
    .pipe(
      z
        .string()
        .regex(WHATSAPP_REGEX, 'Format nomor WhatsApp tidak valid (08xx atau +628xx, 10-13 digit)')
    ),
  tenantId: z.string().uuid('Tenant ID harus berupa UUID yang valid'),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/**
 * ProfileUpdateRequest schema
 * Req 10.5: name 2-50 chars, letters/spaces/period/apostrophe/hyphen
 */
export const ProfileUpdateRequestSchema = z.object({
  name: z
    .string()
    .min(2, 'Nama minimal 2 karakter')
    .max(50, 'Nama maksimal 50 karakter')
    .regex(PROFILE_NAME_REGEX, 'Nama hanya boleh huruf, spasi, titik, apostrof, atau strip'),
});

export type ProfileUpdateRequest = z.infer<typeof ProfileUpdateRequestSchema>;
