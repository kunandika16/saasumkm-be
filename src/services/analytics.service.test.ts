import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as analyticsService from './analytics.service';

// Mock the database module
vi.mock('../config/database', () => {
  return {
    default: {
      member: {
        count: vi.fn(),
        findMany: vi.fn(),
      },
      visit: {
        count: vi.fn(),
        findMany: vi.fn(),
        groupBy: vi.fn(),
      },
      order: {
        groupBy: vi.fn(),
        count: vi.fn(),
        aggregate: vi.fn(),
      },
      voucherUsage: {
        count: vi.fn(),
      },
      orderItem: {
        groupBy: vi.fn(),
      },
      menuItem: {
        findMany: vi.fn(),
      },
    },
  };
});

import prisma from '../config/database';

const mockedPrisma = vi.mocked(prisma, true);

describe('analytics.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOverview', () => {
    it('returns all overview metrics for a tenant', async () => {
      const tenantId = 'tenant-1';

      mockedPrisma.member.count.mockResolvedValue(100);
      mockedPrisma.visit.count.mockResolvedValue(250);
      mockedPrisma.order.groupBy.mockResolvedValue([
        { memberId: 'member-1', _count: { memberId: 2 } },
        { memberId: 'member-2', _count: { memberId: 3 } },
      ] as any);
      mockedPrisma.visit.groupBy.mockResolvedValue([
        { memberId: 'member-a', _count: { memberId: 15 } },
        { memberId: 'member-b', _count: { memberId: 10 } },
      ] as any);
      mockedPrisma.voucherUsage.count.mockResolvedValue(12);
      mockedPrisma.order.count.mockResolvedValue(45);
      mockedPrisma.order.aggregate.mockResolvedValue({
        _sum: { finalTotal: 5000000 },
        _count: null,
        _avg: null,
        _min: null,
        _max: null,
      } as any);
      mockedPrisma.member.findMany.mockResolvedValue([
        { id: 'member-a', name: 'Alice' },
        { id: 'member-b', name: 'Bob' },
      ] as any);

      const result = await analyticsService.getOverview(tenantId);

      expect(result.totalMembers).toBe(100);
      expect(result.totalVisitsThisMonth).toBe(250);
      expect(result.repeatCustomerCount).toBe(2);
      expect(result.topMembersByVisits).toHaveLength(2);
      expect(result.topMembersByVisits[0]).toEqual({
        id: 'member-a',
        name: 'Alice',
        visitCount: 15,
      });
      expect(result.totalVouchersRedeemedThisMonth).toBe(12);
      expect(result.totalOrdersThisMonth).toBe(45);
      expect(result.totalRevenueThisMonth).toBe(5000000);
    });

    it('returns 0 revenue when no paid orders exist', async () => {
      mockedPrisma.member.count.mockResolvedValue(0);
      mockedPrisma.visit.count.mockResolvedValue(0);
      mockedPrisma.order.groupBy.mockResolvedValue([] as any);
      mockedPrisma.visit.groupBy.mockResolvedValue([] as any);
      mockedPrisma.voucherUsage.count.mockResolvedValue(0);
      mockedPrisma.order.count.mockResolvedValue(0);
      mockedPrisma.order.aggregate.mockResolvedValue({
        _sum: { finalTotal: null },
        _count: null,
        _avg: null,
        _min: null,
        _max: null,
      } as any);

      const result = await analyticsService.getOverview('empty-tenant');

      expect(result.totalMembers).toBe(0);
      expect(result.totalRevenueThisMonth).toBe(0);
      expect(result.topMembersByVisits).toEqual([]);
    });
  });

  describe('getDailyVisitors', () => {
    it('returns daily unique visitor counts for current month', async () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      mockedPrisma.visit.findMany.mockResolvedValue([
        { memberId: 'member-1', visitedAt: today },
        { memberId: 'member-2', visitedAt: today },
        { memberId: 'member-1', visitedAt: today }, // duplicate same day
        { memberId: 'member-1', visitedAt: yesterday },
      ] as any);

      const result = await analyticsService.getDailyVisitors('tenant-1');

      // Should have entries for each day of the month up to today
      expect(result.length).toBeGreaterThan(0);

      const todayStr = today.toISOString().slice(0, 10);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      const todayEntry = result.find((r) => r.date === todayStr);
      const yesterdayEntry = result.find((r) => r.date === yesterdayStr);

      // Today: 2 unique members (member-1 and member-2)
      expect(todayEntry?.uniqueVisitors).toBe(2);
      // Yesterday: 1 unique member
      if (yesterdayEntry) {
        expect(yesterdayEntry.uniqueVisitors).toBe(1);
      }
    });

    it('returns zeros for days with no visits', async () => {
      mockedPrisma.visit.findMany.mockResolvedValue([]);

      const result = await analyticsService.getDailyVisitors('tenant-1');

      // All days should have 0 visitors
      for (const day of result) {
        expect(day.uniqueVisitors).toBe(0);
      }
    });

    it('returns dates in YYYY-MM-DD format sorted ascending', async () => {
      mockedPrisma.visit.findMany.mockResolvedValue([]);

      const result = await analyticsService.getDailyVisitors('tenant-1');

      for (const entry of result) {
        expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }

      // Verify sorted ascending
      for (let i = 1; i < result.length; i++) {
        expect(result[i].date > result[i - 1].date).toBe(true);
      }
    });
  });

  describe('getDormantMembers', () => {
    it('returns dormant members with daysSinceLastVisit', async () => {
      const fortyDaysAgo = new Date();
      fortyDaysAgo.setDate(fortyDaysAgo.getDate() - 40);

      mockedPrisma.member.findMany.mockResolvedValue([
        {
          id: 'member-1',
          name: 'Dormant User',
          whatsapp: '628123456789',
          lastVisitAt: fortyDaysAgo,
        },
        {
          id: 'member-2',
          name: 'Never Visited',
          whatsapp: '628987654321',
          lastVisitAt: null,
        },
      ] as any);

      const result = await analyticsService.getDormantMembers('tenant-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('member-1');
      expect(result[0].daysSinceLastVisit).toBeGreaterThanOrEqual(40);
      expect(result[1].id).toBe('member-2');
      expect(result[1].daysSinceLastVisit).toBeNull();
    });
  });

  describe('getMenuPopularity', () => {
    it('returns top 10 menu items by order frequency', async () => {
      mockedPrisma.orderItem.groupBy.mockResolvedValue([
        { menuItemId: 'item-1', _count: { menuItemId: 25 } },
        { menuItemId: 'item-2', _count: { menuItemId: 18 } },
      ] as any);

      mockedPrisma.menuItem.findMany.mockResolvedValue([
        { id: 'item-1', name: 'Nasi Goreng' },
        { id: 'item-2', name: 'Es Teh' },
      ] as any);

      const result = await analyticsService.getMenuPopularity('tenant-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        menuItemId: 'item-1',
        name: 'Nasi Goreng',
        orderCount: 25,
      });
      expect(result[1]).toEqual({
        menuItemId: 'item-2',
        name: 'Es Teh',
        orderCount: 18,
      });
    });

    it('returns empty array when no orders exist', async () => {
      mockedPrisma.orderItem.groupBy.mockResolvedValue([] as any);

      const result = await analyticsService.getMenuPopularity('tenant-1');

      expect(result).toEqual([]);
    });
  });
});
