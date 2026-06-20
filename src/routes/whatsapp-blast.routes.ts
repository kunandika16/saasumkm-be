import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import axios from 'axios';
import { authMiddleware } from '../middleware/auth';
import { adminGuard } from '../middleware/admin';
import { validate } from '../middleware/validate';
import { ApiError } from '../utils/api-error';
import { getTemplate, validateMessage } from '../services/blast-template.service';
import { getRecipientCount, getRecipients } from '../services/blast-recipient.service';
import { createBlastJob, getBlastJobStatus, sendSingleMessage } from '../services/blast-job.service';

const router = Router();

const WA_PYTHON_SERVICE_URL = process.env.WA_PYTHON_SERVICE_URL || 'http://localhost:8001';

/**
 * Wraps an async route handler to forward errors to Express error handler.
 */
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ─── Zod Validation Schemas ──────────────────────────────────────────────────

const BlastCategorySchema = z.enum(['reminder', 'promo', 'announcement', 'custom']);

const InactivityPeriodSchema = z.enum(['1week', '1month', '3months']);

const TemplateCategoryParamsSchema = z.object({
  category: BlastCategorySchema,
});

const RecipientsQuerySchema = z.object({
  category: BlastCategorySchema,
  inactivityPeriod: InactivityPeriodSchema.optional(),
});

const BlastRequestSchema = z.object({
  category: BlastCategorySchema,
  inactivityPeriod: InactivityPeriodSchema.optional(),
  message: z.string().min(1, 'Pesan tidak boleh kosong').max(1000, 'Pesan tidak boleh lebih dari 1000 karakter'),
});

const BlastJobStatusParamsSchema = z.object({
  jobId: z.string().min(1, 'Job ID tidak boleh kosong'),
});

const SendSingleRequestSchema = z.object({
  memberId: z.string().min(1, 'Member ID tidak boleh kosong'),
  category: BlastCategorySchema,
  message: z.string().min(1, 'Pesan tidak boleh kosong').max(1000, 'Pesan tidak boleh lebih dari 1000 karakter'),
});

// ═══════════════════════════════════════════════════════════════════════════════
// Session Routes (Task 4.1)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/admin/whatsapp/status — WhatsApp connection status ─────────────

router.get(
  '/admin/whatsapp/status',
  authMiddleware,
  adminGuard,
  asyncHandler(async (_req: Request, res: Response) => {
    try {
      const response = await axios.get(`${WA_PYTHON_SERVICE_URL}/session/status`);
      const data = response.data;
      res.json({
        success: true,
        data: {
          connected: data.connected,
          phoneNumber: data.phone_number || undefined,
          connectedAt: data.connected_at || undefined,
        },
      });
    } catch (error) {
      if (axios.isAxiosError(error) && !error.response) {
        throw new ApiError(503, 'Layanan WhatsApp tidak tersedia', { code: 'SERVICE_UNAVAILABLE' });
      }
      throw new ApiError(500, 'Gagal mendapatkan status WhatsApp', { code: 'INTERNAL_ERROR' });
    }
  })
);

// ─── GET /api/admin/whatsapp/qr — Request QR code for session ────────────────

router.get(
  '/admin/whatsapp/qr',
  authMiddleware,
  adminGuard,
  asyncHandler(async (_req: Request, res: Response) => {
    try {
      const response = await axios.get(`${WA_PYTHON_SERVICE_URL}/session/qr`);
      const data = response.data;
      res.json({
        success: true,
        data: {
          qrCode: data.qr_code,
          expiresAt: data.expires_at,
        },
      });
    } catch (error) {
      if (axios.isAxiosError(error) && !error.response) {
        throw new ApiError(503, 'Layanan WhatsApp tidak tersedia', { code: 'SERVICE_UNAVAILABLE' });
      }
      throw new ApiError(500, 'Gagal mendapatkan QR code', { code: 'INTERNAL_ERROR' });
    }
  })
);

// ─── POST /api/admin/whatsapp/disconnect — Disconnect WhatsApp session ───────

router.post(
  '/admin/whatsapp/disconnect',
  authMiddleware,
  adminGuard,
  asyncHandler(async (_req: Request, res: Response) => {
    try {
      const response = await axios.post(`${WA_PYTHON_SERVICE_URL}/session/disconnect`);
      res.json({ success: true, data: response.data });
    } catch (error) {
      if (axios.isAxiosError(error) && !error.response) {
        throw new ApiError(503, 'Layanan WhatsApp tidak tersedia', { code: 'SERVICE_UNAVAILABLE' });
      }
      throw new ApiError(500, 'Gagal memutuskan koneksi WhatsApp', { code: 'INTERNAL_ERROR' });
    }
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// Blast Execution Routes (Task 4.2)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/admin/whatsapp/templates/:category — Get template ──────────────

router.get(
  '/admin/whatsapp/templates/:category',
  authMiddleware,
  adminGuard,
  validate(TemplateCategoryParamsSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const { category } = req.params as z.infer<typeof TemplateCategoryParamsSchema>;
    const template = getTemplate(category);

    res.json({
      success: true,
      data: { category, template },
    });
  })
);

// ─── GET /api/admin/whatsapp/recipients — Get recipient count ────────────────

router.get(
  '/admin/whatsapp/recipients',
  authMiddleware,
  adminGuard,
  validate(RecipientsQuerySchema, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const { category, inactivityPeriod } = req.query as unknown as z.infer<typeof RecipientsQuerySchema>;
    const tenantId = req.user!.tenantId;

    // For reminder category, inactivityPeriod is required
    if (category === 'reminder' && !inactivityPeriod) {
      throw ApiError.badRequest('Periode ketidakaktifan wajib diisi untuk kategori reminder');
    }

    const result = await getRecipientCount(tenantId, category, inactivityPeriod);

    res.json({
      success: true,
      data: result,
    });
  })
);

// ─── POST /api/admin/whatsapp/blast — Create and execute blast job ───────────

router.post(
  '/admin/whatsapp/blast',
  authMiddleware,
  adminGuard,
  validate(BlastRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { category, inactivityPeriod, message } = req.body as z.infer<typeof BlastRequestSchema>;
    const tenantId = req.user!.tenantId;

    // For reminder category, inactivityPeriod is required
    if (category === 'reminder' && !inactivityPeriod) {
      throw ApiError.badRequest('Periode ketidakaktifan wajib diisi untuk kategori reminder');
    }

    // Validate message content (whitespace-only check)
    const validation = validateMessage(message);
    if (!validation.valid) {
      throw ApiError.badRequest(validation.error!);
    }

    // Get recipients based on category and filters
    const recipients = await getRecipients(tenantId, category, inactivityPeriod);

    if (recipients.length === 0) {
      throw ApiError.badRequest('Tidak ada penerima yang cocok dengan filter');
    }

    // Create blast job with recipients mapped to phone/name format
    const blastRecipients = recipients.map((r) => ({
      phone: r.whatsapp,
      name: r.name,
    }));

    const job = await createBlastJob(
      tenantId,
      category,
      inactivityPeriod || null,
      message,
      blastRecipients
    );

    res.status(201).json({
      success: true,
      data: {
        jobId: job.id,
        status: job.status,
        totalRecipients: job.totalRecipients,
      },
    });
  })
);

// ─── GET /api/admin/whatsapp/blast/:jobId/status — Get blast job progress ────

router.get(
  '/admin/whatsapp/blast/:jobId/status',
  authMiddleware,
  adminGuard,
  validate(BlastJobStatusParamsSchema, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const { jobId } = req.params as z.infer<typeof BlastJobStatusParamsSchema>;

    try {
      const status = await getBlastJobStatus(jobId);
      res.json({ success: true, data: status });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Blast job tidak ditemukan') {
          throw ApiError.notFound(error.message);
        }
        if (error.message === 'Layanan WhatsApp tidak tersedia') {
          throw new ApiError(503, error.message, { code: 'SERVICE_UNAVAILABLE' });
        }
      }
      throw error;
    }
  })
);

// ─── POST /api/admin/whatsapp/send-single — Send to individual member ────────

router.post(
  '/admin/whatsapp/send-single',
  authMiddleware,
  adminGuard,
  validate(SendSingleRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { memberId, message } = req.body as z.infer<typeof SendSingleRequestSchema>;

    // Validate message content (whitespace-only check)
    const validation = validateMessage(message);
    if (!validation.valid) {
      throw ApiError.badRequest(validation.error!);
    }

    const result = await sendSingleMessage(memberId, message);

    if (!result.success) {
      // Determine appropriate status code based on error
      if (result.error === 'Member tidak ditemukan') {
        throw ApiError.notFound(result.error);
      }
      if (result.error === 'Layanan WhatsApp tidak tersedia') {
        throw new ApiError(503, result.error, { code: 'SERVICE_UNAVAILABLE' });
      }
      throw ApiError.badRequest(result.error || 'Gagal mengirim pesan');
    }

    res.json({
      success: true,
      data: { success: true },
    });
  })
);

export default router;
