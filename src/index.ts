import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env';
import { corsOptions } from './config/cors';
import authRoutes from './routes/auth.routes';
import menuRoutes from './routes/menu.routes';
import memberRoutes from './routes/member.routes';
import visitRoutes from './routes/visit.routes';
import reviewRoutes from './routes/review.routes';
import rewardRoutes from './routes/reward.routes';
import voucherRoutes from './routes/voucher.routes';
import orderRoutes from './routes/order.routes';
import analyticsRoutes from './routes/analytics.routes';
import settingsRoutes from './routes/settings.routes';
import uploadRoutes from './routes/upload.routes';

const app = express();

// Security middleware
app.use(helmet());

// CORS middleware
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files as static assets
app.use('/uploads', express.static(path.resolve(env.UPLOAD_DIR)));

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

// Auth routes
app.use('/api/auth', authRoutes);

// Menu routes (public + admin)
app.use('/api', menuRoutes);

// Member routes
app.use('/api/members', memberRoutes);
app.use('/api', memberRoutes); // For /api/admin/members

// Visit routes
app.use('/api/visits', visitRoutes);

// Reward & points routes
app.use('/api', rewardRoutes);

// Voucher routes
app.use('/api', voucherRoutes);

// Order routes (member + admin)
app.use('/api', orderRoutes);

// Analytics routes (admin only)
app.use('/api', analyticsRoutes);

// Review routes
app.use('/api', reviewRoutes);

// Settings routes (admin only)
app.use('/api', settingsRoutes);

// Upload routes (authenticated users)
app.use('/api', uploadRoutes);

// Global error handler
app.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode = err.statusCode || 500;
  const message = env.NODE_ENV === 'production' && statusCode === 500
    ? 'Internal server error'
    : err.message;

  console.error(`[Error] ${err.message}`, {
    statusCode,
    stack: env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: { message: 'Route not found' },
  });
});

// Start server
const PORT = parseInt(env.PORT, 10);

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} in ${env.NODE_ENV} mode`);
});

export default app;
