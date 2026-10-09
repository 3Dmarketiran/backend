import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import { requireAdmin, requireOwnSeller } from "../middleware/rbac";
import { HttpError } from "../middleware/errorHandler";
import { getUtcTrafficPeriod, getTrafficSnapshot, serializeTrafficSnapshot, bundlePriceFloor } from "../services/trafficService";

export const trafficRouter = Router();

const idSchema = z.string().trim().min(1);
const purchaseSchema = z.object({ bundleId: idSchema, paymentReference: z.string().trim().max(120).optional(), notes: z.string().trim().max(1000).optional() });
const bundleSchema = z.object({ name: z.string().trim().min(2).max(120), gigabytes: z.number().int().positive().max(1000), priceToman: z.number().int().positive(), sortOrder: z.number().int().min(0).optional(), isActive: z.boolean().optional() });

function actorIsAdmin(req: any) { return req.user?.role === "ADMIN" || req.user?.role === "SUPER_ADMIN"; }

async function sellerPeriod(sellerId: string) {
  const seller = await prisma.seller.findUnique({ where: { id: sellerId }, select: { id: true, storeName: true } });
  if (!seller) throw new HttpError(404, "فروشنده یافت نشد.");
  const { periodStart, periodEnd } = getUtcTrafficPeriod();
  return { seller, periodStart, periodEnd };
}

trafficRouter.get("/bundles", async (req, res, next) => {
  try {
    const admin = actorIsAdmin(req);
    const bundles = await prisma.trafficBundle.findMany({ where: admin && req.query.includeInactive === "true" ? {} : { isActive: true }, orderBy: [{ sortOrder: "asc" }, { gigabytes: "asc" }] });
    res.json({ bundles });
  } catch (err) { next(err); }
});

trafficRouter.get("/me", requireAuth, requireOwnSeller(), async (req, res, next) => {
  try {
    const sellerId = req.user!.seller!.id;
    const [snapshot, purchases, bundles] = await Promise.all([
      getTrafficSnapshot(sellerId),
      prisma.trafficPurchase.findMany({ where: { sellerId }, include: { bundle: true }, orderBy: { requestedAt: "desc" }, take: 20 }),
      prisma.trafficBundle.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { gigabytes: "asc" }] }),
    ]);
    res.json({ traffic: serializeTrafficSnapshot(snapshot), purchases, bundles });
  } catch (err) { next(err); }
});

trafficRouter.post("/purchases", requireAuth, requireOwnSeller(), async (req, res, next) => {
  try {
    const input = purchaseSchema.parse(req.body);
    const sellerId = req.user!.seller!.id;
    const { periodStart, periodEnd } = await sellerPeriod(sellerId);
    const activeSub = await prisma.subscription.findFirst({ where: { sellerId, status: "ACTIVE", startDate: { lte: new Date() }, endDate: { gte: new Date() }, plan: { is: { isActive: true } } }, select: { id: true } });
    if (!activeSub) throw new HttpError(403, "برای خرید ترافیک اضافه، فروشگاه باید اشتراک فعال داشته باشد.");
    const bundle = await prisma.trafficBundle.findFirst({ where: { id: input.bundleId, isActive: true } });
    if (!bundle) throw new HttpError(404, "بسته ترافیک انتخاب‌شده یافت نشد.");
    if (bundle.priceToman < bundlePriceFloor(bundle.gigabytes)) {
      throw new HttpError(409, "این بسته به‌دلیل پایین‌بودن قیمت نسبت به هزینه محافظتی سیستم قابل فروش نیست. تنظیمات قیمت را در پنل مدیریت اصلاح کنید.");
    }
    const existingPending = await prisma.trafficPurchase.findFirst({ where: { sellerId, bundleId: bundle.id, periodStart, periodEnd, status: "PENDING" } });
    if (existingPending) throw new HttpError(409, "برای این بسته یک درخواست پرداخت در انتظار بررسی دارید.");
    const purchase = await prisma.trafficPurchase.create({ data: { sellerId, bundleId: bundle.id, periodStart, periodEnd, gigabytes: bundle.gigabytes, priceToman: bundle.priceToman, paymentReference: input.paymentReference || null, notes: input.notes || null } , include: { bundle: true } });
    await prisma.auditLog.create({ data: { actorId: req.user!.id, sellerId, action: "TRAFFIC_PURCHASE_REQUESTED", entity: "TrafficPurchase", entityId: purchase.id, metadata: JSON.stringify({ bundleId: bundle.id, gigabytes: bundle.gigabytes, priceToman: bundle.priceToman }), ipAddress: req.ip } });
    res.status(201).json({ purchase });
  } catch (err) { next(err); }
});

trafficRouter.get("/admin/overview", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const { periodStart, periodEnd } = getUtcTrafficPeriod();
    const [sellers, usages, purchases] = await Promise.all([
      prisma.seller.findMany({ include: { subscriptions: { where: { status: "ACTIVE", startDate: { lte: new Date() }, endDate: { gte: new Date() }, plan: { is: { isActive: true } } }, include: { plan: true }, orderBy: { endDate: "desc" }, take: 1 }, _count: { select: { products: true } } }, orderBy: { createdAt: "desc" } }),
      prisma.trafficUsage.findMany({ where: { periodStart, periodEnd } }),
      prisma.trafficPurchase.groupBy({ by: ["sellerId"], where: { periodStart, periodEnd, status: "PAID" }, _sum: { gigabytes: true } }),
    ]);
    const usageMap = new Map(usages.map(u => [u.sellerId, u]));
    const purchaseMap = new Map(purchases.map(p => [p.sellerId, p._sum.gigabytes ?? 0]));
    const rows = sellers.map(s => {
      const usage = usageMap.get(s.id);
      const plan = s.subscriptions[0]?.plan;
      const usedBytes = usage?.servedBytes ?? 0n;
      const purchasedGb = purchaseMap.get(s.id) ?? 0;
      const includedGb = plan
        ? (plan.trafficLimitGb ?? (plan.productLimit === 10 && plan.storageLimitMb === 500 ? 5 : plan.productLimit === 30 && plan.storageLimitMb === 1536 ? 12 : plan.productLimit === 100 && plan.storageLimitMb === 5120 ? 25 : 0))
        : null;
      const allowanceGb = includedGb == null ? null : includedGb + purchasedGb;
      const allowanceBytes = allowanceGb == null ? null : BigInt(allowanceGb) * (1024n ** 3n);
      const usedGb = Number(usedBytes) / Number(1024n ** 3n);
      const percent = allowanceGb == null || allowanceGb === 0 ? null : Math.min(100, (usedGb / allowanceGb) * 100);
      return { sellerId: s.id, storeName: s.storeName, isActive: s.isActive, productCount: s._count.products, plan: plan ? { id: plan.id, name: plan.name, trafficLimitGb: plan.trafficLimitGb, price: plan.price } : null, usedGb, includedGb, purchasedGb, allowanceGb, remainingGb: allowanceGb == null ? null : Math.max(0, allowanceGb - usedGb), usedPercent: percent, warningLevel: percent == null ? "NORMAL" : percent >= 100 ? "EXCEEDED" : percent >= 85 ? "DANGER" : percent >= 70 ? "WARNING" : "NORMAL", usedBytes: Number(usedBytes), allowanceBytes: allowanceBytes == null ? null : Number(allowanceBytes), periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() };
    });
    const pending = await prisma.trafficPurchase.findMany({ where: { status: "PENDING" }, include: { seller: { select: { storeName: true } }, bundle: true }, orderBy: { requestedAt: "asc" }, take: 100 });
    res.json({ periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(), sellers: rows, pendingPurchases: pending });
  } catch (err) { next(err); }
});

trafficRouter.post("/admin/purchases/:id/approve", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const purchase = await prisma.trafficPurchase.findUnique({ where: { id }, include: { bundle: true, seller: { select: { storeName: true } } } });
    if (!purchase) throw new HttpError(404, "درخواست ترافیک پیدا نشد.");
    if (purchase.status !== "PENDING") throw new HttpError(409, "این درخواست دیگر در انتظار تأیید نیست.");
    const now = new Date();
    if (purchase.periodEnd <= now) throw new HttpError(409, "دوره این درخواست تمام شده است و قابل تأیید نیست.");
    const updated = await prisma.trafficPurchase.update({ where: { id }, data: { status: "PAID", approvedAt: now, approvedById: req.user!.id } , include: { bundle: true } });
    await prisma.auditLog.create({ data: { actorId: req.user!.id, sellerId: purchase.sellerId, action: "TRAFFIC_PURCHASE_APPROVED", entity: "TrafficPurchase", entityId: id, metadata: JSON.stringify({ gigabytes: updated.gigabytes, priceToman: updated.priceToman }), ipAddress: req.ip } });
    res.json({ purchase: updated });
  } catch (err) { next(err); }
});

trafficRouter.post("/admin/purchases/:id/reject", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const purchase = await prisma.trafficPurchase.findUnique({ where: { id } });
    if (!purchase) throw new HttpError(404, "درخواست ترافیک پیدا نشد.");
    if (purchase.status !== "PENDING") throw new HttpError(409, "این درخواست دیگر در انتظار بررسی نیست.");
    const updated = await prisma.trafficPurchase.update({ where: { id }, data: { status: "REJECTED", rejectedAt: new Date() } });
    await prisma.auditLog.create({ data: { actorId: req.user!.id, sellerId: purchase.sellerId, action: "TRAFFIC_PURCHASE_REJECTED", entity: "TrafficPurchase", entityId: id, ipAddress: req.ip } });
    res.json({ purchase: updated });
  } catch (err) { next(err); }
});

trafficRouter.post("/admin/bundles", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const input = bundleSchema.parse(req.body);
    if (input.priceToman < bundlePriceFloor(input.gigabytes)) throw new HttpError(409, `قیمت این بسته باید حداقل ${bundlePriceFloor(input.gigabytes).toLocaleString("fa-IR")} تومان باشد.`);
    const bundle = await prisma.trafficBundle.create({ data: { name: input.name, gigabytes: input.gigabytes, priceToman: input.priceToman, sortOrder: input.sortOrder ?? 0, isActive: input.isActive ?? true } });
    res.status(201).json({ bundle });
  } catch (err) { next(err); }
});

trafficRouter.put("/admin/bundles/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const input = bundleSchema.partial().parse(req.body);
    const current = await prisma.trafficBundle.findUnique({ where: { id } });
    if (!current) throw new HttpError(404, "بسته ترافیک پیدا نشد.");
    const gb = input.gigabytes ?? current.gigabytes;
    const price = input.priceToman ?? current.priceToman;
    if (price < bundlePriceFloor(gb)) throw new HttpError(409, `قیمت این بسته باید حداقل ${bundlePriceFloor(gb).toLocaleString("fa-IR")} تومان باشد.`);
    const bundle = await prisma.trafficBundle.update({ where: { id }, data: { ...input, gigabytes: gb, priceToman: price } });
    res.json({ bundle });
  } catch (err) { next(err); }
});

export default trafficRouter;
