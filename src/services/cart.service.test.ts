import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateCartTotal, validateCartItems } from './cart.service';
import type { CartItem } from './cart.service';

// Mock Prisma
vi.mock('../config/database', () => ({
  default: {
    menuItem: {
      findMany: vi.fn(),
    },
  },
}));

import prisma from '../config/database';

describe('calculateCartTotal', () => {
  it('returns 0 for an empty array', () => {
    expect(calculateCartTotal([])).toBe(0);
  });

  it('sums price × quantity for available items only', () => {
    const items: CartItem[] = [
      { menuItemId: '1', quantity: 2, price: 25000, isAvailable: true },
      { menuItemId: '2', quantity: 1, price: 15000, isAvailable: true },
    ];
    expect(calculateCartTotal(items)).toBe(65000);
  });

  it('excludes unavailable items from total', () => {
    const items: CartItem[] = [
      { menuItemId: '1', quantity: 2, price: 25000, isAvailable: true },
      { menuItemId: '2', quantity: 3, price: 10000, isAvailable: false },
    ];
    // Only first item counts: 2 * 25000 = 50000
    expect(calculateCartTotal(items)).toBe(50000);
  });

  it('returns 0 when all items are unavailable', () => {
    const items: CartItem[] = [
      { menuItemId: '1', quantity: 1, price: 25000, isAvailable: false },
      { menuItemId: '2', quantity: 2, price: 10000, isAvailable: false },
    ];
    expect(calculateCartTotal(items)).toBe(0);
  });

  it('handles single item correctly', () => {
    const items: CartItem[] = [
      { menuItemId: '1', quantity: 5, price: 12000, isAvailable: true },
    ];
    expect(calculateCartTotal(items)).toBe(60000);
  });

  it('handles max quantity (99) correctly', () => {
    const items: CartItem[] = [
      { menuItemId: '1', quantity: 99, price: 10000, isAvailable: true },
    ];
    expect(calculateCartTotal(items)).toBe(990000);
  });
});

describe('validateCartItems', () => {
  const tenantId = 'tenant-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when items array is empty', async () => {
    await expect(validateCartItems(tenantId, [])).rejects.toThrow(
      'Keranjang tidak boleh kosong'
    );
  });

  it('throws when quantity is below 1', async () => {
    await expect(
      validateCartItems(tenantId, [{ menuItemId: 'item-1', quantity: 0 }])
    ).rejects.toThrow('Jumlah item harus antara 1 dan 99');
  });

  it('throws when quantity exceeds 99', async () => {
    await expect(
      validateCartItems(tenantId, [{ menuItemId: 'item-1', quantity: 100 }])
    ).rejects.toThrow('Jumlah item harus antara 1 dan 99');
  });

  it('throws when a menu item is not found', async () => {
    vi.mocked(prisma.menuItem.findMany).mockResolvedValue([]);

    await expect(
      validateCartItems(tenantId, [{ menuItemId: 'nonexistent', quantity: 1 }])
    ).rejects.toThrow('Item menu dengan ID nonexistent tidak ditemukan');
  });

  it('throws when a menu item belongs to a different tenant', async () => {
    vi.mocked(prisma.menuItem.findMany).mockResolvedValue([
      {
        id: 'item-1',
        categoryId: 'cat-1',
        tenantId: 'other-tenant',
        name: 'Nasi Goreng',
        description: null,
        price: 25000,
        imageUrl: null,
        isAvailable: true,
        sortOrder: 0,
        createdAt: new Date(),
      },
    ]);

    await expect(
      validateCartItems(tenantId, [{ menuItemId: 'item-1', quantity: 1 }])
    ).rejects.toThrow('Item menu "Nasi Goreng" bukan milik tenant ini');
  });

  it('returns enriched items with availability and total', async () => {
    vi.mocked(prisma.menuItem.findMany).mockResolvedValue([
      {
        id: 'item-1',
        categoryId: 'cat-1',
        tenantId,
        name: 'Nasi Goreng',
        description: null,
        price: 25000,
        imageUrl: null,
        isAvailable: true,
        sortOrder: 0,
        createdAt: new Date(),
      },
      {
        id: 'item-2',
        categoryId: 'cat-1',
        tenantId,
        name: 'Mie Ayam',
        description: null,
        price: 20000,
        imageUrl: null,
        isAvailable: true,
        sortOrder: 1,
        createdAt: new Date(),
      },
    ]);

    const result = await validateCartItems(tenantId, [
      { menuItemId: 'item-1', quantity: 2 },
      { menuItemId: 'item-2', quantity: 1 },
    ]);

    expect(result.validItems).toHaveLength(2);
    expect(result.validItems[0]).toEqual({
      menuItemId: 'item-1',
      name: 'Nasi Goreng',
      price: 25000,
      quantity: 2,
      isAvailable: true,
    });
    expect(result.validItems[1]).toEqual({
      menuItemId: 'item-2',
      name: 'Mie Ayam',
      price: 20000,
      quantity: 1,
      isAvailable: true,
    });
    expect(result.hasUnavailableItems).toBe(false);
    expect(result.total).toBe(70000); // 25000*2 + 20000*1
  });

  it('flags unavailable items and excludes them from total', async () => {
    vi.mocked(prisma.menuItem.findMany).mockResolvedValue([
      {
        id: 'item-1',
        categoryId: 'cat-1',
        tenantId,
        name: 'Nasi Goreng',
        description: null,
        price: 25000,
        imageUrl: null,
        isAvailable: true,
        sortOrder: 0,
        createdAt: new Date(),
      },
      {
        id: 'item-2',
        categoryId: 'cat-1',
        tenantId,
        name: 'Es Teh',
        description: null,
        price: 5000,
        imageUrl: null,
        isAvailable: false,
        sortOrder: 1,
        createdAt: new Date(),
      },
    ]);

    const result = await validateCartItems(tenantId, [
      { menuItemId: 'item-1', quantity: 1 },
      { menuItemId: 'item-2', quantity: 2 },
    ]);

    expect(result.hasUnavailableItems).toBe(true);
    expect(result.validItems[1].isAvailable).toBe(false);
    // Total only includes available items: 25000*1
    expect(result.total).toBe(25000);
  });
});
