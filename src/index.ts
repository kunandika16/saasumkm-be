import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env';
import { corsOptions } from './config/cors';
import { errorHandler } from './middleware/error-handler';
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
import whatsappBlastRoutes from './routes/whatsapp-blast.routes';

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

// WhatsApp blast routes (admin only)
app.use('/api', whatsappBlastRoutes);

// Global error handler (handles ApiError, MulterError, and generic errors)
app.use(errorHandler);

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
