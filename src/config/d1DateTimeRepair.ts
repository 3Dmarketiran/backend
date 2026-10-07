import { env } from "./env";

/**
 * D1 stores DateTime values as SQLite text. Older migration/import paths
 * can leave ISO timestamps without a timezone suffix, e.g.
 * `2026-09-20T22:15:01.669`.
 *
 * Prisma's D1 adapter expects an RFC3339/ISO-8601 timestamp with an
 * explicit timezone. This repair is intentionally idempotent and uses
 * the Cloudflare D1 HTTP API so it runs correctly from Render without
 * requiring Wrangler or a local D1 binding.
 */
const DATE_COLUMNS: Record<string, string[]> = {
  User: ["createdAt", "updatedAt"],
  Session: ["expiresAt", "createdAt"],
  LoginAttempt: ["createdAt"],
  Seller: ["createdAt", "updatedAt"],
  Category: ["createdAt", "updatedAt"],
  Product: ["createdAt", "updatedAt", "publishedAt"],
  ProductImage: ["createdAt"],
  ProductAssetPackage: ["createdAt", "updatedAt"],
  ProductModel: ["createdAt"],
  SubscriptionPlanCategory: ["createdAt", "updatedAt"],
  SubscriptionPlan: ["createdAt", "updatedAt"],
  Subscription: ["startDate", "endDate", "createdAt", "updatedAt"],
  TrafficBundle: ["createdAt", "updatedAt"],
  TrafficUsage: ["periodStart", "periodEnd", "createdAt", "updatedAt"],
  TrafficPurchase: [
    "periodStart",
    "periodEnd",
    "requestedAt",
    "approvedAt",
    "rejectedAt",
  ],
  PublishJob: ["requestedAt", "startedAt", "finishedAt"],
  PublishLog: ["createdAt"],
  AnalyticsEvent: ["createdAt"],
  AuditLog: ["createdAt"],
  PlatformSetting: ["updatedAt"],
};

function buildRepairSql() {
  return Object.entries(DATE_COLUMNS)
    .flatMap(([table, columns]) =>
      columns.map(
        (column) => `
UPDATE "${table}"
SET "${column}" = "${column}" || 'Z'
WHERE "${column}" IS NOT NULL
  AND typeof("${column}") = 'text'
  AND length("${column}") >= 19
  AND substr("${column}", 20, 1) NOT IN ('Z', '+', '-')
  AND substr("${column}", 11, 1) = 'T';`,
      ),
    )
    .join("\n");
}

export async function repairD1DateTimes(): Promise<number> {
  const endpoint =
    `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}` +
    `/d1/database/${env.CLOUDFLARE_DATABASE_ID}/query`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_D1_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sql: buildRepairSql(),
    }),
  });

  const payload = (await response.json()) as {
    success?: boolean;
    errors?: Array<{ message?: string }>;
    result?: Array<{ meta?: { changes?: number } }>;
  };

  if (!response.ok || payload.success === false) {
    const detail =
      payload.errors?.map((error) => error.message).filter(Boolean).join("; ") ||
      `HTTP ${response.status}`;
    throw new Error(`D1 DateTime repair failed: ${detail}`);
  }

  return (payload.result ?? []).reduce(
    (total, result) => total + Number(result.meta?.changes ?? 0),
    0,
  );
}
