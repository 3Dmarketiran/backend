import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

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

  const planDefs = [
    { name: "یک ماهه", durationDays: 30, price: 500000 },
    { name: "سه ماهه", durationDays: 90, price: 1350000, discountPct: 10 },
    { name: "شش ماهه", durationDays: 180, price: 2500000, discountPct: 15 },
    { name: "یک ساله", durationDays: 365, price: 4500000, discountPct: 25 },
  ];

  for (const plan of planDefs) {
    const found = await prisma.subscriptionPlan.findFirst({ where: { name: plan.name } });
    if (!found) {
      await prisma.subscriptionPlan.create({ data: plan });
      console.log(`✅ Created plan: ${plan.name}`);
    }
  }

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
