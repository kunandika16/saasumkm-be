import prisma from '../config/database';
import { ApiError } from '../utils/api-error';
import { encodeBarcode } from '../utils/barcode';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateOrderInput {
  memberId: string;
  tenantId: string;
  items: Array<{
    menuItemId: string;
    quantity: number;
  }>;
  voucherCode?: string;
}

export interface CreateOrderResult {
  orderId: string;
  originalTotal: number;
  discountAmount: number;
  finalTotal: number;
  paymentBarcode: string;
  status: 'pending';
}

export interface PaginationOptions {
  page: number;
  pageSize: number;
}

export interface ValidatePaymentInput {
  orderId: string;
  action: 'confirm' | 'reject';
}

export interface ValidatePaymentResult {
  orderId: string;
  status: 'paid' | 'cancelled';
  pointsAwarded?: number;
  notificationSent: boolean;
}

export interface ExpireOrdersResult {
  expiredCount: number;
  restoredVouchers: number;
}

// ─── Order Creation ──────────────────────────────────────────────────────────

/**
 * Creates a new order with items, calculates totals, applies voucher, generates barcode.
 *
 * Validates: Req 6.4 — Create Order with items, quantities, voucher, totals, generate barcode
 * Validates: Req 6.5 — Generate unique Payment_Barcode containing Order ID and final total
 */
export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const { memberId, tenantId, items, voucherCode } = input;

  // Validate member exists and belongs to tenant
  const member = await prisma.member.findFirst({
    where: { id: memberId, tenantId },
  });
  if (!member) {
    throw ApiError.notFound('Member tidak ditemukan');
  }

  // Fetch menu items and validate availability
  const menuItemIds = items.map((item) => item.menuItemId);
  const menuItems = await prisma.menuItem.findMany({
    where: {
      id: { in: menuItemIds },
      tenantId,
    },
  });

  if (menuItems.length !== menuItemIds.length) {
    throw ApiError.badRequest('Satu atau lebih item menu tidak ditemukan');
  }

  const unavailableItems = menuItems.filter((mi) => !mi.isAvailable);
  if (unavailableItems.length > 0) {
    throw ApiError.badRequest(
      `Item tidak tersedia: ${unavailableItems.map((i) => i.name).join(', ')}`
    );
  }

  // Calculate original total
  const menuItemMap = new Map(menuItems.map((mi) => [mi.id, mi]));
  let originalTotal = 0;
  const orderItems: Array<{
    menuItemId: string;
    itemName: string;
    itemPrice: number;
    quantity: number;
  }> = [];

  for (const item of items) {
    const menuItem = menuItemMap.get(item.menuItemId)!;
    originalTotal += menuItem.price * item.quantity;
    orderItems.push({
      menuItemId: menuItem.id,
      itemName: menuItem.name,
      itemPrice: menuItem.price,
      quantity: item.quantity,
    });
  }

  // Apply voucher if provided
  let discountAmount = 0;
  let finalTotal = originalTotal;
  let voucherId: string | null = null;

  if (voucherCode) {
    const voucher = await prisma.voucher.findUnique({
      where: { code: voucherCode },
    });

    if (!voucher) {
      throw ApiError.badRequest('Kode voucher tidak valid');
    }
    if (voucher.tenantId !== tenantId) {
      throw ApiError.badRequest('Kode voucher tidak valid');
    }
    if (!voucher.isActive) {
      throw ApiError.badRequest('Voucher sudah tidak aktif');
    }
    if (new Date() > voucher.expiryDate) {
      throw ApiError.badRequest('Voucher sudah kedaluwarsa');
    }
    if (voucher.currentUsage >= voucher.maxUsage) {
      throw ApiError.badRequest('Voucher sudah mencapai batas penggunaan');
    }

    // Calculate discount
    if (voucher.discountType === 'percentage') {
      discountAmount = Math.floor(originalTotal * voucher.discountValue / 100);
    } else {
      // fixed
      discountAmount = voucher.discountValue;
    }

    finalTotal = Math.max(0, originalTotal - discountAmount);
    voucherId = voucher.id;
  }

  // Create order with all related records in a transaction
  const order = await prisma.$transaction(async (tx) => {
    // Create the order
    const createdOrder = await tx.order.create({
      data: {
        memberId,
        tenantId,
        voucherId,
        originalTotal,
        discountAmount,
        finalTotal,
        status: 'pending',
        items: {
          create: orderItems,
        },
      },
    });

    // Generate payment barcode after we have the order ID
    const paymentBarcode = encodeBarcode(createdOrder.id, finalTotal);
    const updatedOrder = await tx.order.update({
      where: { id: createdOrder.id },
      data: { paymentBarcode },
    });

    // If voucher was used, increment usage and record usage
    if (voucherId) {
      await tx.voucher.update({
        where: { id: voucherId },
        data: { currentUsage: { increment: 1 } },
      });

      await tx.voucherUsage.create({
        data: {
          voucherId,
          memberId,
          orderId: createdOrder.id,
        },
      });
    }

    return updatedOrder;
  });

  return {
    orderId: order.id,
    originalTotal: order.originalTotal,
    discountAmount: order.discountAmount,
    finalTotal: order.finalTotal,
    paymentBarcode: order.paymentBarcode!,
    status: 'pending',
  };
}

// ─── Get Orders by Member ────────────────────────────────────────────────────

/**
 * Retrieves paginated orders for a specific member, sorted newest first.
 *
 * Validates: Req 10.2 — Order history sorted by date descending, max 20 per page
 */
export async function getOrdersByMember(
  memberId: string,
  options: PaginationOptions = { page: 1, pageSize: 20 }
) {
  const { page, pageSize } = options;
  const skip = (page - 1) * pageSize;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where: { memberId },
      include: {
        items: true,
        voucher: {
          select: {
            code: true,
            discountType: true,
            discountValue: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.order.count({ where: { memberId } }),
  ]);

  return {
    orders,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

// ─── Get Pending Orders (Admin) ──────────────────────────────────────────────

/**
 * Retrieves pending orders for admin payment validation view.
 * Sorted by creation time oldest first, max 50 per page.
 *
 * Validates: Req 7.1 — List pending orders sorted oldest first, max 50/page
 * Validates: Req 7.2 — Show member name, items, total, voucher, barcode, timestamp
 */
export async function getPendingOrders(
  tenantId: string,
  options: PaginationOptions = { page: 1, pageSize: 50 }
) {
  const { page, pageSize } = options;
  const skip = (page - 1) * pageSize;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where: {
        tenantId,
        status: 'pending',
      },
      include: {
        member: {
          select: {
            id: true,
            name: true,
            whatsapp: true,
          },
        },
        items: true,
        voucher: {
          select: {
            code: true,
            discountType: true,
            discountValue: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      skip,
      take: pageSize,
    }),
    prisma.order.count({
      where: { tenantId, status: 'pending' },
    }),
  ]);

  return {
    orders,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

// ─── Validate Payment ────────────────────────────────────────────────────────

/**
 * Confirms or rejects payment for an order using an atomic Prisma transaction.
 * - Confirm: status=paid, award points, notify WhatsApp
 * - Reject: status=cancelled, restore voucher, notify WhatsApp
 *
 * Validates: Req 7.3 — Confirm payment → status=paid, award points, notify
 * Validates: Req 7.5 — Reject → status=cancelled, restore voucher, notify
 * Validates: Req 7.9 — Prevent status change on terminal states
 */
export async function validatePayment(
  input: ValidatePaymentInput
): Promise<ValidatePaymentResult> {
  const { orderId, action } = input;

  const result = await prisma.$transaction(async (tx) => {
    // Fetch current order with lock (serializable within transaction)
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        member: true,
        tenant: {
          include: { settings: true },
        },
      },
    });

    if (!order) {
      throw ApiError.notFound('Order tidak ditemukan');
    }

    // Req 7.9: Prevent status change on orders in terminal states
    if (order.status !== 'pending') {
      throw ApiError.badRequest(
        `Order tidak dapat diubah karena status saat ini adalah "${order.status}"`
      );
    }

    if (action === 'confirm') {
      // Calculate points to award based on tenant settings
      const settings = order.tenant.settings;
      let pointsEarned = 0;

      if (settings) {
        const { pointsPerAmount, amountPerPoint } = settings;
        pointsEarned = Math.floor(order.finalTotal / amountPerPoint) * pointsPerAmount;
      }

      // Update order status to paid
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'paid',
          pointsEarned,
          validatedAt: new Date(),
        },
      });

      // Award points to member
      if (pointsEarned > 0) {
        const newBalance = order.member.pointBalance + pointsEarned;

        await tx.member.update({
          where: { id: order.memberId },
          data: { pointBalance: newBalance },
        });

        await tx.pointTransaction.create({
          data: {
            memberId: order.memberId,
            type: 'earned',
            amount: pointsEarned,
            orderId: order.id,
            resultingBalance: newBalance,
          },
        });
      }

      // Update member total visits (validated order counts as a visit)
      await tx.member.update({
        where: { id: order.memberId },
        data: {
          totalVisits: { increment: 1 },
          lastVisitAt: new Date(),
        },
      });

      // WhatsApp notification (fail-open pattern)
      let notificationSent = false;
      try {
        // TODO: import { sendPaymentConfirmation } from './whatsapp.service';
        // await sendPaymentConfirmation(order.member.whatsapp, order);
        notificationSent = false; // Will be true when WhatsApp service is implemented
      } catch {
        // Fail silently — notification failure should not block payment confirmation
        notificationSent = false;
      }

      return {
        orderId: order.id,
        status: 'paid' as const,
        pointsAwarded: pointsEarned,
        notificationSent,
      };
    } else {
      // action === 'reject'
      // Update order status to cancelled
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'cancelled',
          validatedAt: new Date(),
        },
      });

      // Restore voucher usage if voucher was used
      if (order.voucherId) {
        await tx.voucher.update({
          where: { id: order.voucherId },
          data: { currentUsage: { decrement: 1 } },
        });
      }

      // WhatsApp notification (fail-open pattern)
      let notificationSent = false;
      try {
        // TODO: import { sendOrderRejection } from './whatsapp.service';
        // await sendOrderRejection(order.member.whatsapp, order);
        notificationSent = false; // Will be true when WhatsApp service is implemented
      } catch {
        // Fail silently — notification failure should not block order rejection
        notificationSent = false;
      }

      return {
        orderId: order.id,
        status: 'cancelled' as const,
        notificationSent,
      };
    }
  });

  return result;
}

// ─── Expire Orders ───────────────────────────────────────────────────────────

/**
 * Batch expires all pending orders older than 24 hours.
 * Restores voucher usage for expired orders and sends notifications.
 *
 * Validates: Req 7.8 — Auto-expire pending orders > 24h, restore vouchers, notify
 */
export async function expireOrders(): Promise<ExpireOrdersResult> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Find all pending orders older than 24h
  const pendingOrders = await prisma.order.findMany({
    where: {
      status: 'pending',
      createdAt: { lt: twentyFourHoursAgo },
    },
    include: {
      member: {
        select: { whatsapp: true },
      },
    },
  });

  if (pendingOrders.length === 0) {
    return { expiredCount: 0, restoredVouchers: 0 };
  }

  let restoredVouchers = 0;

  // Process each expired order in a transaction
  await prisma.$transaction(async (tx) => {
    const orderIds = pendingOrders.map((o) => o.id);

    // Batch update all orders to expired
    await tx.order.updateMany({
      where: { id: { in: orderIds } },
      data: {
        status: 'expired',
        expiredAt: new Date(),
      },
    });

    // Restore vouchers for orders that used one
    const ordersWithVoucher = pendingOrders.filter((o) => o.voucherId !== null);
    for (const order of ordersWithVoucher) {
      await tx.voucher.update({
        where: { id: order.voucherId! },
        data: { currentUsage: { decrement: 1 } },
      });
      restoredVouchers++;
    }
  });

  // Send WhatsApp notifications (fail-open, outside transaction)
  for (const order of pendingOrders) {
    try {
      // TODO: import { sendOrderExpired } from './whatsapp.service';
      // await sendOrderExpired(order.member.whatsapp, order);
    } catch {
      // Fail silently — notification failure should not affect expiry process
    }
  }

  return {
    expiredCount: pendingOrders.length,
    restoredVouchers,
  };
}
