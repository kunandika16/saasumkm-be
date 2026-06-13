import prisma from '../config/database';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TopMember {
  id: string;
  name: string;
  visitCount: number;
}

export interface AnalyticsOverview {
  totalMembers: number;
  totalVisitsThisMonth: number;
  repeatCustomerCount: number;
  topMembersByVisits: TopMember[];
  totalVouchersRedeemedThisMonth: number;
  totalOrdersThisMonth: number;
  totalRevenueThisMonth: number;
}

export interface DailyVisitors {
  date: string;
  uniqueVisitors: number;
}

export interface DormantMember {
  id: string;
  name: string;
  whatsapp: string;
  lastVisitAt: Date | null;
  daysSinceLastVisit: number | null;
}

export interface MenuPopularityItem {
  menuItemId: string;
  name: string;
  orderCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStartOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function getThirtyDaysAgo(): Date {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date;
}

// ─── Service Functions ───────────────────────────────────────────────────────

/**
 * Returns overview analytics metrics for the tenant dashboard.
 *
 * Validates: Req 12.1 — Overview metrics: Total Members, Total Visits (current month),
 * Repeat Customer count, Top 10 Members by visit frequency, total Vouchers redeemed
 * (current month), total Orders (current month), total revenue (current month).
 * Validates: Req 12.3 — Repeat Customer = Member with > 1 paid order in last 30 days.
 * Validates: Req 12.5 — Top 10 Members ranked by total visit count within current month.
 * Validates: Req 12.8 — Real-time queries, no caching.
 */
export async function getOverview(tenantId: string): Promise<AnalyticsOverview> {
  const startOfMonth = getStartOfMonth();
  const thirtyDaysAgo = getThirtyDaysAgo();

  // Run independent queries in parallel
  const [
    totalMembers,
    totalVisitsThisMonth,
    repeatCustomers,
    topMembersByVisits,
    totalVouchersRedeemedThisMonth,
    totalOrdersThisMonth,
    revenueResult,
  ] = await Promise.all([
    // Total members for tenant
    prisma.member.count({
      where: { tenantId },
    }),

    // Total visits this month
    prisma.visit.count({
      where: {
        member: { tenantId },
        visitedAt: { gte: startOfMonth },
      },
    }),

    // Repeat customers: members with > 1 paid order in last 30 days
    prisma.order.groupBy({
      by: ['memberId'],
      where: {
        tenantId,
        status: 'paid',
        createdAt: { gte: thirtyDaysAgo },
      },
      having: {
        memberId: {
          _count: { gt: 1 },
        },
      },
    }),

    // Top 10 members by visit count this month
    prisma.visit.groupBy({
      by: ['memberId'],
      where: {
        member: { tenantId },
        visitedAt: { gte: startOfMonth },
      },
      _count: { memberId: true },
      orderBy: { _count: { memberId: 'desc' } },
      take: 10,
    }),

    // Total vouchers redeemed this month
    prisma.voucherUsage.count({
      where: {
        voucher: { tenantId },
        usedAt: { gte: startOfMonth },
      },
    }),

    // Total orders this month
    prisma.order.count({
      where: {
        tenantId,
        createdAt: { gte: startOfMonth },
      },
    }),

    // Total revenue this month (sum of finalTotal for paid orders)
    prisma.order.aggregate({
      where: {
        tenantId,
        status: 'paid',
        createdAt: { gte: startOfMonth },
      },
      _sum: { finalTotal: true },
    }),
  ]);

  // Fetch member details for top members
  const memberIds = topMembersByVisits.map((m) => m.memberId);
  const members = memberIds.length > 0
    ? await prisma.member.findMany({
        where: { id: { in: memberIds } },
        select: { id: true, name: true },
      })
    : [];

  const memberMap = new Map(members.map((m) => [m.id, m.name]));

  const topMembers: TopMember[] = topMembersByVisits.map((entry) => ({
    id: entry.memberId,
    name: memberMap.get(entry.memberId) || '',
    visitCount: entry._count.memberId,
  }));

  return {
    totalMembers,
    totalVisitsThisMonth,
    repeatCustomerCount: repeatCustomers.length,
    topMembersByVisits: topMembers,
    totalVouchersRedeemedThisMonth,
    totalOrdersThisMonth,
    totalRevenueThisMonth: revenueResult._sum.finalTotal || 0,
  };
}

/**
 * Returns daily unique visitor counts for the current month.
 * Each entry represents one day with the count of unique members who visited.
 *
 * Validates: Req 12.4 — Daily visitor trend for current month,
 * count of unique Members who recorded at least one visit on that day.
 * Validates: Req 12.8 — Real-time queries, no caching.
 */
export async function getDailyVisitors(tenantId: string): Promise<DailyVisitors[]> {
  const startOfMonth = getStartOfMonth();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Get all visits this month for the tenant
  const visits = await prisma.visit.findMany({
    where: {
      member: { tenantId },
      visitedAt: { gte: startOfMonth },
    },
    select: {
      memberId: true,
      visitedAt: true,
    },
  });

  // Build a map of date -> Set of unique memberIds
  const dailyMap = new Map<string, Set<string>>();

  // Initialize all days from start of month to today
  const current = new Date(startOfMonth);
  while (current <= today) {
    const dateStr = current.toISOString().slice(0, 10);
    dailyMap.set(dateStr, new Set());
    current.setDate(current.getDate() + 1);
  }

  // Populate with actual visit data
  for (const visit of visits) {
    const dateStr = visit.visitedAt.toISOString().slice(0, 10);
    const set = dailyMap.get(dateStr);
    if (set) {
      set.add(visit.memberId);
    }
  }

  // Convert to result array
  const result: DailyVisitors[] = [];
  for (const [date, memberSet] of dailyMap) {
    result.push({ date, uniqueVisitors: memberSet.size });
  }

  // Sort by date ascending
  result.sort((a, b) => a.date.localeCompare(b.date));

  return result;
}

/**
 * Returns dormant members who have not visited in the last 30 days.
 * Max 50 results, sorted by lastVisitAt ascending (null first, then oldest).
 *
 * Validates: Req 12.6 — Dormant = no visit in last 30 days,
 * up to 50 sorted by days since last visit descending.
 * Validates: Req 12.8 — Real-time queries, no caching.
 */
export async function getDormantMembers(tenantId: string): Promise<DormantMember[]> {
  const thirtyDaysAgo = getThirtyDaysAgo();
  const now = new Date();

  const members = await prisma.member.findMany({
    where: {
      tenantId,
      OR: [
        // Members whose last visit was more than 30 days ago
        { lastVisitAt: { lt: thirtyDaysAgo } },
        // Members who have never visited and registered more than 30 days ago
        {
          lastVisitAt: null,
          registeredAt: { lt: thirtyDaysAgo },
        },
      ],
    },
    orderBy: {
      lastVisitAt: 'asc', // null first, then oldest
    },
    take: 50,
    select: {
      id: true,
      name: true,
      whatsapp: true,
      lastVisitAt: true,
    },
  });

  return members.map((member) => ({
    id: member.id,
    name: member.name,
    whatsapp: member.whatsapp,
    lastVisitAt: member.lastVisitAt,
    daysSinceLastVisit: member.lastVisitAt
      ? Math.floor((now.getTime() - member.lastVisitAt.getTime()) / (1000 * 60 * 60 * 24))
      : null,
  }));
}

/**
 * Returns the top 10 menu items by order frequency within the current month.
 * Counts how many times each menu item appears in paid orders this month.
 *
 * Validates: Req 12.7 — Menu popularity ranking, Top 10 Menu_Items
 * sorted by order frequency within current month.
 * Validates: Req 12.8 — Real-time queries, no caching.
 */
export async function getMenuPopularity(tenantId: string): Promise<MenuPopularityItem[]> {
  const startOfMonth = getStartOfMonth();

  // Group order items by menuItemId where the parent order is paid and created this month
  const orderItemGroups = await prisma.orderItem.groupBy({
    by: ['menuItemId'],
    where: {
      order: {
        tenantId,
        status: 'paid',
        createdAt: { gte: startOfMonth },
      },
    },
    _count: { menuItemId: true },
    orderBy: { _count: { menuItemId: 'desc' } },
    take: 10,
  });

  // Fetch menu item names
  const menuItemIds = orderItemGroups.map((g) => g.menuItemId);
  const menuItems = menuItemIds.length > 0
    ? await prisma.menuItem.findMany({
        where: { id: { in: menuItemIds } },
        select: { id: true, name: true },
      })
    : [];

  const menuItemMap = new Map(menuItems.map((m) => [m.id, m.name]));

  return orderItemGroups.map((group) => ({
    menuItemId: group.menuItemId,
    name: menuItemMap.get(group.menuItemId) || '',
    orderCount: group._count.menuItemId,
  }));
}
