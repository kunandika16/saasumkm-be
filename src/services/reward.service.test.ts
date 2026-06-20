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
      },
      member: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      pointTransaction: {
        create: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

import prisma from '../config/database';
import {
  createReward,
  getRewards,
  getRedeemableRewards,
  redeemReward,
  updateReward,
} from './reward.service';

describe('reward.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createReward', () => {
    it('creates a reward with all fields', async () => {
      const input = {
        tenantId: 'tenant-1',
        name: 'Free Coffee',
        description: 'A free coffee reward',
        requiredPoints: 50,
        stockQuantity: 10,
        isActive: true,
        menuItemId: 'menu-item-1',
        discountType: 'free' as const,
      };

      const mockReward = { id: 'reward-1', ...input, createdAt: new Date() };
      vi.mocked(prisma.reward.create).mockResolvedValue(mockReward as any);

      const result = await createReward(input);

      expect(prisma.reward.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          name: 'Free Coffee',
          description: 'A free coffee reward',
          requiredPoints: 50,
          stockQuantity: 10,
          isActive: true,
          menuItemId: 'menu-item-1',
          discountType: 'free',
          discountSubType: null,
          discountValue: null,
          imageUrl: null,
        },
      });
      expect(result).toEqual(mockReward);
    });

    it('defaults isActive to true and description to empty string', async () => {
      const input = {
        tenantId: 'tenant-1',
        name: 'Discount',
        requiredPoints: 100,
        stockQuantity: 5,
        menuItemId: 'menu-item-2',
        discountType: 'discount' as const,
        discountSubType: 'percentage' as const,
        discountValue: 20,
      };

      const mockReward = {
        id: 'reward-2',
        ...input,
        description: '',
        isActive: true,
        createdAt: new Date(),
      };
      vi.mocked(prisma.reward.create).mockResolvedValue(mockReward as any);

      await createReward(input);

      expect(prisma.reward.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          name: 'Discount',
          description: '',
          requiredPoints: 100,
          stockQuantity: 5,
          isActive: true,
          menuItemId: 'menu-item-2',
          discountType: 'discount',
          discountSubType: 'percentage',
          discountValue: 20,
          imageUrl: null,
        },
      });
    });
  });

  describe('getRewards', () => {
    it('returns rewards for tenant sorted by createdAt desc', async () => {
      const mockRewards = [
        { id: 'r1', name: 'Reward 1', createdAt: new Date('2024-02-01') },
        { id: 'r2', name: 'Reward 2', createdAt: new Date('2024-01-01') },
      ];
      vi.mocked(prisma.reward.findMany).mockResolvedValue(mockRewards as any);

      const result = await getRewards('tenant-1');

      expect(prisma.reward.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockRewards);
    });
  });

  describe('getRedeemableRewards', () => {
    it('filters by isActive, affordable points, and stock > 0', async () => {
      const mockRewards = [
        { id: 'r1', requiredPoints: 30, stockQuantity: 5, isActive: true },
      ];
      vi.mocked(prisma.reward.findMany).mockResolvedValue(mockRewards as any);

      const result = await getRedeemableRewards('tenant-1', 50);

      expect(prisma.reward.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          isActive: true,
          requiredPoints: { lte: 50 },
          stockQuantity: { gt: 0 },
        },
        orderBy: { requiredPoints: 'asc' },
      });
      expect(result).toEqual(mockRewards);
    });

    it('returns empty array when no affordable rewards exist', async () => {
      vi.mocked(prisma.reward.findMany).mockResolvedValue([]);

      const result = await getRedeemableRewards('tenant-1', 0);

      expect(result).toEqual([]);
    });
  });

  describe('redeemReward', () => {
    const mockMember = {
      id: 'member-1',
      tenantId: 'tenant-1',
      pointBalance: 100,
    };

    const mockReward = {
      id: 'reward-1',
      tenantId: 'tenant-1',
      name: 'Free Coffee',
      requiredPoints: 50,
      stockQuantity: 3,
      isActive: true,
    };

    it('throws notFound when member does not exist', async () => {
      vi.mocked(prisma.member.findUnique).mockResolvedValue(null);

      await expect(redeemReward('bad-id', 'reward-1')).rejects.toThrow(
        'Member tidak ditemukan'
      );
    });

    it('throws notFound when reward does not exist', async () => {
      vi.mocked(prisma.member.findUnique).mockResolvedValue(mockMember as any);
      vi.mocked(prisma.reward.findUnique).mockResolvedValue(null);

      await expect(redeemReward('member-1', 'bad-id')).rejects.toThrow(
        'Reward tidak ditemukan'
      );
    });

    it('throws badRequest when reward is inactive', async () => {
      vi.mocked(prisma.member.findUnique).mockResolvedValue(mockMember as any);
      vi.mocked(prisma.reward.findUnique).mockResolvedValue({
        ...mockReward,
        isActive: false,
      } as any);

      await expect(redeemReward('member-1', 'reward-1')).rejects.toThrow(
        'Reward sedang tidak tersedia'
      );
    });

    it('throws badRequest when reward stock is zero', async () => {
      vi.mocked(prisma.member.findUnique).mockResolvedValue(mockMember as any);
      vi.mocked(prisma.reward.findUnique).mockResolvedValue({
        ...mockReward,
        stockQuantity: 0,
      } as any);

      await expect(redeemReward('member-1', 'reward-1')).rejects.toThrow(
        'Stok reward sudah habis'
      );
    });

    it('throws badRequest when member has insufficient points', async () => {
      vi.mocked(prisma.member.findUnique).mockResolvedValue({
        ...mockMember,
        pointBalance: 30,
      } as any);
      vi.mocked(prisma.reward.findUnique).mockResolvedValue(mockReward as any);

      await expect(redeemReward('member-1', 'reward-1')).rejects.toThrow(
        'Poin tidak mencukupi. Saldo: 30, Dibutuhkan: 50'
      );
    });

    it('successfully redeems reward with atomic transaction', async () => {
      vi.mocked(prisma.member.findUnique).mockResolvedValue(mockMember as any);
      vi.mocked(prisma.reward.findUnique).mockResolvedValue(mockReward as any);

      const updatedMember = { ...mockMember, pointBalance: 50 };
      const transaction = {
        id: 'tx-1',
        memberId: 'member-1',
        type: 'redeemed',
        amount: 50,
        rewardId: 'reward-1',
        resultingBalance: 50,
      };
      const updatedReward = { ...mockReward, stockQuantity: 2 };

      vi.mocked(prisma.$transaction).mockResolvedValue([
        updatedMember,
        transaction,
        updatedReward,
      ] as any);

      const result = await redeemReward('member-1', 'reward-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result.reward).toEqual(updatedReward);
      expect(result.transaction).toEqual(transaction);
    });
  });

  describe('updateReward', () => {
    it('updates specified reward fields', async () => {
      const updatedReward = {
        id: 'reward-1',
        name: 'Updated Name',
        requiredPoints: 75,
      };
      vi.mocked(prisma.reward.update).mockResolvedValue(updatedReward as any);

      const result = await updateReward('reward-1', {
        name: 'Updated Name',
        requiredPoints: 75,
      });

      expect(prisma.reward.update).toHaveBeenCalledWith({
        where: { id: 'reward-1' },
        data: { name: 'Updated Name', requiredPoints: 75 },
      });
      expect(result).toEqual(updatedReward);
    });
  });
});
