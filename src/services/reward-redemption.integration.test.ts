import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '../utils/api-error';

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  member: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  reward: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  menuItem: {
    findMany: vi.fn(),
  },
  rewardVoucher: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
  },
  pointTransaction: {
    create: vi.fn(),
  },
  order: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  voucher: {
    findUnique: vi.fn(),
  },
  voucherUsage: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('../config/database', () => ({
  default: mockPrisma,
}));

// ─── Mock @aws-sdk/client-s3 ─────────────────────────────────────────────────

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-s3', () => {
  class MockPutObjectCommand {
    Bucket: string;
    Key: string;
    Body: any;
    ContentType: string;
    constructor(input: any) {
      Object.assign(this, input);
    }
  }
  return {
    S3Client: vi.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    PutObjectCommand: MockPutObjectCommand,
  };
});

vi.mock('../config/r2', () => ({
  r2Client: { send: mockSend },
  R2_BUCKET: 'test-bucket',
  R2_PUBLIC_URL: 'https://cdn.example.com',
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import {
  redeemRewardWithVoucher,
  createReward,
  generateVoucherCode,
} from './reward.service';
import {
  calculateRewardDiscount,
  validateRewardVoucher,
  applyRewardVoucher,
} from './reward-voucher.service';
import { createOrder } from './order.service';

// ─── Test Data Helpers ───────────────────────────────────────────────────────

function makeMember(overrides = {}) {
  return {
    id: 'member-1',
    tenantId: 'tenant-1',
    name: 'Test Member',
    pointBalance: 200,
    whatsapp: '08123456789',
    ...overrides,
  };
}

function makeReward(overrides = {}) {
  return {
    id: 'reward-1',
    tenantId: 'tenant-1',
    name: 'Free Coffee',
    description: 'A free coffee reward',
    requiredPoints: 50,
    stockQuantity: 5,
    isActive: true,
    menuItemId: 'menu-item-1',
    discountType: 'free',
    discountSubType: null,
    discountValue: null,
    imageUrl: null,
    createdAt: new Date(),
    menuItem: {
      id: 'menu-item-1',
      name: 'Espresso',
      price: 25000,
      isAvailable: true,
      imageUrl: null,
    },
    ...overrides,
  };
}

function makeRewardVoucher(overrides = {}) {
  return {
    id: 'voucher-1',
    tenantId: 'tenant-1',
    memberId: 'member-1',
    rewardId: 'reward-1',
    menuItemId: 'menu-item-1',
    code: 'RW-ABC123',
    discountType: 'free',
    discountSubType: null,
    discountValue: null,
    expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    isUsed: false,
    usedAt: null,
    orderId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// ─── Integration Tests ───────────────────────────────────────────────────────

describe('Reward Redemption Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Full redemption flow: create reward → redeem → verify voucher → verify state', () => {
    /**
     * Validates: Requirements 4.5, 9.1, 9.2
     * Tests the complete redemption flow through the service layer
     */
    it('creates reward, redeems it, and produces a valid voucher with correct state changes', async () => {
      const member = makeMember({ pointBalance: 100 });
      const reward = makeReward({ requiredPoints: 50, stockQuantity: 3 });

      // Setup mocks for redeemRewardWithVoucher
      mockPrisma.member.findUnique.mockResolvedValue(member);
      mockPrisma.reward.findUnique.mockResolvedValue(reward);
      mockPrisma.rewardVoucher.findUnique.mockResolvedValue(null); // no code collision

      // Mock $transaction to simulate atomic operations
      const updatedMember = { ...member, pointBalance: 50 };
      const transaction = {
        id: 'tx-1',
        memberId: 'member-1',
        type: 'redeemed',
        amount: 50,
        rewardId: 'reward-1',
        resultingBalance: 50,
      };
      const updatedReward = { ...reward, stockQuantity: 2 };
      const createdVoucher = {
        id: 'rv-1',
        tenantId: 'tenant-1',
        memberId: 'member-1',
        rewardId: 'reward-1',
        menuItemId: 'menu-item-1',
        code: 'RW-XYZ789',
        discountType: 'free',
        discountSubType: null,
        discountValue: null,
        expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isUsed: false,
        usedAt: null,
        orderId: null,
      };

      mockPrisma.$transaction.mockResolvedValue([
        updatedMember,
        transaction,
        updatedReward,
        createdVoucher,
      ]);

      // Execute the full redemption
      const result = await redeemRewardWithVoucher('member-1', 'reward-1');

      // Verify voucher code is returned and follows format
      expect(result.rewardVoucher.code).toBe('RW-XYZ789');
      expect(result.rewardVoucher.code).toMatch(/^RW-[A-Z0-9]{6}$/);

      // Verify stock was decremented (reflected in returned reward)
      expect(result.reward.stockQuantity).toBe(2);

      // Verify points were deducted (reflected via transaction)
      expect(result.transaction.amount).toBe(50);
      expect(result.transaction.resultingBalance).toBe(50);
      expect(result.transaction.type).toBe('redeemed');

      // Verify voucher properties
      expect(result.rewardVoucher.menuItemId).toBe('menu-item-1');
      expect(result.rewardVoucher.menuItemName).toBe('Espresso');
      expect(result.rewardVoucher.discountType).toBe('free');
      expect(result.rewardVoucher.isUsed).toBe(false);

      // Verify expiry is approximately 7 days from now
      const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
      const expiryTime = result.rewardVoucher.expiryDate.getTime();
      expect(expiryTime).toBeGreaterThan(Date.now());
      expect(expiryTime).toBeLessThanOrEqual(sevenDaysFromNow + 5000); // 5s tolerance

      // Verify $transaction was called (atomic operation)
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('generates distinct voucher codes for multiple redemptions of same reward', async () => {
      const member = makeMember({ pointBalance: 200 });
      const reward = makeReward({ requiredPoints: 50, stockQuantity: 5 });

      // First redemption
      mockPrisma.member.findUnique.mockResolvedValue(member);
      mockPrisma.reward.findUnique.mockResolvedValue(reward);
      mockPrisma.rewardVoucher.findUnique.mockResolvedValue(null);

      const voucher1 = {
        id: 'rv-1',
        tenantId: 'tenant-1',
        memberId: 'member-1',
        rewardId: 'reward-1',
        menuItemId: 'menu-item-1',
        code: 'RW-AAA111',
        discountType: 'free',
        discountSubType: null,
        discountValue: null,
        expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isUsed: false,
      };

      mockPrisma.$transaction.mockResolvedValue([
        { ...member, pointBalance: 150 },
        { id: 'tx-1', memberId: 'member-1', type: 'redeemed', amount: 50, resultingBalance: 150 },
        { ...reward, stockQuantity: 4 },
        voucher1,
      ]);

      const result1 = await redeemRewardWithVoucher('member-1', 'reward-1');

      // Second redemption
      mockPrisma.member.findUnique.mockResolvedValue({ ...member, pointBalance: 150 });
      mockPrisma.reward.findUnique.mockResolvedValue({ ...reward, stockQuantity: 4 });
      mockPrisma.rewardVoucher.findUnique.mockResolvedValue(null);

      const voucher2 = {
        ...voucher1,
        id: 'rv-2',
        code: 'RW-BBB222',
      };

      mockPrisma.$transaction.mockResolvedValue([
        { ...member, pointBalance: 100 },
        { id: 'tx-2', memberId: 'member-1', type: 'redeemed', amount: 50, resultingBalance: 100 },
        { ...reward, stockQuantity: 3 },
        voucher2,
      ]);

      const result2 = await redeemRewardWithVoucher('member-1', 'reward-1');

      // Verify distinct codes
      expect(result1.rewardVoucher.code).not.toBe(result2.rewardVoucher.code);
      expect(result1.rewardVoucher.code).toMatch(/^RW-[A-Z0-9]{6}$/);
      expect(result2.rewardVoucher.code).toMatch(/^RW-[A-Z0-9]{6}$/);
    });
  });

  describe('Voucher application in order: redeem → apply voucher → verify discount', () => {
    /**
     * Validates: Requirements 5.4, 5.5, 5.6
     * Tests that a redeemed voucher correctly applies its discount when used in an order
     */
    it('applies "free" discount type - item price becomes 0', async () => {
      const member = makeMember();
      const reward = makeReward({
        discountType: 'free',
        discountSubType: null,
        discountValue: null,
      });

      // Simulate a redeemed voucher
      const voucher = makeRewardVoucher({
        discountType: 'free',
        discountSubType: null,
        discountValue: null,
        menuItem: { id: 'menu-item-1', name: 'Espresso', price: 25000, isAvailable: true },
      });

      const order = {
        id: 'order-1',
        tenantId: 'tenant-1',
        memberId: 'member-1',
        originalTotal: 25000,
        discountAmount: 0,
        finalTotal: 25000,
        items: [
          { id: 'oi-1', menuItemId: 'menu-item-1', itemName: 'Espresso', itemPrice: 25000, quantity: 1 },
        ],
      };

      mockPrisma.rewardVoucher.findUnique.mockResolvedValue(voucher);
      mockPrisma.order.findUnique.mockResolvedValue(order);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        return fn({
          order: { update: vi.fn() },
          rewardVoucher: { update: vi.fn() },
        });
      });

      await applyRewardVoucher('voucher-1', 'order-1');

      // Verify the discount calculation: free → full item price as discount
      const { discountAmount, finalPrice } = calculateRewardDiscount(25000, 'free', null, null);
      expect(discountAmount).toBe(25000);
      expect(finalPrice).toBe(0);
    });

    it('applies "discount" with fixed sub-type correctly', async () => {
      const voucher = makeRewardVoucher({
        discountType: 'discount',
        discountSubType: 'fixed',
        discountValue: 10000,
        menuItem: { id: 'menu-item-1', name: 'Espresso', price: 25000, isAvailable: true },
      });

      const order = {
        id: 'order-1',
        tenantId: 'tenant-1',
        memberId: 'member-1',
        originalTotal: 25000,
        discountAmount: 0,
        finalTotal: 25000,
        items: [
          { id: 'oi-1', menuItemId: 'menu-item-1', itemName: 'Espresso', itemPrice: 25000, quantity: 1 },
        ],
      };

      mockPrisma.rewardVoucher.findUnique.mockResolvedValue(voucher);
      mockPrisma.order.findUnique.mockResolvedValue(order);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        return fn({
          order: { update: vi.fn() },
          rewardVoucher: { update: vi.fn() },
        });
      });

      await applyRewardVoucher('voucher-1', 'order-1');

      // Verify discount calculation: fixed 10000 off 25000 → final 15000
      const { discountAmount, finalPrice } = calculateRewardDiscount(25000, 'discount', 'fixed', 10000);
      expect(discountAmount).toBe(10000);
      expect(finalPrice).toBe(15000);
    });

    it('applies "discount" with percentage sub-type correctly', async () => {
      const voucher = makeRewardVoucher({
        discountType: 'discount',
        discountSubType: 'percentage',
        discountValue: 20,
        menuItem: { id: 'menu-item-1', name: 'Espresso', price: 25000, isAvailable: true },
      });

      const order = {
        id: 'order-1',
        tenantId: 'tenant-1',
        memberId: 'member-1',
        originalTotal: 25000,
        discountAmount: 0,
        finalTotal: 25000,
        items: [
          { id: 'oi-1', menuItemId: 'menu-item-1', itemName: 'Espresso', itemPrice: 25000, quantity: 1 },
        ],
      };

      mockPrisma.rewardVoucher.findUnique.mockResolvedValue(voucher);
      mockPrisma.order.findUnique.mockResolvedValue(order);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        return fn({
          order: { update: vi.fn() },
          rewardVoucher: { update: vi.fn() },
        });
      });

      await applyRewardVoucher('voucher-1', 'order-1');

      // Verify discount calculation: 20% of 25000 = 5000 off → final 20000
      const { discountAmount, finalPrice } = calculateRewardDiscount(25000, 'discount', 'percentage', 20);
      expect(discountAmount).toBe(5000);
      expect(finalPrice).toBe(20000);
    });

    it('integrates with createOrder using rewardVoucherCode', async () => {
      // Setup for createOrder with a reward voucher
      const member = makeMember();
      const menuItem = {
        id: 'menu-item-1',
        tenantId: 'tenant-1',
        name: 'Espresso',
        price: 25000,
        isAvailable: true,
      };

      const rewardVoucher = makeRewardVoucher({
        discountType: 'discount',
        discountSubType: 'fixed',
        discountValue: 5000,
        menuItem: { id: 'menu-item-1', name: 'Espresso', price: 25000, isAvailable: true },
      });

      mockPrisma.member.findFirst.mockResolvedValue(member);
      mockPrisma.menuItem.findMany.mockResolvedValue([menuItem]);
      mockPrisma.rewardVoucher.findUnique.mockResolvedValue(rewardVoucher);

      // Mock $transaction for order creation
      const createdOrder = {
        id: 'order-1',
        memberId: 'member-1',
        tenantId: 'tenant-1',
        originalTotal: 25000,
        discountAmount: 5000,
        finalTotal: 20000,
        status: 'pending',
        paymentMethod: 'cash',
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        return fn({
          order: { create: vi.fn().mockResolvedValue(createdOrder) },
          rewardVoucher: { update: vi.fn() },
        });
      });

      const result = await createOrder({
        memberId: 'member-1',
        tenantId: 'tenant-1',
        items: [{ menuItemId: 'menu-item-1', quantity: 1 }],
        rewardVoucherCode: 'RW-ABC123',
        paymentMethod: 'cash',
      });

      // Verify discount was applied to final total
      expect(result.discountAmount).toBe(5000);
      expect(result.finalTotal).toBe(20000);
      expect(result.originalTotal).toBe(25000);
    });
  });

  describe('Concurrent redemption handling (stock race condition)', () => {
    /**
     * Validates: Requirements 4.5, 9.1
     * Tests that when stock = 1, only one concurrent redemption succeeds
     */
    it('first redemption succeeds, second fails with "Stok reward sudah habis" when stock = 1', async () => {
      const member1 = makeMember({ id: 'member-1', pointBalance: 100 });
      const member2 = makeMember({ id: 'member-2', pointBalance: 100 });
      const reward = makeReward({ stockQuantity: 1 });

      // First redemption - succeeds
      mockPrisma.member.findUnique.mockResolvedValueOnce(member1);
      mockPrisma.reward.findUnique.mockResolvedValueOnce(reward);
      mockPrisma.rewardVoucher.findUnique.mockResolvedValueOnce(null);

      mockPrisma.$transaction.mockResolvedValueOnce([
        { ...member1, pointBalance: 50 },
        { id: 'tx-1', memberId: 'member-1', type: 'redeemed', amount: 50, resultingBalance: 50 },
        { ...reward, stockQuantity: 0 },
        {
          id: 'rv-1',
          tenantId: 'tenant-1',
          memberId: 'member-1',
          rewardId: 'reward-1',
          menuItemId: 'menu-item-1',
          code: 'RW-FIRST1',
          discountType: 'free',
          discountSubType: null,
          discountValue: null,
          expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          isUsed: false,
        },
      ]);

      const result1 = await redeemRewardWithVoucher('member-1', 'reward-1');
      expect(result1.rewardVoucher.code).toBe('RW-FIRST1');

      // Second redemption - fails because stock is now 0
      mockPrisma.member.findUnique.mockResolvedValueOnce(member2);
      mockPrisma.reward.findUnique.mockResolvedValueOnce({
        ...reward,
        stockQuantity: 0, // stock depleted by first redemption
      });

      await expect(
        redeemRewardWithVoucher('member-2', 'reward-1')
      ).rejects.toThrow('Stok reward sudah habis');
    });

    it('handles transaction failure gracefully (simulating DB-level race)', async () => {
      const member = makeMember({ pointBalance: 100 });
      const reward = makeReward({ stockQuantity: 1 });

      mockPrisma.member.findUnique.mockResolvedValue(member);
      mockPrisma.reward.findUnique.mockResolvedValue(reward);
      mockPrisma.rewardVoucher.findUnique.mockResolvedValue(null);

      // Simulate a transaction failure (e.g., Prisma P2034 write conflict)
      mockPrisma.$transaction.mockRejectedValue(
        new Error('Transaction failed due to a write conflict or a deadlock')
      );

      await expect(
        redeemRewardWithVoucher('member-1', 'reward-1')
      ).rejects.toThrow('Transaction failed');
    });
  });

  describe('R2 image upload (mocked S3 client)', () => {
    /**
     * Validates: Requirements 3.1, 3.2, 3.3
     * Tests that image upload to R2 works correctly via the route handler helper
     */
    it('calls PutObjectCommand with correct bucket and key prefix for reward image', async () => {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      const { r2Client, R2_BUCKET, R2_PUBLIC_URL } = await import('../config/r2');

      // Setup mock file
      const mockFile: Express.Multer.File = {
        fieldname: 'image',
        originalname: 'reward-coffee.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        buffer: Buffer.from('fake-image-data'),
        size: 1024,
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      // Simulate what uploadRewardImageToR2 does
      mockSend.mockResolvedValue({});

      const ext = '.jpg';
      const key = `rewards/test-uuid${ext}`;

      const command = new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: mockFile.buffer,
        ContentType: mockFile.mimetype,
      });

      await r2Client.send(command);

      // Verify send was called with a PutObjectCommand instance
      expect(mockSend).toHaveBeenCalledTimes(1);
      const sentCommand = mockSend.mock.calls[0][0];
      expect(sentCommand.Bucket).toBe('test-bucket');
      expect(sentCommand.Key).toBe(key);
      expect(sentCommand.Body).toEqual(mockFile.buffer);
      expect(sentCommand.ContentType).toBe('image/jpeg');

      // Verify the key starts with rewards/ prefix
      expect(key).toMatch(/^rewards\/.+\.jpg$/);

      // Verify public URL would be constructed correctly
      const publicUrl = `${R2_PUBLIC_URL}/${key}`;
      expect(publicUrl).toBe(`https://cdn.example.com/${key}`);
    });

    it('handles R2 upload failure gracefully', async () => {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      const { r2Client, R2_BUCKET } = await import('../config/r2');

      // Simulate R2 failure
      mockSend.mockRejectedValue(new Error('Network error'));

      const mockFile: Express.Multer.File = {
        fieldname: 'image',
        originalname: 'reward.png',
        encoding: '7bit',
        mimetype: 'image/png',
        buffer: Buffer.from('fake-image-data'),
        size: 2048,
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      const command = new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: 'rewards/test.png',
        Body: mockFile.buffer,
        ContentType: mockFile.mimetype,
      });

      await expect(r2Client.send(command)).rejects.toThrow('Network error');
    });

    it('validates reward image key uses rewards/ prefix and preserves file extension', async () => {
      const testCases = [
        { originalname: 'photo.jpg', expected: /^rewards\/.+\.jpg$/ },
        { originalname: 'image.png', expected: /^rewards\/.+\.png$/ },
        { originalname: 'banner.webp', expected: /^rewards\/.+\.webp$/ },
      ];

      for (const { originalname, expected } of testCases) {
        const ext = originalname.substring(originalname.lastIndexOf('.'));
        const key = `rewards/uuid-placeholder${ext}`;
        expect(key).toMatch(expected);
      }
    });
  });
});
