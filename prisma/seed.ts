import { prisma } from "../src/config/prisma";
import bcrypt from "bcryptjs";


async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.create({
      data: { email: adminEmail, passwordHash, role: "SUPER_ADMIN" },
    });
    console.log(`✅ Created SUPER_ADMIN: ${adminEmail}`);
    console.log(`   Password: ${adminPassword} (CHANGE THIS after first login)`);
  } else {
    console.log(`ℹ️  SUPER_ADMIN ${adminEmail} already exists, skipping.`);
  }

  const defaultPlanCategory = await prisma.subscriptionPlanCategory.upsert({
    where: { slug: "general" },
    update: { name: "پلن‌های عمومی", isActive: true },
    create: { id: "subscription-category-general", name: "پلن‌های عمومی", slug: "general", description: "پلن‌های عمومی فروشندگان", sortOrder: 0 },
  });

  const planDefs = [
    { name: "Starter", durationDays: 30, price: 1290000, discountPct: 0, productLimit: 10, storageLimitMb: 500, trafficLimitGb: 100, sortOrder: 10, isPublic: true },
    { name: "Starter · ۳ ماهه", durationDays: 90, price: 3676500, discountPct: 5, productLimit: 10, storageLimitMb: 500, trafficLimitGb: 100, sortOrder: 11, isPublic: true },
    { name: "Starter · ۶ ماهه", durationDays: 180, price: 6966000, discountPct: 10, productLimit: 10, storageLimitMb: 500, trafficLimitGb: 100, sortOrder: 12, isPublic: true },
    { name: "Starter · ۱۲ ماهه", durationDays: 365, price: 13158000, discountPct: 15, productLimit: 10, storageLimitMb: 500, trafficLimitGb: 100, sortOrder: 13, isPublic: true },

    { name: "Semi-Professional", durationDays: 30, price: 2490000, discountPct: 0, productLimit: 30, storageLimitMb: 1536, trafficLimitGb: 150, sortOrder: 20, isPublic: true },
    { name: "Semi-Professional · ۳ ماهه", durationDays: 90, price: 7096500, discountPct: 5, productLimit: 30, storageLimitMb: 1536, trafficLimitGb: 150, sortOrder: 21, isPublic: true },
    { name: "Semi-Professional · ۶ ماهه", durationDays: 180, price: 13446000, discountPct: 10, productLimit: 30, storageLimitMb: 1536, trafficLimitGb: 150, sortOrder: 22, isPublic: true },
    { name: "Semi-Professional · ۱۲ ماهه", durationDays: 365, price: 25398000, discountPct: 15, productLimit: 30, storageLimitMb: 1536, trafficLimitGb: 150, sortOrder: 23, isPublic: true },

    { name: "Professional", durationDays: 30, price: 4490000, discountPct: 0, productLimit: 100, storageLimitMb: 5120, trafficLimitGb: 300, sortOrder: 30, isPublic: true },
    { name: "Professional · ۳ ماهه", durationDays: 90, price: 12796500, discountPct: 5, productLimit: 100, storageLimitMb: 5120, trafficLimitGb: 300, sortOrder: 31, isPublic: true },
    { name: "Professional · ۶ ماهه", durationDays: 180, price: 24246000, discountPct: 10, productLimit: 100, storageLimitMb: 5120, trafficLimitGb: 300, sortOrder: 32, isPublic: true },
    { name: "Professional · ۱۲ ماهه", durationDays: 365, price: 45798000, discountPct: 15, productLimit: 100, storageLimitMb: 5120, trafficLimitGb: 300, sortOrder: 33, isPublic: true },
  ];

  const bundleDefs = [
    { id: "traffic-1gb", name: "بسته ۱ گیگابایت", gigabytes: 1, priceToman: 59000, sortOrder: 10 },
    { id: "traffic-5gb", name: "بسته ۵ گیگابایت", gigabytes: 5, priceToman: 279000, sortOrder: 20 },
    { id: "traffic-10gb", name: "بسته ۱۰ گیگابایت", gigabytes: 10, priceToman: 499000, sortOrder: 30 },
    { id: "traffic-25gb", name: "بسته ۲۵ گیگابایت", gigabytes: 25, priceToman: 1199000, sortOrder: 40 },
  ];
  for (const plan of planDefs) {
    const id = `final-${plan.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}-${plan.durationDays}`;
    const existingPlan = await prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!existingPlan) {
      await prisma.subscriptionPlan.create({
        data: {
          id,
          name: plan.name,
          durationDays: plan.durationDays,
          price: plan.price,
          discountPct: plan.discountPct,
          productLimit: plan.productLimit,
          storageLimitMb: plan.storageLimitMb,
          trafficLimitGb: plan.trafficLimitGb,
          sortOrder: plan.sortOrder,
          isPublic: plan.isPublic,
          isActive: true,
          categoryId: defaultPlanCategory.id,
          features: "{}",
        },
      });
    } else if (existingPlan.trafficLimitGb !== plan.trafficLimitGb) {
      await prisma.subscriptionPlan.update({ where: { id }, data: { trafficLimitGb: plan.trafficLimitGb } });
    }
  }

  for (const bundle of bundleDefs) {
    const existingBundle = await prisma.trafficBundle.findUnique({ where: { id: bundle.id } });
    if (!existingBundle) {
      await prisma.trafficBundle.create({ data: { ...bundle, isActive: true } });
    }
  }

  await prisma.subscriptionPlan.updateMany({
    where: { categoryId: null },
    data: { categoryId: defaultPlanCategory.id },
  });

  await prisma.platformSetting.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  console.log("✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
