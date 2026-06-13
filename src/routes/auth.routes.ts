import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { validate } from '../middleware/validate';
import { RegisterRequestSchema, LoginRequestSchema } from '../validators/member.validator';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  comparePassword,
} from '../services/auth.service';
import { ApiError } from '../utils/api-error';
import { DiscountType } from '@prisma/client';
import crypto from 'crypto';

const router = Router();

/**
 * Wraps an async route handler to forward errors to Express error handler.
 */
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

/**
 * Generates a random welcome voucher code.
 * Format: WELCOMEXXXXXX (6 random alphanumeric chars, no dashes)
 */
function generateVoucherCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const randomPart = Array.from(crypto.randomBytes(6))
    .map((byte) => chars[byte % chars.length])
    .join('');
  return `WELCOME${randomPart}`;
}

// ─── Schemas for routes without dedicated validators ─────────────────────────

const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const AdminLoginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(1, 'Password is required'),
});

// ─── POST /api/auth/register ─────────────────────────────────────────────────

router.post(
  '/register',
  validate(RegisterRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, whatsapp, tenantId, accessMethod } = req.body;

    // Check if member already exists (auto-login per Req 2.5)
    const existingMember = await prisma.member.findUnique({
      where: { tenantId_whatsapp: { tenantId, whatsapp } },
    });

    if (existingMember) {
      const tokenPayload = { memberId: existingMember.id, tenantId, role: 'member' as const };
      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);

      res.status(200).json({
        success: true,
        data: {
          memberId: existingMember.id,
          accessToken,
          refreshToken,
        },
      });
      return;
    }

    // Create new member
    const newMember = await prisma.member.create({
      data: {
        tenantId,
        name,
        whatsapp,
        pointBalance: 0,
        totalVisits: 0,
      },
    });

    // Record first visit
    await prisma.visit.create({
      data: {
        memberId: newMember.id,
        accessMethod,
      },
    });

    // Check TenantSettings for welcome voucher configuration
    let welcomeVoucher: {
      code: string;
      discountType: string;
      discountValue: number;
      expiryDate: Date;
    } | undefined;

    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId },
    });

    if (
      settings &&
      settings.welcomeVoucherType &&
      settings.welcomeVoucherValue &&
      settings.welcomeVoucherDays
    ) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + settings.welcomeVoucherDays);

      const voucher = await prisma.voucher.create({
        data: {
          tenantId,
          code: generateVoucherCode(),
          discountType: settings.welcomeVoucherType as DiscountType,
          discountValue: settings.welcomeVoucherValue,
          expiryDate,
          maxUsage: 1,
          currentUsage: 0,
          isActive: true,
          isWelcomeVoucher: true,
          issuedToMemberId: newMember.id,
        },
      });

      welcomeVoucher = {
        code: voucher.code,
        discountType: voucher.discountType,
        discountValue: voucher.discountValue,
        expiryDate: voucher.expiryDate,
      };
    }

    // Generate tokens
    const tokenPayload = { memberId: newMember.id, tenantId, role: 'member' as const };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    res.status(201).json({
      success: true,
      data: {
        memberId: newMember.id,
        accessToken,
        refreshToken,
        ...(welcomeVoucher && { welcomeVoucher }),
      },
    });
  })
);

// ─── POST /api/auth/login ────────────────────────────────────────────────────

router.post(
  '/login',
  validate(LoginRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { whatsapp, tenantId } = req.body;

    const member = await prisma.member.findUnique({
      where: { tenantId_whatsapp: { tenantId, whatsapp } },
    });

    if (!member) {
      throw new ApiError(404, 'Nomor WhatsApp belum terdaftar', {
        code: 'MEMBER_NOT_FOUND',
      });
    }

    const tokenPayload = { memberId: member.id, tenantId, role: 'member' as const };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    res.status(200).json({
      success: true,
      data: {
        memberId: member.id,
        accessToken,
        refreshToken,
      },
    });
  })
);

// ─── POST /api/auth/refresh ──────────────────────────────────────────────────

router.post(
  '/refresh',
  validate(RefreshTokenSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken: token } = req.body;

    // Verify the existing refresh token
    const payload = verifyRefreshToken(token);

    // Generate new token pair
    const newPayload = {
      ...(payload.memberId && { memberId: payload.memberId }),
      ...(payload.adminId && { adminId: payload.adminId }),
      tenantId: payload.tenantId,
      role: payload.role,
    };

    const accessToken = generateAccessToken(newPayload);
    const refreshToken = generateRefreshToken(newPayload);

    res.status(200).json({
      success: true,
      data: {
        accessToken,
        refreshToken,
      },
    });
  })
);

// ─── POST /api/auth/admin/login ──────────────────────────────────────────────

router.post(
  '/admin/login',
  validate(AdminLoginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    const admin = await prisma.admin.findUnique({
      where: { email },
    });

    if (!admin) {
      throw ApiError.unauthorized('Email atau password salah');
    }

    const isPasswordValid = await comparePassword(password, admin.passwordHash);

    if (!isPasswordValid) {
      throw ApiError.unauthorized('Email atau password salah');
    }

    const tokenPayload = {
      adminId: admin.id,
      tenantId: admin.tenantId,
      role: 'admin' as const,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    res.status(200).json({
      success: true,
      data: {
        adminId: admin.id,
        accessToken,
        refreshToken,
      },
    });
  })
);

export default router;
