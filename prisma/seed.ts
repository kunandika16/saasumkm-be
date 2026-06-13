import { PrismaClient, DiscountType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── 1. Create Tenant (Cafe) ───────────────────────────────────────────────
  const tenant = await prisma.tenant.create({
    data: {
      businessName: 'Kopi Nusantara',
      slug: 'kopi-nusantara',
      description:
        'Kedai kopi cozy di pusat kota. Menyajikan kopi specialty, makanan ringan, dan suasana yang nyaman untuk bekerja atau bersantai.',
      logoUrl: null,
      bannerUrl: null,
      locationMapUrl: 'https://maps.app.goo.gl/example123',
      socialLinks: {
        instagram: 'https://instagram.com/kopinusantara',
        whatsapp: 'https://wa.me/6281234567890',
      },
    },
  });

  console.log(`✅ Tenant created: ${tenant.businessName} (${tenant.id})`);

  // ─── 2. Create Admin ───────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('admin123', 10);

  const admin = await prisma.admin.create({
    data: {
      tenantId: tenant.id,
      email: 'admin@kopinusantara.com',
      passwordHash,
      name: 'Admin Kopi Nusantara',
      role: 'admin',
    },
  });

  console.log(`✅ Admin created: ${admin.email} (password: admin123)`);

  // ─── 3. Create Tenant Settings ─────────────────────────────────────────────
  const settings = await prisma.tenantSettings.create({
    data: {
      tenantId: tenant.id,
      pointsPerAmount: 1, // 1 poin
      amountPerPoint: 10000, // per Rp10.000
      pointExpiryDays: 365, // expired setelah 1 tahun
      googlePlaceUrl: 'https://maps.app.goo.gl/example123',
      reviewRewardType: 'points',
      reviewRewardValue: 10, // 10 poin untuk review
      welcomeVoucherType: 'percentage',
      welcomeVoucherValue: 15, // 15% diskon
      welcomeVoucherDays: 30, // berlaku 30 hari
    },
  });

  console.log(`✅ Tenant settings created`);

  // ─── 4. Create Menu Categories ─────────────────────────────────────────────
  const catKopi = await prisma.menuCategory.create({
    data: { tenantId: tenant.id, name: 'Kopi', sortOrder: 1 },
  });

  const catNonKopi = await prisma.menuCategory.create({
    data: { tenantId: tenant.id, name: 'Non-Kopi', sortOrder: 2 },
  });

  const catMakanan = await prisma.menuCategory.create({
    data: { tenantId: tenant.id, name: 'Makanan', sortOrder: 3 },
  });

  const catSnack = await prisma.menuCategory.create({
    data: { tenantId: tenant.id, name: 'Snack', sortOrder: 4 },
  });

  console.log(`✅ 4 menu categories created`);

  // ─── 5. Create Menu Items ──────────────────────────────────────────────────
  const menuItems = await Promise.all([
    // Kopi
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: catKopi.id,
        name: 'Espresso',
        description: 'Single shot espresso dari biji kopi lokal',
        price: 18000,
        isAvailable: true,
        sortOrder: 1,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: catKopi.id,
        name: 'Americano',
        description: 'Espresso dengan air panas',
        price: 22000,
        isAvailable: true,
        sortOrder: 2,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: catKopi.id,
        name: 'Cappuccino',
        description: 'Espresso, steamed milk, dan foam lembut',
        price: 28000,
        isAvailable: true,
        sortOrder: 3,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: catKopi.id,
        name: 'Caffe Latte',
        description: 'Espresso dengan susu steamed yang creamy',
        price: 28000,
        isAvailable: true,
        sortOrder: 4,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: catKopi.id,
        name: 'Kopi Susu Gula Aren',
        description: 'Kopi susu signature dengan gula aren asli',
        price: 25000,
        isAvailable: true,
        sortOrder: 5,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: catKopi.id,
        name: 'V60 Pour Over',
        description: 'Manual brew V60, pilihan single origin',
        price: 35000,
        isAvailable: true,
        sortOrder: 6,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: catKopi.id,
        name: 'Affogato',
        description: 'Espresso shot di atas gelato vanilla',
        price: 32000,
        isAvailable: true,
        sortOrder: 7,
      },
    }),

    // Non-Kopi
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: catNonKopi.id,
        name: 'Matcha Latte',
        description: 'Matcha premium Jepang dengan susu',
        price: 30000,
        isAvailable: true,
        sortOrder: 1,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: catNonKopi.id,
        name: 'Cokelat Panas',
        description: 'Belgian cocoa dengan susu hangat',
        price: 28000,
        isAvailable: true,
        sortOrder: 2,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: catNonKopi.id,
        name: 'Teh Tarik',
        description: 'Teh tarik ala Malaysia',
        price: 20000,
        isAvailable: true,
        sortOrder: 3,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: catNonKopi.id,
        name: 'Lemon Tea',
        description: 'Teh lemon segar, bisa panas atau dingin',
        price: 18000,
        isAvailable: true,
        sortOrder: 4,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: catNonKopi.id,
        name: 'Fresh Orange Juice',
        description: 'Jus jeruk peras segar tanpa gula tambahan',
        price: 25000,
        isAvailable: false, // sementara habis
        sortOrder: 5,
      },
    }),

    // Makanan
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: catMakanan.id,
        name: 'Nasi Goreng Kopi',
        description: 'Nasi goreng spesial dengan bumbu kopi',
        price: 35000,
        isAvailable: true,
        sortOrder: 1,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: catMakanan.id,
        name: 'Sandwich Club',
        description: 'Roti panggang, ayam, telur, selada, mayo',
        price: 32000,
        isAvailable: true,
        sortOrder: 2,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: catMakanan.id,
        name: 'Pasta Aglio Olio',
        description: 'Spaghetti dengan bawang putih dan cabai',
        price: 38000,
        isAvailable: true,
        sortOrder: 3,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: catMakanan.id,
        name: 'Rice Bowl Chicken Teriyaki',
        description: 'Ayam teriyaki dengan nasi dan sayuran',
        price: 35000,
        isAvailable: true,
        sortOrder: 4,
      },
    }),

    // Snack
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: catSnack.id,
        name: 'French Fries',
        description: 'Kentang goreng crispy dengan saus',
        price: 20000,
        isAvailable: true,
        sortOrder: 1,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: catSnack.id,
        name: 'Croissant Butter',
        description: 'Croissant renyah dengan mentega premium',
        price: 22000,
        isAvailable: true,
        sortOrder: 2,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: catSnack.id,
        name: 'Banana Bread',
        description: 'Roti pisang homemade, lembut dan wangi',
        price: 18000,
        isAvailable: true,
        sortOrder: 3,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: catSnack.id,
        name: 'Brownies Cokelat',
        description: 'Brownies fudgy dengan cokelat Belgium',
        price: 25000,
        isAvailable: true,
        sortOrder: 4,
      },
    }),
  ]);

  console.log(`✅ ${menuItems.length} menu items created`);

  // ─── 6. Create Vouchers ────────────────────────────────────────────────────
  const futureDate = new Date();
  futureDate.setMonth(futureDate.getMonth() + 3);

  await prisma.voucher.createMany({
    data: [
      {
        tenantId: tenant.id,
        code: 'GRANDOPEN',
        discountType: DiscountType.percentage,
        discountValue: 20,
        expiryDate: futureDate,
        maxUsage: 100,
        currentUsage: 12,
        isActive: true,
        isWelcomeVoucher: false,
      },
      {
        tenantId: tenant.id,
        code: 'HEMAT10K',
        discountType: DiscountType.fixed,
        discountValue: 10000,
        expiryDate: futureDate,
        maxUsage: 50,
        currentUsage: 8,
        isActive: true,
        isWelcomeVoucher: false,
      },
      {
        tenantId: tenant.id,
        code: 'KOPISUSU',
        discountType: DiscountType.fixed,
        discountValue: 5000,
        expiryDate: futureDate,
        maxUsage: 200,
        currentUsage: 45,
        isActive: true,
        isWelcomeVoucher: false,
      },
    ],
  });

  console.log(`✅ 3 vouchers created (GRANDOPEN, HEMAT10K, KOPISUSU)`);

  // ─── 7. Create Rewards ─────────────────────────────────────────────────────
  await prisma.reward.createMany({
    data: [
      {
        tenantId: tenant.id,
        name: 'Free Americano',
        description: 'Gratis 1 Americano (Hot/Iced)',
        requiredPoints: 30,
        stockQuantity: 50,
        isActive: true,
      },
      {
        tenantId: tenant.id,
        name: 'Free Kopi Susu Gula Aren',
        description: 'Gratis 1 Kopi Susu Gula Aren',
        requiredPoints: 50,
        stockQuantity: 30,
        isActive: true,
      },
      {
        tenantId: tenant.id,
        name: 'Free Croissant',
        description: 'Gratis 1 Croissant Butter',
        requiredPoints: 40,
        stockQuantity: 20,
        isActive: true,
      },
      {
        tenantId: tenant.id,
        name: 'Discount 50% Any Menu',
        description: 'Potongan 50% untuk 1 menu apapun (maks Rp25.000)',
        requiredPoints: 100,
        stockQuantity: 10,
        isActive: true,
      },
      {
        tenantId: tenant.id,
        name: 'Free Rice Bowl',
        description: 'Gratis 1 Rice Bowl Chicken Teriyaki',
        requiredPoints: 80,
        stockQuantity: 15,
        isActive: true,
      },
    ],
  });

  console.log(`✅ 5 rewards created`);

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════');
  console.log('🎉 Seed completed! Berikut data login:');
  console.log('════════════════════════════════════════════');
  console.log(`\n📋 Tenant ID  : ${tenant.id}`);
  console.log(`   Slug       : ${tenant.slug}`);
  console.log(`   NFC/QR URL : http://localhost:3001/t/${tenant.id}`);
  console.log(`\n🔑 Admin Login:`);
  console.log(`   Email      : admin@kopinusantara.com`);
  console.log(`   Password   : admin123`);
  console.log(`\n☕ Menu: 20 items (7 Kopi, 5 Non-Kopi, 4 Makanan, 4 Snack)`);
  console.log(`🎟️  Vouchers: GRANDOPEN (20%), HEMAT10K (Rp10.000), KOPISUSU (Rp5.000)`);
  console.log(`🎁 Rewards: 5 items (30-100 poin)`);
  console.log(`\n⚙️  Point Rules: 1 poin per Rp10.000`);
  console.log(`   Welcome Voucher: 15% diskon, berlaku 30 hari`);
  console.log(`   Review Reward: 10 poin untuk klik review`);
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
