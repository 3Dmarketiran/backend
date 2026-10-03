import { prisma } from "../config/prisma";
import { HttpError } from "../middleware/errorHandler";
import { env } from "../config/env";

export const BYTES_PER_GB = 1024n * 1024n * 1024n;

export type TrafficSnapshot = {
  periodStart: Date;
  periodEnd: Date;
  includedBytes: bigint;
  purchasedBytes: bigint;
  usedBytes: bigint;
  remainingBytes: bigint | null;
  usedPercent: number | null;
  warningLevel: "NORMAL" | "WARNING" | "DANGER" | "EXCEEDED";
  plan: {
    id: string;
    name: string;
    trafficLimitGb: number | null;
  } | null;
  pendingPurchases: number;
};

export function getUtcTrafficPeriod(now = new Date()) {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { periodStart, periodEnd };
}

function bytesFromGb(gb: number | null | undefined): bigint | null {
  if (gb == null) return null;
  if (!Number.isInteger(gb) || gb < 0) throw new Error("Invalid traffic quota.");
  return BigInt(gb) * BYTES_PER_GB;
}

function toSafeNumber(value: bigint): number {
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : Number.MAX_SAFE_INTEGER;
}

export function trafficWarningLevel(used: bigint, allowance: bigint | null): TrafficSnapshot["warningLevel"] {
  if (allowance == null) return "NORMAL";
  if (allowance <= 0n) return used > 0n ? "EXCEEDED" : "NORMAL";
  const pct = Number((used * 10000n) / allowance) / 100;
  if (pct >= 100) return "EXCEEDED";
  if (pct >= 85) return "DANGER";
  if (pct >= 70) return "WARNING";
  return "NORMAL";
}

async function currentSubscription(sellerId: string, now = new Date()) {
  return prisma.subscription.findFirst({
    where: {
      sellerId,
      status: "ACTIVE",
      startDate: { lte: now },
      endDate: { gte: now },
      plan: { is: { isActive: true } },
    },
    include: { plan: true },
    orderBy: { endDate: "desc" },
  });
}

async function ensureUsageRow(sellerId: string, periodStart: Date, periodEnd: Date) {
  return prisma.trafficUsage.upsert({
    where: { sellerId_periodStart: { sellerId, periodStart } },
    create: { sellerId, periodStart, periodEnd },
    update: { periodEnd },
  });
}

async function purchasedBytesForPeriod(sellerId: string, periodStart: Date, periodEnd: Date) {
  const result = await prisma.trafficPurchase.aggregate({
    where: {
      sellerId,
      periodStart,
      periodEnd,
      status: "PAID",
    },
    _sum: { gigabytes: true },
  });
  return BigInt(result._sum.gigabytes ?? 0) * BYTES_PER_GB;
}

export async function getTrafficSnapshot(sellerId: string, now = new Date()): Promise<TrafficSnapshot> {
  const { periodStart, periodEnd } = getUtcTrafficPeriod(now);
  const [sub, usage, purchasedBytes, pendingCount] = await Promise.all([
    currentSubscription(sellerId, now),
    ensureUsageRow(sellerId, periodStart, periodEnd),
    purchasedBytesForPeriod(sellerId, periodStart, periodEnd),
    prisma.trafficPurchase.count({ where: { sellerId, periodStart, periodEnd, status: "PENDING" } }),
  ]);

  const includedBytes = bytesFromGb(sub?.plan.trafficLimitGb);
  const usedBytes = BigInt(usage.servedBytes);
  const allowance = includedBytes == null ? null : includedBytes + purchasedBytes;
  const remainingBytes = allowance == null ? null : allowance > usedBytes ? allowance - usedBytes : 0n;
  const usedPercent = allowance == null || allowance === 0n ? null : Math.min(100, Number((usedBytes * 10000n) / allowance) / 100);

  return {
    periodStart,
    periodEnd,
    includedBytes: includedBytes ?? 0n,
    purchasedBytes,
    usedBytes,
    remainingBytes,
    usedPercent,
    warningLevel: trafficWarningLevel(usedBytes, allowance),
    plan: sub ? { id: sub.plan.id, name: sub.plan.name, trafficLimitGb: sub.plan.trafficLimitGb } : null,
    pendingPurchases: pendingCount,
  };
}

export async function reserveTrafficOrThrow(sellerId: string, bytes: number, now = new Date()): Promise<() => Promise<void>> {
  if (!Number.isFinite(bytes) || bytes < 0 || !Number.isSafeInteger(bytes)) {
    throw new HttpError(400, "حجم فایل برای محاسبه ترافیک نامعتبر است.");
  }
  const requested = BigInt(bytes);
  if (requested === 0n) return async () => undefined;

  const { periodStart, periodEnd } = getUtcTrafficPeriod(now);
  const [sub, purchasedBytes] = await Promise.all([
    currentSubscription(sellerId, now),
    purchasedBytesForPeriod(sellerId, periodStart, periodEnd),
  ]);

  if (!sub) throw new HttpError(403, "اشتراک فعال این فروشگاه پیدا نشد.");
  const includedBytes = bytesFromGb(sub.plan.trafficLimitGb);
  if (includedBytes == null) return async () => undefined;

  const allowance = includedBytes + purchasedBytes;
  const usage = await ensureUsageRow(sellerId, periodStart, periodEnd);
  const updated = await prisma.$executeRaw`
    UPDATE "TrafficUsage"
    SET "servedBytes" = "servedBytes" + ${requested}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${usage.id}
      AND "servedBytes" + ${requested} <= ${allowance}
  `;

  if (updated !== 1) {
    const snapshot = await getTrafficSnapshot(sellerId, now);
    throw new HttpError(429, `سقف ترافیک ماهانه این فروشگاه تکمیل شده است. مصرف: ${formatGb(snapshot.usedBytes)} از ${formatGb(allowance)}. برای ادامه، بسته ترافیک اضافه خریداری یا پلن را ارتقا دهید.`);
  }

  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await prisma.trafficUsage.update({
      where: { id: usage.id },
      data: { servedBytes: { decrement: requested } },
    }).catch(() => undefined);
  };
}

export async function recordLegacyTrafficOrThrow(sellerId: string, bytes: number, now = new Date()) {
  return reserveTrafficOrThrow(sellerId, bytes, now);
}

export function formatGb(bytes: bigint | number): string {
  const b = typeof bytes === "number" ? BigInt(Math.max(0, Math.trunc(bytes))) : bytes;
  const gb = Number(b) / Number(BYTES_PER_GB);
  return `${gb >= 10 ? gb.toFixed(1) : gb.toFixed(2)} GB`;
}

export function pricingFloorForTraffic(trafficLimitGb: number, durationDays = 30): number {
  if (!Number.isInteger(trafficLimitGb) || trafficLimitGb < 0) throw new Error("Invalid traffic quota.");
  if (!Number.isInteger(durationDays) || durationDays <= 0) throw new Error("Invalid plan duration.");
  // Calendar-month traffic is conservative for long subscriptions: a 365-day
  // subscription can touch 13 calendar months, so we protect for 13 quotas.
  const coveredMonths = Math.max(1, Math.ceil(durationDays / 30));
  const monthlyCost = trafficLimitGb * env.TRAFFIC_COST_PER_GB_TOMAN + env.TRAFFIC_FIXED_COST_TOMAN;
  return Math.ceil(monthlyCost * coveredMonths * (1 + env.TRAFFIC_MIN_PRICE_MARGIN_PCT / 100));
}

export function bundlePriceFloor(gigabytes: number): number {
  return Math.ceil(gigabytes * env.TRAFFIC_COST_PER_GB_TOMAN * (1 + env.TRAFFIC_BUNDLE_MIN_MARGIN_PCT / 100));
}

export function serializeTrafficSnapshot(snapshot: TrafficSnapshot) {
  return {
    periodStart: snapshot.periodStart.toISOString(),
    periodEnd: snapshot.periodEnd.toISOString(),
    includedBytes: toSafeNumber(snapshot.includedBytes),
    purchasedBytes: toSafeNumber(snapshot.purchasedBytes),
    usedBytes: toSafeNumber(snapshot.usedBytes),
    remainingBytes: snapshot.remainingBytes == null ? null : toSafeNumber(snapshot.remainingBytes),
    includedGb: Number(snapshot.includedBytes) / Number(BYTES_PER_GB),
    purchasedGb: Number(snapshot.purchasedBytes) / Number(BYTES_PER_GB),
    usedGb: Number(snapshot.usedBytes) / Number(BYTES_PER_GB),
    remainingGb: snapshot.remainingBytes == null ? null : Number(snapshot.remainingBytes) / Number(BYTES_PER_GB),
    usedPercent: snapshot.usedPercent,
    warningLevel: snapshot.warningLevel,
    plan: snapshot.plan,
    pendingPurchases: snapshot.pendingPurchases,
  };
}
