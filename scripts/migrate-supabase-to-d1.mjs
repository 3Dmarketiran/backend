#!/usr/bin/env node
/**
 * Supabase -> Cloudflare D1 migration
 *
 * READ-ONLY on Supabase:
 *   - Uses Supabase REST GET requests only.
 *   - Never INSERT/UPDATE/DELETEs Supabase.
 *
 * WRITE target:
 *   - POSTs batches (max 100 rows) to the D1 import Worker.
 *   - The Worker must expose POST /import and require x-import-token.
 *
 * Required environment variables:
 *   SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *   D1_IMPORT_URL=https://your-worker.example.com/import
 *   D1_IMPORT_TOKEN=...
 *
 * Optional:
 *   MIGRATION_BATCH_SIZE=100
 *   SUPABASE_PAGE_SIZE=1000
 *   MIGRATION_TABLES=User,Seller,Product
 *
 * Run:
 *   npm run migrate:supabase:d1
 */

import process from "node:process";

const TABLE_ORDER = [
  "User",
  "Category",
  "Session",
  "LoginAttempt",
  "SubscriptionPlanCategory",
  "TrafficBundle",
  "PlatformSetting",
  "Seller",
  "Product",
  "ProductImage",
  "ProductAssetPackage",
  "ProductModel",
  "SubscriptionPlan",
  "Subscription",
  "TrafficUsage",
  "TrafficPurchase",
  "PublishJob",
  "PublishLog",
  "AnalyticsEvent",
  "AuditLog",
];

const MAX_IMPORT_BATCH = 100;
const batchSize = Math.min(
  MAX_IMPORT_BATCH,
  Math.max(1, Number(process.env.MIGRATION_BATCH_SIZE || MAX_IMPORT_BATCH))
);
const pageSize = Math.min(
  1000,
  Math.max(1, Number(process.env.SUPABASE_PAGE_SIZE || 1000))
);

const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const d1ImportUrl = requiredEnv("D1_IMPORT_URL");
const d1ImportToken = requiredEnv("D1_IMPORT_TOKEN");

const requestedTables = process.env.MIGRATION_TABLES
  ? process.env.MIGRATION_TABLES.split(",").map((x) => x.trim()).filter(Boolean)
  : TABLE_ORDER;

const invalid = requestedTables.filter((t) => !TABLE_ORDER.includes(t));
if (invalid.length) {
  fail(
    `Invalid MIGRATION_TABLES value: ${invalid.join(", ")}. ` +
      `Allowed: ${TABLE_ORDER.join(", ")}`
  );
}

const startedAt = Date.now();
let totalImported = 0;

console.log("============================================================");
console.log("3DMarketIran — Supabase -> D1 migration");
console.log("============================================================");
console.log(`Supabase: ${supabaseUrl}`);
console.log(`D1 import: ${d1ImportUrl}`);
console.log(`Batch size: ${batchSize}`);
console.log(`Page size: ${pageSize}`);
console.log(`Tables: ${requestedTables.join(", ")}`);
console.log("");
console.log("SAFETY: Supabase is accessed with GET requests only.");
console.log("SAFETY: D1 import uses in-place UPSERT, not INSERT OR REPLACE.");
console.log("SAFETY: Category rows are imported parent-before-child.");
console.log("SAFETY: _prisma_migrations and object storage are excluded.");
console.log("");

for (const table of requestedTables) {
  const count = table === "Category"
    ? await migrateCategories()
    : await migrateTable(table);
  totalImported += count;
}

const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log("");
console.log("============================================================");
console.log("MIGRATION COMPLETED");
console.log(`Rows sent to D1: ${totalImported}`);
console.log(`Elapsed: ${seconds}s`);
console.log("Supabase was not modified by this script.");
console.log("============================================================");

async function migrateTable(table) {
  console.log(`\n[${table}] Reading Supabase...`);

  let offset = 0;
  let tableTotal = 0;

  while (true) {
    const rows = await fetchSupabasePage(table, offset, pageSize);

    if (!Array.isArray(rows)) {
      throw new Error(`[${table}] Supabase returned a non-array response.`);
    }

    if (rows.length === 0) break;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      await importToD1(table, batch);

      tableTotal += batch.length;
      console.log(
        `[${table}] imported ${tableTotal} row(s) (latest batch: ${batch.length})`
      );
    }

    offset += rows.length;
    if (rows.length < pageSize) break;
  }

  console.log(`[${table}] DONE — ${tableTotal} row(s)`);
  return tableTotal;
}

async function migrateCategories() {
  console.log("\n[Category] Reading all rows for parent-first import...");

  const allRows = [];
  let offset = 0;

  while (true) {
    const rows = await fetchSupabasePage("Category", offset, pageSize);

    if (!Array.isArray(rows)) {
      throw new Error("[Category] Supabase returned a non-array response.");
    }

    if (rows.length === 0) break;

    allRows.push(...rows);
    offset += rows.length;

    if (rows.length < pageSize) break;
  }

  const byId = new Map(allRows.map((row) => [String(row.id), row]));
  const children = new Map();

  for (const row of allRows) {
    if (row.parentId && byId.has(String(row.parentId))) {
      const key = String(row.parentId);
      if (!children.has(key)) children.set(key, []);
      children.get(key).push(row);
    }
  }

  const ordered = [];
  const visited = new Set();

  const visit = (row) => {
    const id = String(row.id);
    if (visited.has(id)) return;
    visited.add(id);
    ordered.push(row);

    for (const child of children.get(id) || []) {
      visit(child);
    }
  };

  // Roots first.
  for (const row of allRows) {
    if (!row.parentId || !byId.has(String(row.parentId))) {
      visit(row);
    }
  }

  // If bad legacy data contains a cycle, do not silently lose rows.
  for (const row of allRows) {
    visit(row);
  }

  let tableTotal = 0;
  for (let i = 0; i < ordered.length; i += batchSize) {
    const batch = ordered.slice(i, i + batchSize);
    await importToD1("Category", batch);
    tableTotal += batch.length;
    console.log(
      `[Category] imported ${tableTotal} row(s) (latest batch: ${batch.length})`
    );
  }

  console.log(`[Category] DONE — ${tableTotal} row(s)`);
  return tableTotal;
}

async function fetchSupabasePage(table, offset, limit) {
  const url = new URL(`${supabaseUrl}/rest/v1/${encodeURIComponent(table)}`);

  url.searchParams.set("select", "*");
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("order", "id.asc");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await safeBody(response);
    throw new Error(
      `[${table}] Supabase GET failed: HTTP ${response.status}\n${body}`
    );
  }

  return response.json();
}

async function importToD1(table, rows) {
  if (rows.length > MAX_IMPORT_BATCH) {
    throw new Error(
      `[${table}] Internal safety check failed: batch contains ${rows.length} rows.`
    );
  }

  const response = await fetch(d1ImportUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-import-token": d1ImportToken,
      Accept: "application/json",
    },
    body: JSON.stringify({ table, rows }),
  });

  const body = await safeBody(response);

  if (!response.ok) {
    throw new Error(
      `[${table}] D1 import failed: HTTP ${response.status}\n${body}`
    );
  }

  let result;
  try {
    result = JSON.parse(body);
  } catch {
    throw new Error(`[${table}] D1 import returned invalid JSON:\n${body}`);
  }

  if (!result.ok) {
    throw new Error(
      `[${table}] D1 import returned ok=false:\n${JSON.stringify(result, null, 2)}`
    );
  }

  if (result.imported !== rows.length) {
    throw new Error(
      `[${table}] D1 import count mismatch. ` +
        `Sent ${rows.length}, imported ${result.imported}.`
    );
  }
}

async function safeBody(response) {
  return response.text();
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    fail(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function fail(message) {
  console.error(`\nERROR: ${message}`);
  process.exit(1);
}
