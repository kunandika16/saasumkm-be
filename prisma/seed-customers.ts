import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed 30 members with varied transaction data for dashboard testing.
 * Run: npx ts-node prisma/seed-customers.ts
 */
async function main() {
  console.log('🌱 Seeding 30 customers with transactions...\n');

  // Get existing tenant
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    throw new Error('Tenant not found. Run `npx prisma db seed` first.');
  }

  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: tenant.id },
  });
  if (!settings) {
    throw new Error('Tenant settings not found.');
  }

  // Get menu items for orders
  const menuItems = await prisma.menuItem.findMany({
    where: { tenantId: tenant.id, isAvailable: true },
  });
  if (menuItems.length === 0) {
    throw new Error('No menu items found. Run seed first.');
  }

  // Get vouchers
  const vouchers = await prisma.voucher.findMany({
    where: { tenantId: tenant.id, isActive: true, isWelcomeVoucher: false },
  });

  // ─── 30 Indonesian customer names ─────────────────────────────────────────
  const customers = [
    { name: 'Andi Prasetyo', whatsapp: '6281200000001' },
    { name: 'Siti Nurhaliza', whatsapp: '6281200000002' },
    { name: 'Budi Santoso', whatsapp: '6281200000003' },
    { name: 'Dewi Lestari', whatsapp: '6281200000004' },
    { name: 'Rizky Ramadhan', whatsapp: '6281200000005' },
    { name: 'Putri Ayu', whatsapp: '6281200000006' },
    { name: 'Agus Setiawan', whatsapp: '6281200000007' },
    { name: 'Rina Wulandari', whatsapp: '6281200000008' },
    { name: 'Hendra Gunawan', whatsapp: '6281200000009' },
    { name: 'Maya Sari', whatsapp: '6281200000010' },
    { name: 'Dimas Pratama', whatsapp: '6281200000011' },
    { name: 'Fitri Handayani', whatsapp: '6281200000012' },
    { name: 'Yoga Nugroho', whatsapp: '6281200000013' },
    { name: 'Novi Anggraini', whatsapp: '6281200000014' },
    { name: 'Fajar Hidayat', whatsapp: '6281200000015' },
    { name: 'Lina Marlina', whatsapp: '6281200000016' },
    { name: 'Tommy Wijaya', whatsapp: '6281200000017' },
    { name: 'Anisa Rahma', whatsapp: '6281200000018' },
    { name: 'Reno Saputra', whatsapp: '6281200000019' },
    { name: 'Winda Kusuma', whatsapp: '6281200000020' },
    { name: 'Bayu Ardiansyah', whatsapp: '6281200000021' },
    { name: 'Citra Dewi', whatsapp: '6281200000022' },
    { name: 'Galih Permana', whatsapp: '6281200000023' },
    { name: 'Intan Permatasari', whatsapp: '6281200000024' },
    { name: 'Joko Susilo', whatsapp: '6281200000025' },
    { name: 'Kartika Sari', whatsapp: '6281200000026' },
    { name: 'Lukman Hakim', whatsapp: '6281200000027' },
    { name: 'Mega Puspita', whatsapp: '6281200000028' },
    { name: 'Naufal Fikri', whatsapp: '6281200000029' },
    { name: 'Olivia Tanaka', whatsapp: '6281200000030' },
  ];

  // Helper: random int between min and max (inclusive)
  function randInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Helper: random date within last N days
  function randomDate(daysBack: number) {
    const now = Date.now();
    const past = now - daysBack * 24 * 60 * 60 * 1000;
    return new Date(past + Math.random() * (now - past));
  }

  // Helper: pick random items from array
  function pickRandom<T>(arr: T[], count: number): T[] {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  let totalOrders = 0;
  let totalMembers = 0;

  for (const cust of customers) {
    // Create member (upsert to handle re-runs)
    const member = await prisma.member.upsert({
      where: {
        tenantId_whatsapp: { tenantId: tenant.id, whatsapp: cust.whatsapp },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        name: cust.name,
        whatsapp: cust.whatsapp,
        pointBalance: 0,
        totalVisits: 0,
        registeredAt: randomDate(90),
      },
    });

    // Skip if member already has orders (re-run protection)
    const existingOrders = await prisma.order.count({ where: { memberId: member.id } });
    if (existingOrders > 0) {
      console.log(`  ⏭️  ${cust.name} already has data, skipping...`);
      totalMembers++;
      continue;
    }
    totalMembers++;

    // Each member gets 1-8 orders with varied statuses
    const orderCount = randInt(1, 8);
    let memberPoints = 0;
    let memberVisits = 0;

    for (let i = 0; i < orderCount; i++) {
      // Pick 1-4 random menu items
      const orderItemCount = randInt(1, 4);
      const selectedItems = pickRandom(menuItems, orderItemCount);

      const orderItems = selectedItems.map((mi) => ({
        menuItemId: mi.id,
        itemName: mi.name,
        itemPrice: mi.price,
        quantity: randInt(1, 3),
      }));

      const originalTotal = orderItems.reduce(
        (sum, item) => sum + item.itemPrice * item.quantity,
        0
      );

      // 20% chance to use a voucher
      let discountAmount = 0;
      let voucherId: string | null = null;
      if (Math.random() < 0.2 && vouchers.length > 0) {
        const voucher = vouchers[randInt(0, vouchers.length - 1)];
        voucherId = voucher.id;
        if (voucher.discountType === 'percentage') {
          discountAmount = Math.floor(originalTotal * voucher.discountValue / 100);
        } else {
          discountAmount = voucher.discountValue;
        }
      }

      const finalTotal = Math.max(0, originalTotal - discountAmount);

      // Decide payment method: 60% cash, 40% qris
      const paymentMethod = Math.random() < 0.6 ? 'cash' : 'qris';

      // Decide status: 60% paid, 15% pending, 15% cancelled, 10% expired
      const statusRoll = Math.random();
      let status: 'pending' | 'paid' | 'cancelled' | 'expired';
      if (statusRoll < 0.60) status = 'paid';
      else if (statusRoll < 0.75) status = 'pending';
      else if (statusRoll < 0.90) status = 'cancelled';
      else status = 'expired';

      const orderDate = randomDate(60); // within last 60 days
      let pointsEarned = 0;
      let validatedAt: Date | null = null;

      if (status === 'paid') {
        // Calculate points: finalTotal / amountPerPoint * pointsPerAmount
        pointsEarned = Math.floor(finalTotal / settings.amountPerPoint) * settings.pointsPerAmount;
        memberPoints += pointsEarned;
        memberVisits++;
        validatedAt = new Date(orderDate.getTime() + randInt(5, 60) * 60 * 1000); // 5-60 min after order
      }

      const order = await prisma.order.create({
        data: {
          memberId: member.id,
          tenantId: tenant.id,
          voucherId,
          originalTotal,
          discountAmount,
          finalTotal,
          status,
          paymentMethod: paymentMethod as any,
          pointsEarned,
          createdAt: orderDate,
          validatedAt,
          expiredAt: status === 'expired' ? new Date(orderDate.getTime() + 24 * 60 * 60 * 1000) : null,
          items: {
            create: orderItems,
          },
        },
      });

      // Create point transaction for paid orders
      if (status === 'paid' && pointsEarned > 0) {
        await prisma.pointTransaction.create({
          data: {
            memberId: member.id,
            type: 'earned',
            amount: pointsEarned,
            orderId: order.id,
            resultingBalance: memberPoints,
            createdAt: validatedAt!,
          },
        });
      }

      // If voucher used on paid order, record usage
      if (voucherId && status === 'paid') {
        await prisma.voucherUsage.create({
          data: {
            voucherId,
            memberId: member.id,
            orderId: order.id,
            usedAt: orderDate,
          },
        });
      }

      totalOrders++;
    }

    // Create visit records (1 per paid order + 1-3 extra visits)
    const extraVisits = randInt(0, 3);
    const totalVisitCount = memberVisits + extraVisits;

    for (let v = 0; v < totalVisitCount; v++) {
      await prisma.visit.create({
        data: {
          memberId: member.id,
          accessMethod: Math.random() < 0.7 ? 'nfc' : 'qr',
          visitedAt: randomDate(60),
        },
      });
    }

    // Some members redeem points (20% chance, only if they have enough)
    if (memberPoints >= 30 && Math.random() < 0.2) {
      const redeemAmount = Math.random() < 0.5 ? 30 : 50;
      if (memberPoints >= redeemAmount) {
        memberPoints -= redeemAmount;
        await prisma.pointTransaction.create({
          data: {
            memberId: member.id,
            type: 'redeemed',
            amount: redeemAmount,
            resultingBalance: memberPoints,
            createdAt: randomDate(14),
          },
        });
      }
    }

    // Update member final point balance and visits
    await prisma.member.update({
      where: { id: member.id },
      data: {
        pointBalance: memberPoints,
        totalVisits: totalVisitCount,
        lastVisitAt: randomDate(14),
      },
    });
  }

  // ─── Some review clicks ─────────────────────────────────────────────────────
  const allMembers = await prisma.member.findMany({
    where: { tenantId: tenant.id },
    take: 15,
  });

  for (const m of allMembers.slice(0, 10)) {
    await prisma.reviewClick.create({
      data: {
        memberId: m.id,
        tenantId: tenant.id,
        rewardGranted: Math.random() < 0.7,
        clickedAt: randomDate(30),
      },
    });
  }

  // ─── Summary ─────────────────────────────────────────────────────────────────
  console.log('════════════════════════════════════════════');
  console.log('🎉 Customer seed completed!');
  console.log('════════════════════════════════════════════');
  console.log(`👥 Members created: ${totalMembers}`);
  console.log(`📦 Orders created: ${totalOrders}`);
  console.log(`📊 Visit records + point transactions + review clicks`);
  console.log(`\n💡 Login sebagai member: whatsapp 6281200000001 - 6281200000030`);
  console.log('════════════════════════════════════════════\n');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
