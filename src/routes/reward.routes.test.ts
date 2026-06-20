import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '../utils/api-error';

// Mock Prisma
vi.mock('../config/database', () => {
  return {
    default: {
      reward: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        findFirst: vi.fn(),
      },
      member: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      pointTransaction: {
        create: vi.fn(),
      },
      rewardVoucher: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
      },
      order: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

import prisma from '../config/database';
import { redeemRewardWithVoucher, createReward } from '../services/reward.service';
import { validateRewardVoucher } from '../services/reward-voucher.service';

describe('Reward Routes - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Redemption Endpoint Error Responses
  // Validates: Requirements 4.2, 4.4, 8.2
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Redemption errors (redeemRewardWithVoucher)', () => {
    const mockMember = {
      id: 'member-1',
      tenantId: 'tenant-1',
      pointBalance: 100,
    };

    const mockReward = {
      id: 'reward-1',
      tenantId: 'tenant-1',
      name: 'Free Espresso',
      requiredPoints: 50,
      stockQuantity: 5,
      isActive: true,
      menuItemId: 'menu-item-1',
      discountType: 'free',
      discountSubType: null,
      discountValue: null,
      menuItem: { id: 'menu-item-1', name: 'Espresso', isAvailable: true },
    };

    it('rejects with "Poin tidak mencukupi" when member has insufficient points', async () => {
      // Member has 30 points but reward requires 50
      vi.mocked(prisma.member.findUnique).mockResolvedValue({
        ...mockMember,
        pointBalance: 30,
      } as any);
      vi.mocked(prisma.reward.findUnique).mockResolvedValue(mockReward as any);

      await expect(
        redeemRewardWithVoucher('member-1', 'reward-1')
      ).rejects.toThrow('Poin tidak mencukupi. Saldo: 30, Dibutuhkan: 50');

      // Verify error is ApiError with 400 status
      try {
        await redeemRewardWithVoucher('member-1', 'reward-1');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(400);
      }
    });

    it('rejects with "Stok reward sudah habis" when stock is 0', async () => {
      vi.mocked(prisma.member.findUnique).mockResolvedValue(mockMember as any);
      vi.mocked(prisma.reward.findUnique).mockResolvedValue({
        ...mockReward,
        stockQuantity: 0,
      } as any);

      await expect(
        redeemRewardWithVoucher('member-1', 'reward-1')
      ).rejects.toThrow('Stok reward sudah habis');

      try {
        await redeemRewardWithVoucher('member-1', 'reward-1');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(400);
      }
    });

    it('rejects with "Reward sedang tidak tersedia" when reward is inactive', async () => {
      vi.mocked(prisma.member.findUnique).mockResolvedValue(mockMember as any);
      vi.mocked(prisma.reward.findUnique).mockResolvedValue({
        ...mockReward,
        isActive: false,
      } as any);

      await expect(
        redeemRewardWithVoucher('member-1', 'reward-1')
      ).rejects.toThrow('Reward sedang tidak tersedia');

      try {
        await redeemRewardWithVoucher('member-1', 'reward-1');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(400);
      }
    });

    it('rejects with "Menu item sedang tidak tersedia" when linked menu item is unavailable', async () => {
      vi.mocked(prisma.member.findUnique).mockResolvedValue(mockMember as any);
      vi.mocked(prisma.reward.findUnique).mockResolvedValue({
        ...mockReward,
        menuItem: { id: 'menu-item-1', name: 'Espresso', isAvailable: false },
      } as any);

      await expect(
        redeemRewardWithVoucher('member-1', 'reward-1')
      ).rejects.toThrow('Menu item sedang tidak tersedia');

      try {
        await redeemRewardWithVoucher('member-1', 'reward-1');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(400);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Voucher Validation Endpoint Error Responses
  // Validates: Requirements 6.4, 6.5
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Voucher validation errors (validateRewardVoucher)', () => {
    it('returns error "Kode voucher reward tidak valid" when voucher code not found', async () => {
      vi.mocked(prisma.rewardVoucher.findUnique).mockResolvedValue(null);

      const result = await validateRewardVoucher('INVALID-CODE', 'tenant-1');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Kode voucher reward tidak valid');
    });

    it('returns error "Kode voucher reward tidak valid" when voucher belongs to different tenant', async () => {
      vi.mocked(prisma.rewardVoucher.findUnique).mockResolvedValue({
        id: 'voucher-1',
        tenantId: 'tenant-2', // Different tenant
        code: 'RW-ABC123',
        isUsed: false,
        expiryDate: new Date(Date.now() + 86400000), // tomorrow
        menuItem: { id: 'menu-1', name: 'Espresso' },
      } as any);

      const result = await validateRewardVoucher('RW-ABC123', 'tenant-1');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Kode voucher reward tidak valid');
    });

    it('returns error "Voucher reward sudah digunakan" when voucher has already been used', async () => {
      vi.mocked(prisma.rewardVoucher.findUnique).mockResolvedValue({
        id: 'voucher-1',
        tenantId: 'tenant-1',
        code: 'RW-ABC123',
        isUsed: true, // Already used
        usedAt: new Date(),
        expiryDate: new Date(Date.now() + 86400000),
        menuItem: { id: 'menu-1', name: 'Espresso' },
      } as any);

      const result = await validateRewardVoucher('RW-ABC123', 'tenant-1');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Voucher reward sudah digunakan');
    });

    it('returns error "Voucher reward sudah kedaluwarsa" when voucher has expired', async () => {
      vi.mocked(prisma.rewardVoucher.findUnique).mockResolvedValue({
        id: 'voucher-1',
        tenantId: 'tenant-1',
        code: 'RW-ABC123',
        isUsed: false,
        expiryDate: new Date(Date.now() - 86400000), // yesterday (expired)
        menuItem: { id: 'menu-1', name: 'Espresso' },
      } as any);

      const result = await validateRewardVoucher('RW-ABC123', 'tenant-1');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Voucher reward sudah kedaluwarsa');
    });

    it('returns valid when voucher passes all validation checks', async () => {
      const mockVoucher = {
        id: 'voucher-1',
        tenantId: 'tenant-1',
        code: 'RW-ABC123',
        isUsed: false,
        expiryDate: new Date(Date.now() + 86400000 * 5), // 5 days from now
        menuItemId: 'menu-1',
        menuItem: { id: 'menu-1', name: 'Espresso' },
      };
      vi.mocked(prisma.rewardVoucher.findUnique).mockResolvedValue(mockVoucher as any);

      const result = await validateRewardVoucher('RW-ABC123', 'tenant-1');

      expect(result.valid).toBe(true);
      expect(result.voucher).toEqual(mockVoucher);
      expect(result.error).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Admin Create Reward with All New Fields
  // Validates: Requirements 2.7
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Admin create reward (createReward)', () => {
    it('creates a reward with all new fields including menuItemId, discountType, imageUrl', async () => {
      const input = {
        tenantId: 'tenant-1',
        name: 'Free Latte',
        description: 'Get a free latte!',
        requiredPoints: 80,
        stockQuantity: 20,
        isActive: true,
        menuItemId: 'menu-item-latte',
        discountType: 'free' as const,
        imageUrl: 'https://r2.example.com/rewards/abc.jpg',
      };

      const mockCreatedReward = {
        id: 'reward-new-1',
        ...input,
        discountSubType: null,
        discountValue: null,
        createdAt: new Date(),
      };
      vi.mocked(prisma.reward.create).mockResolvedValue(mockCreatedReward as any);

      const result = await createReward(input);

      expect(prisma.reward.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          name: 'Free Latte',
          description: 'Get a free latte!',
          requiredPoints: 80,
          stockQuantity: 20,
          isActive: true,
          menuItemId: 'menu-item-latte',
          discountType: 'free',
          discountSubType: null,
          discountValue: null,
          imageUrl: 'https://r2.example.com/rewards/abc.jpg',
        },
      });
      expect(result).toEqual(mockCreatedReward);
    });

    it('creates a reward with discount type "discount" and sub-type "fixed"', async () => {
      const input = {
        tenantId: 'tenant-1',
        name: '10k Off Coffee',
        description: 'Get 10000 off your coffee',
        requiredPoints: 40,
        stockQuantity: 15,
        isActive: true,
        menuItemId: 'menu-item-coffee',
        discountType: 'discount' as const,
        discountSubType: 'fixed' as const,
        discountValue: 10000,
        imageUrl: 'https://r2.example.com/rewards/discount.png',
      };

      const mockCreatedReward = {
        id: 'reward-new-2',
        ...input,
        createdAt: new Date(),
      };
      vi.mocked(prisma.reward.create).mockResolvedValue(mockCreatedReward as any);

      const result = await createReward(input);

      expect(prisma.reward.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          name: '10k Off Coffee',
          description: 'Get 10000 off your coffee',
          requiredPoints: 40,
          stockQuantity: 15,
          isActive: true,
          menuItemId: 'menu-item-coffee',
          discountType: 'discount',
          discountSubType: 'fixed',
          discountValue: 10000,
          imageUrl: 'https://r2.example.com/rewards/discount.png',
        },
      });
      expect(result).toEqual(mockCreatedReward);
    });

    it('creates a reward with discount type "discount" and sub-type "percentage"', async () => {
      const input = {
        tenantId: 'tenant-1',
        name: '25% Off Smoothie',
        description: '25 percent off smoothie',
        requiredPoints: 60,
        stockQuantity: 8,
        isActive: true,
        menuItemId: 'menu-item-smoothie',
        discountType: 'discount' as const,
        discountSubType: 'percentage' as const,
        discountValue: 25,
      };

      const mockCreatedReward = {
        id: 'reward-new-3',
        ...input,
        imageUrl: null,
        createdAt: new Date(),
      };
      vi.mocked(prisma.reward.create).mockResolvedValue(mockCreatedReward as any);

      const result = await createReward(input);

      expect(prisma.reward.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          name: '25% Off Smoothie',
          description: '25 percent off smoothie',
          requiredPoints: 60,
          stockQuantity: 8,
          isActive: true,
          menuItemId: 'menu-item-smoothie',
          discountType: 'discount',
          discountSubType: 'percentage',
          discountValue: 25,
          imageUrl: null,
        },
      });
      expect(result).toEqual(mockCreatedReward);
    });

    it('defaults imageUrl to null when not provided', async () => {
      const input = {
        tenantId: 'tenant-1',
        name: 'No Image Reward',
        requiredPoints: 30,
        stockQuantity: 10,
        menuItemId: 'menu-item-1',
        discountType: 'free' as const,
      };

      const mockCreatedReward = {
        id: 'reward-new-4',
        ...input,
        description: '',
        isActive: true,
        discountSubType: null,
        discountValue: null,
        imageUrl: null,
        createdAt: new Date(),
      };
      vi.mocked(prisma.reward.create).mockResolvedValue(mockCreatedReward as any);

      await createReward(input);

      expect(prisma.reward.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          imageUrl: null,
        }),
      });
    });
  });
});
