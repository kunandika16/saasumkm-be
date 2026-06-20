import { CorsOptions } from 'cors';
import { env } from './env';

/**
 * Parse FRONTEND_URL — supports comma-separated origins.
 * e.g. "http://localhost:3001,https://dev.sentuhpro.com"
 */
const allowedOrigins = env.FRONTEND_URL.split(',').map((o) => o.trim());

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 86400,
};
