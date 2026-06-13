import prisma from '../config/database';
import { ApiError } from '../utils/api-error';
import { DiscountType, Voucher } from '@prisma/client';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface CreateVoucherInput {
  tenantId: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  expiryDate: Date;
  maxUsage: number;
}

export interface ApplyVoucherResult {
  discountAmount: number;
  finalTotal: number;
}

export interface VoucherWithStats extends Voucher {
  totalIssued: number;
  totalRedeemed: number;
  remaining: number;
  redemptionRate: number;
}

// ─── Service Functions ───────────────────────────────────────────────────────

/**
 * Creates a new voucher for a tenant.
 * Validates code uniqueness before creation.
 *
 * Validates: Req 9.1 — create voucher with code, discountType, discountValue, expiryDate, maxUsage.
 * Validates: Req 9.4 — reject duplicate voucher code.
 */
export async function createVoucher(data: CreateVoucherInput): Promise<Voucher> {
  const { tenantId, code, discountType, discountValue, expiryDate, maxUsage } = data;

  // Check for duplicate code
  const existing = await prisma.voucher.findUnique({
    where: { code },
  });

  if (existing) {
    throw ApiError.badRequest('Kode voucher sudah digunakan');
  }

  const voucher = await prisma.voucher.create({
    data: {
      tenantId,
      code,
      discountType,
      discountValue,
      expiryDate,
      maxUsage,
    },
  });

  return voucher;
}

/**
 * Validates a voucher code for a given tenant.
 * Checks existence, active status, expiry, and usage limit.
 *
 * Validates: Req 6.3 — invalid/expired/fully-used → specific error reason.
 * Validates: Req 9.6 — reject if maxUsage reached.
 * Validates: Req 9.8 — deactivated voucher cannot be used.
 */
export async function validateVoucher(code: string, tenantId: string): Promise<Voucher> {
  const voucher = await prisma.voucher.findFirst({
    where: { code, tenantId },
  });

  if (!voucher) {
    throw ApiError.badRequest('Kode voucher tidak valid');
  }

  if (!voucher.isActive) {
    throw ApiError.badRequest('Voucher sudah tidak aktif');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (voucher.expiryDate < today) {
    throw ApiError.badRequest('Voucher sudah kedaluwarsa');
  }

  if (voucher.currentUsage >= voucher.maxUsage) {
    throw ApiError.badRequest('Voucher sudah mencapai batas penggunaan');
  }

  return voucher;
}

/**
 * Calculates the discount amount and final total after applying a voucher.
 * Uses Math.floor for percentage to avoid fractional IDR.
 * Ensures finalTotal never goes below 0.
 *
 * Validates: Req 6.2 — apply discount (percentage or fixed), final total ≥ 0.
 */
export function applyVoucher(
  total: number,
  voucher: { discountType: DiscountType; discountValue: number }
): ApplyVoucherResult {
  let discountAmount: number;

  if (voucher.discountType === 'percentage') {
    discountAmount = Math.floor(total * voucher.discountValue / 100);
  } else {
    discountAmount = voucher.discountValue;
  }

  const finalTotal = Math.max(0, total - discountAmount);

  return { discountAmount, finalTotal };
}

/**
 * Generates a welcome voucher for a new member based on tenant settings.
 * Returns null if welcome voucher is not configured for the tenant.
 *
 * Validates: Req 9.7 — auto-generate welcome voucher on registration using admin config.
 */
export async function generateWelcomeVoucher(
  tenantId: string,
  memberId: string
): Promise<Voucher | null> {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
  });

  if (
    !settings ||
    !settings.welcomeVoucherType ||
    !settings.welcomeVoucherValue ||
    !settings.welcomeVoucherDays
  ) {
    return null;
  }

  // Generate unique code: WELCOME + 6 random alphanumeric characters
  const randomPart = generateRandomAlphanumeric(6);
  const code = `WELCOME${randomPart}`;

  // Calculate expiry date
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + settings.welcomeVoucherDays);

  const voucher = await prisma.voucher.create({
    data: {
      tenantId,
      code,
      discountType: settings.welcomeVoucherType as DiscountType,
      discountValue: settings.welcomeVoucherValue,
      expiryDate,
      maxUsage: 1,
      isWelcomeVoucher: true,
      issuedToMemberId: memberId,
    },
  });

  return voucher;
}

/**
 * Restores a voucher's usage count by decrementing currentUsage by 1.
 * Used when an order using the voucher is cancelled or expired.
 * Ensures currentUsage never goes below 0.
 *
 * Validates: Req 9.5 — usage count management (restore on cancel/expire).
 */
export async function restoreVoucher(voucherId: string): Promise<void> {
  const voucher = await prisma.voucher.findUnique({
    where: { id: voucherId },
  });

  if (!voucher) {
    return;
  }

  const newUsage = Math.max(0, voucher.currentUsage - 1);

  await prisma.voucher.update({
    where: { id: voucherId },
    data: { currentUsage: newUsage },
  });
}

/**
 * Deactivates a voucher, preventing further redemptions.
 *
 * Validates: Req 9.8 — admin can deactivate voucher.
 */
export async function deactivateVoucher(voucherId: string): Promise<Voucher> {
  const voucher = await prisma.voucher.findUnique({
    where: { id: voucherId },
  });

  if (!voucher) {
    throw ApiError.notFound('Voucher tidak ditemukan');
  }

  const updated = await prisma.voucher.update({
    where: { id: voucherId },
    data: { isActive: false },
  });

  return updated;
}

/**
 * Retrieves all vouchers for a tenant with computed statistics.
 *
 * Validates: Req 9.9 — display voucher stats (total issued, redeemed, remaining, redemption rate).
 */
export async function getVoucherStats(tenantId: string): Promise<VoucherWithStats[]> {
  const vouchers = await prisma.voucher.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });

  return vouchers.map((voucher) => ({
    ...voucher,
    totalIssued: voucher.maxUsage,
    totalRedeemed: voucher.currentUsage,
    remaining: voucher.maxUsage - voucher.currentUsage,
    redemptionRate: voucher.maxUsage > 0
      ? Math.round((voucher.currentUsage / voucher.maxUsage) * 100)
      : 0,
  }));
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Generates a random alphanumeric string of specified length.
 */
function generateRandomAlphanumeric(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
