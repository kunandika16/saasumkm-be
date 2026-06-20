import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  member: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  menuItem: {
    findMany: vi.fn(),
  },
  order: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  voucher: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  voucherUsage: {
    create: vi.fn(),
  },
  pointTransaction: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('../config/database', () => ({
  default: mockPrisma,
}));

import { createOrder, validatePayment, expireOrders } from './order.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createOrder', () => {
  const baseInput = {
    memberId: 'member-1',
    tenantId: 'tenant-1',
    items: [{ menuItemId: 'menu-1', quantity: 2 }],
    paymentMethod: 'cash' as const,
  };

  it('throws if member not found', async () => {
    mockPrisma.member.findFirst.mockResolvedValue(null);

    await expect(createOrder(baseInput)).rejects.toThrow('Member tidak ditemukan');
  });

  it('throws if menu item not found', async () => {
    mockPrisma.member.findFirst.mockResolvedValue({ id: 'member-1' } as any);
    mockPrisma.menuItem.findMany.mockResolvedValue([]);

    await expect(createOrder(baseInput)).rejects.toThrow(
      'Satu atau lebih item menu tidak ditemukan'
    );
  });

  it('throws if menu item is unavailable', async () => {
    mockPrisma.member.findFirst.mockResolvedValue({ id: 'member-1' } as any);
    mockPrisma.menuItem.findMany.mockResolvedValue([
      { id: 'menu-1', name: 'Nasi Goreng', price: 25000, isAvailable: false, tenantId: 'tenant-1' },
    ] as any);

    await expect(createOrder(baseInput)).rejects.toThrow('Item tidak tersedia');
  });

  it('creates order with correct totals (no voucher)', async () => {
    mockPrisma.member.findFirst.mockResolvedValue({ id: 'member-1' } as any);
    mockPrisma.menuItem.findMany.mockResolvedValue([
      { id: 'menu-1', name: 'Nasi Goreng', price: 25000, isAvailable: true, tenantId: 'tenant-1' },
    ] as any);

    const createdOrder = {
      id: 'order-1',
      originalTotal: 50000,
      discountAmount: 0,
      finalTotal: 50000,
      paymentMethod: 'cash',
      status: 'pending',
    };

    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        order: {
          create: vi.fn().mockResolvedValue(createdOrder),
        },
        voucher: { update: vi.fn() },
        voucherUsage: { create: vi.fn() },
      };
      return fn(tx);
    });

    const result = await createOrder(baseInput);

    expect(result.originalTotal).toBe(50000); // 25000 * 2
    expect(result.discountAmount).toBe(0);
    expect(result.finalTotal).toBe(50000);
    expect(result.status).toBe('pending');
  });

  it('applies percentage voucher discount correctly', async () => {
    mockPrisma.member.findFirst.mockResolvedValue({ id: 'member-1' } as any);
    mockPrisma.menuItem.findMany.mockResolvedValue([
      { id: 'menu-1', name: 'Nasi Goreng', price: 25000, isAvailable: true, tenantId: 'tenant-1' },
    ] as any);
    mockPrisma.voucher.findUnique.mockResolvedValue({
      id: 'voucher-1',
      code: 'DISC10',
      tenantId: 'tenant-1',
      discountType: 'percentage',
      discountValue: 10,
      isActive: true,
      expiryDate: new Date(Date.now() + 86400000),
      currentUsage: 0,
      maxUsage: 10,
    } as any);

    const createdOrder = {
      id: 'order-1',
      originalTotal: 50000,
      discountAmount: 5000,
      finalTotal: 45000,
      paymentMethod: 'cash',
      status: 'pending',
    };

    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        order: {
          create: vi.fn().mockResolvedValue(createdOrder),
                  },
        voucher: { update: vi.fn() },
        voucherUsage: { create: vi.fn() },
      };
      return fn(tx);
    });

    const result = await createOrder({
      ...baseInput,
      voucherCode: 'DISC10',
    });

    // 25000 * 2 = 50000, 10% = 5000 discount
    expect(result.originalTotal).toBe(50000);
    expect(result.discountAmount).toBe(5000);
    expect(result.finalTotal).toBe(45000);
  });

  it('applies fixed voucher discount correctly', async () => {
    mockPrisma.member.findFirst.mockResolvedValue({ id: 'member-1' } as any);
    mockPrisma.menuItem.findMany.mockResolvedValue([
      { id: 'menu-1', name: 'Nasi Goreng', price: 25000, isAvailable: true, tenantId: 'tenant-1' },
    ] as any);
    mockPrisma.voucher.findUnique.mockResolvedValue({
      id: 'voucher-1',
      code: 'FLAT5K',
      tenantId: 'tenant-1',
      discountType: 'fixed',
      discountValue: 5000,
      isActive: true,
      expiryDate: new Date(Date.now() + 86400000),
      currentUsage: 0,
      maxUsage: 10,
    } as any);

    const createdOrder = {
      id: 'order-1',
      originalTotal: 50000,
      discountAmount: 5000,
      finalTotal: 45000,
      paymentMethod: 'cash',
      status: 'pending',
    };

    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        order: {
          create: vi.fn().mockResolvedValue(createdOrder),
                  },
        voucher: { update: vi.fn() },
        voucherUsage: { create: vi.fn() },
      };
      return fn(tx);
    });

    const result = await createOrder({
      ...baseInput,
      voucherCode: 'FLAT5K',
    });

    expect(result.discountAmount).toBe(5000);
    expect(result.finalTotal).toBe(45000);
  });

  it('rejects expired voucher', async () => {
    mockPrisma.member.findFirst.mockResolvedValue({ id: 'member-1' } as any);
    mockPrisma.menuItem.findMany.mockResolvedValue([
      { id: 'menu-1', name: 'Nasi Goreng', price: 25000, isAvailable: true, tenantId: 'tenant-1' },
    ] as any);
    mockPrisma.voucher.findUnique.mockResolvedValue({
      id: 'voucher-1',
      code: 'EXPIRED',
      tenantId: 'tenant-1',
      discountType: 'percentage',
      discountValue: 10,
      isActive: true,
      expiryDate: new Date(Date.now() - 86400000), // Yesterday
      currentUsage: 0,
      maxUsage: 10,
    } as any);

    await expect(
      createOrder({ ...baseInput, voucherCode: 'EXPIRED' })
    ).rejects.toThrow('Voucher sudah kedaluwarsa');
  });

  it('rejects voucher with maxed usage', async () => {
    mockPrisma.member.findFirst.mockResolvedValue({ id: 'member-1' } as any);
    mockPrisma.menuItem.findMany.mockResolvedValue([
      { id: 'menu-1', name: 'Nasi Goreng', price: 25000, isAvailable: true, tenantId: 'tenant-1' },
    ] as any);
    mockPrisma.voucher.findUnique.mockResolvedValue({
      id: 'voucher-1',
      code: 'MAXED',
      tenantId: 'tenant-1',
      discountType: 'fixed',
      discountValue: 5000,
      isActive: true,
      expiryDate: new Date(Date.now() + 86400000),
      currentUsage: 10,
      maxUsage: 10,
    } as any);

    await expect(
      createOrder({ ...baseInput, voucherCode: 'MAXED' })
    ).rejects.toThrow('Voucher sudah mencapai batas penggunaan');
  });
});

describe('validatePayment', () => {
  it('throws if order not found', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        order: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
        member: { update: vi.fn() },
        voucher: { update: vi.fn() },
        pointTransaction: { create: vi.fn() },
      };
      return fn(tx);
    });

    await expect(
      validatePayment({ orderId: 'no-exist', action: 'confirm' })
    ).rejects.toThrow('Order tidak ditemukan');
  });

  it('throws if order is not in pending state', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        order: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'order-1',
            status: 'paid',
            member: { whatsapp: '08123456789' },
            tenant: { settings: null },
          }),
          update: vi.fn(),
        },
        member: { update: vi.fn() },
        voucher: { update: vi.fn() },
        pointTransaction: { create: vi.fn() },
      };
      return fn(tx);
    });

    await expect(
      validatePayment({ orderId: 'order-1', action: 'confirm' })
    ).rejects.toThrow('Order tidak dapat diubah karena status saat ini adalah "paid"');
  });

  it('confirms payment, awards points, and returns result', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        order: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'order-1',
            status: 'pending',
            memberId: 'member-1',
            finalTotal: 50000,
            voucherId: null,
            member: { id: 'member-1', pointBalance: 10, whatsapp: '08123456789' },
            tenant: {
              settings: { pointsPerAmount: 1, amountPerPoint: 10000 },
            },
          }),
          update: vi.fn(),
        },
        member: { update: vi.fn() },
        voucher: { update: vi.fn() },
        pointTransaction: { create: vi.fn() },
      };
      return fn(tx);
    });

    const result = await validatePayment({ orderId: 'order-1', action: 'confirm' });

    expect(result.status).toBe('paid');
    expect(result.pointsAwarded).toBe(5); // floor(50000 / 10000) * 1 = 5
    expect(result.orderId).toBe('order-1');
  });

  it('rejects order and restores voucher', async () => {
    const voucherUpdate = vi.fn();
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        order: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'order-1',
            status: 'pending',
            memberId: 'member-1',
            finalTotal: 50000,
            voucherId: 'voucher-1',
            member: { id: 'member-1', whatsapp: '08123456789' },
            tenant: { settings: null },
          }),
          update: vi.fn(),
        },
        member: { update: vi.fn() },
        voucher: { update: voucherUpdate },
        pointTransaction: { create: vi.fn() },
        rewardVoucher: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
      };
      return fn(tx);
    });

    const result = await validatePayment({ orderId: 'order-1', action: 'reject' });

    expect(result.status).toBe('cancelled');
    expect(voucherUpdate).toHaveBeenCalledWith({
      where: { id: 'voucher-1' },
      data: { currentUsage: { decrement: 1 } },
    });
  });

  it('prevents status change on expired order', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        order: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'order-1',
            status: 'expired',
            member: { whatsapp: '08123456789' },
            tenant: { settings: null },
          }),
          update: vi.fn(),
        },
        member: { update: vi.fn() },
        voucher: { update: vi.fn() },
        pointTransaction: { create: vi.fn() },
      };
      return fn(tx);
    });

    await expect(
      validatePayment({ orderId: 'order-1', action: 'confirm' })
    ).rejects.toThrow('Order tidak dapat diubah karena status saat ini adalah "expired"');
  });
});

describe('expireOrders', () => {
  it('returns 0 when no pending orders exist', async () => {
    mockPrisma.order.findMany.mockResolvedValue([]);

    const result = await expireOrders();

    expect(result.expiredCount).toBe(0);
    expect(result.restoredVouchers).toBe(0);
  });

  it('expires orders and restores vouchers', async () => {
    const oldOrders = [
      { id: 'order-1', voucherId: 'voucher-1', member: { whatsapp: '081234' } },
      { id: 'order-2', voucherId: null, member: { whatsapp: '081235' } },
      { id: 'order-3', voucherId: 'voucher-2', member: { whatsapp: '081236' } },
    ];

    mockPrisma.order.findMany.mockResolvedValue(oldOrders as any);

    const voucherUpdate = vi.fn();
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        order: { updateMany: vi.fn() },
        voucher: { update: voucherUpdate },
      };
      return fn(tx);
    });

    const result = await expireOrders();

    expect(result.expiredCount).toBe(3);
    expect(result.restoredVouchers).toBe(2);
    expect(voucherUpdate).toHaveBeenCalledTimes(2);
  });
});
