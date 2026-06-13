import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  // Server
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(1, 'JWT_ACCESS_SECRET is required'),
  JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET is required'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // Frontend
  FRONTEND_URL: z.string().default('http://localhost:3001'),

  // File uploads
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_FILE_SIZE: z.string().default('2097152'), // 2MB in bytes

  // WhatsApp (Fonnte)
  FONNTE_API_URL: z.string().default('https://api.fonnte.com/send'),
  FONNTE_TOKEN: z.string().optional(),
  FONNTE_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;

export type Env = z.infer<typeof envSchema>;
