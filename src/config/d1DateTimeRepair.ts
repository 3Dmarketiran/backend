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
SET "${column}" = CASE
  /* A timestamp ending in one or more Z characters is normalized to one Z. */
  WHEN substr(rtrim("${column}", 'Z'),  -6, 1) IN ('+', '-')
       AND substr(rtrim("${column}", 'Z'), -3, 1) = ':'
       AND length(rtrim("${column}", 'Z')) >= 25
    THEN rtrim("${column}", 'Z')
  WHEN substr("${column}", -1) = 'Z'
    THEN rtrim("${column}", 'Z') || 'Z'
  /* Bare ISO timestamps (no offset) get exactly one UTC marker. */
  WHEN substr("${column}", 5, 1) = '-'
       AND substr("${column}", 8, 1) = '-'
       AND substr("${column}", 11, 1) = 'T'
       AND substr("${column}", 14, 1) = ':'
       AND substr("${column}", 17, 1) = ':'
       AND substr("${column}", -1) NOT IN ('Z')
       AND NOT (
         substr("${column}", -6, 1) IN ('+', '-')
         AND substr("${column}", -3, 1) = ':'
       )
    THEN "${column}" || 'Z'
  ELSE "${column}"
END
WHERE "${column}" IS NOT NULL
  AND typeof("${column}") = 'text';`,
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
