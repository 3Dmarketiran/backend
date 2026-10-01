import { Router } from "express";
import { prisma } from "../config/prisma";
import { parseJson } from "../utils/json";
import { storage } from "../storage";
import { HttpError } from "../middleware/errorHandler";
import { readPackageAsset, getPackageContentType, parsePackageStorageKey, packageAssetUrl } from "../services/productPackageService";

export const publicCatalogRouter = Router();


/**
 * Public model/AR asset proxy.
 *
 * Model files are served through the API instead of exposing a provider URL
 * directly to the browser. This keeps the public catalog independent from the
 * current storage provider/domain and gives GLB/USDZ consistent CORS + MIME
 * headers after a custom-domain migration.
 *
 * URL shape intentionally mirrors the storage key so GLTF relative
 * dependencies (.bin/textures) continue to resolve from the same directory.
 */
publicCatalogRouter.get("/package/:productId/:kind/*", async (req, res, next) => {
  try {
    const productId = String(req.params.productId || "");
    const kind = String(req.params.kind || "") as "images" | "models" | "ar";
    const raw = String((req.params as Record<string, string | undefined>)["0"] || "").replace(/^\/+/, "");
    const name = decodeURIComponent(raw).replace(/\\/g, "/");
    if (!productId || !["images", "models", "ar"].includes(kind) || !name || name.includes("..")) throw new HttpError(404, "فایل عمومی پیدا نشد.");
    const now = new Date();
    const product = await prisma.product.findFirst({
      where: { id: productId, visibility: "PUBLISHED", hasUnpublishedChanges: false, seller: { isActive: true, subscriptions: { some: { status: "ACTIVE", startDate: { lte: now }, endDate: { gte: now }, plan: { is: { isActive: true } } } } } },
      select: { id: true },
    });
    if (!product) throw new HttpError(404, "فایل محصول منتشرشده پیدا نشد.");
    const buffer = await readPackageAsset(productId, kind, name);
    res.setHeader("Content-Type", getPackageContentType(name));
    res.setHeader("Content-Length", String(buffer.byteLength));
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.send(buffer);
  } catch (error) { next(error); }
});

publicCatalogRouter.get("/assets/*", async (req, res, next) => {
  try {
    const wildcardParam = (req.params as Record<string, string | undefined>)["0"];
    const rawKey = String(wildcardParam ?? "").replace(/^\/+/, "");
    const key = decodeURIComponent(rawKey).replace(/\\/g, "/");

    if (!key) {
      throw new HttpError(404, "فایل عمومی پیدا نشد.");
    }

    const parts = key.split("/");
    const resource = parts[0];
    const resourceId = parts[1];
    const now = new Date();

    if (resource === "products") {
      const assetType = parts[2];
      if (!resourceId || (assetType !== "models" && assetType !== "images" && assetType !== "ar")) {
        throw new HttpError(404, "فایل محصول معتبر نیست.");
      }

      const product = await prisma.product.findFirst({
        where: {
          id: resourceId,
          visibility: "PUBLISHED",
          hasUnpublishedChanges: false,
          seller: {
            isActive: true,
            subscriptions: {
              some: {
                status: "ACTIVE",
                startDate: { lte: now },
                endDate: { gte: now },
                plan: { is: { isActive: true } },
              },
            },
          },
        },
        select: { id: true },
      });

      if (!product) {
        throw new HttpError(404, "فایل محصول منتشرشده پیدا نشد.");
      }
    } else if (resource === "sellers") {
      if (!resourceId || parts[2] !== "logo") {
        throw new HttpError(404, "فایل فروشگاه معتبر نیست.");
      }

      const seller = await prisma.seller.findFirst({
        where: {
          id: resourceId,
          isActive: true,
          subscriptions: {
            some: {
              status: "ACTIVE",
              startDate: { lte: now },
              endDate: { gte: now },
              plan: { is: { isActive: true } },
            },
          },
        },
        select: { id: true },
      });

      if (!seller) {
        throw new HttpError(404, "لوگوی فروشگاه پیدا نشد.");
      }
    } else {
      throw new HttpError(404, "فایل عمومی پیدا نشد.");
    }

    const buffer = await storage.read(key);
    const contentType = getAssetContentType(key);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(buffer.byteLength));
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Live public catalog. This endpoint is intentionally read-only and does not
 * require authentication. GitHub Pages uses it as the live source of truth;
 * the generated public-data snapshot remains a safe fallback for outages.
 */


const visitorCountryCache = new Map<string, { country: string; expiresAt: number }>();

/**
 * Lightweight country signal used only for the optional Iran connectivity notice.
 * Cloudflare's CF-IPCountry is preferred when present; otherwise the backend
 * performs a short, non-persistent lookup using the visitor IP.
 */
publicCatalogRouter.get("/visitor-country", async (req, res, next) => {
  try {
    const cloudflareCountry = String(req.get("CF-IPCountry") || "").trim().toUpperCase();
    const viaCloudflare = Boolean(req.get("CF-Ray") || req.get("CF-Connecting-IP"));
    if (viaCloudflare && /^[A-Z]{2}$/.test(cloudflareCountry)) {
      res.setHeader("Cache-Control", "private, max-age=300");
      return res.json({ country: cloudflareCountry });
    }

    const ip = String(req.ip || "").replace(/^::ffff:/, "").trim();
    if (!ip || ip === "::1" || ip === "127.0.0.1" || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(ip)) {
      res.setHeader("Cache-Control", "private, max-age=300");
      return res.json({ country: "XX" });
    }

    const cached = visitorCountryCache.get(ip);
    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader("Cache-Control", "private, max-age=300");
      return res.json({ country: cached.country });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    try {
      const response = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/country/`, {
        signal: controller.signal,
        headers: { Accept: "text/plain", "User-Agent": "3DMarketIran/1.0" },
      });
      const country = response.ok ? (await response.text()).trim().toUpperCase() : "XX";
      const normalized = /^[A-Z]{2}$/.test(country) ? country : "XX";
      visitorCountryCache.set(ip, { country: normalized, expiresAt: Date.now() + 10 * 60 * 1000 });
      res.setHeader("Cache-Control", "private, max-age=300");
      return res.json({ country: normalized });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      return res.json({ country: "XX" });
    }
    next(error);
  }
});

publicCatalogRouter.get("/catalog", async (req, res, next) => {
  try {
    const now = new Date();

    const [products, sellers, settings, plans, planCategories] = await Promise.all([
      prisma.product.findMany({
        where: {
          AND: [
            {
              seller: {
                isActive: true,
                subscriptions: {
                  some: {
                    status: "ACTIVE",
                    startDate: { lte: now },
                    endDate: { gte: now },
                    plan: { is: { isActive: true } },
                  },
                },
              },
            },
            {
              visibility: "PUBLISHED",
              hasUnpublishedChanges: false,
            },
          ],
        },
        include: {
          images: { orderBy: { sortOrder: "asc" } },
          models: true,
          seller: {
            select: {
              id: true,
              slug: true,
              storeName: true,
              logoStorageKey: true,
            },
          },
        },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      }),
      prisma.seller.findMany({
        where: {
          isActive: true,
          subscriptions: {
            some: {
              status: "ACTIVE",
              startDate: { lte: now },
              endDate: { gte: now },
              plan: { is: { isActive: true } },
            },
          },
        },
      }),
      prisma.platformSetting.findUnique({ where: { id: "singleton" } }),
      prisma.subscriptionPlan.findMany({
        where: { isActive: true },
        include: { category: true },
        orderBy: [{ sortOrder: "asc" }, { durationDays: "asc" }],
      }),
      prisma.subscriptionPlanCategory.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    const productIds = products.map((product) => product.id);
    const viewRows = productIds.length
      ? await prisma.analyticsEvent.groupBy({
          by: ["productId"],
          where: {
            productId: { in: productIds },
            type: { in: ["PRODUCT_VIEW", "PRODUCT_DETAIL_VIEW"] },
          },
          _count: { _all: true },
        })
      : [];
    const viewCounts = new Map(viewRows.map((row) => [row.productId, row._count._all]));

    const publicProducts = await Promise.all(products.map(async (product) => ({
      id: product.id,
      slug: product.slug,
      name: product.name,
      shortDescription: product.shortDescription,
      fullDescription: product.fullDescription,
      tags: product.tags?.split(",").map((tag) => tag.trim()).filter(Boolean) ?? [],
      material: product.material ?? null,
      colors: (() => {
        try { return product.colors ? JSON.parse(product.colors) : []; } catch { return []; }
      })(),
      price: product.price,
      isPinned: product.isPinned,
      pinOrder: product.pinOrder,
      viewCount: viewCounts.get(product.id) ?? 0,
      seller: {
        id: product.seller.id,
        slug: product.seller.slug,
        storeName: product.seller.storeName,
      },
      images: await Promise.all(product.images.map(async (image) => ({
        url: await resolveCatalogAssetUrl(req, image.storageKey, image.url),
        isPrimary: image.isPrimary,
      }))),
      models: await Promise.all(product.models.map(async (model) => ({
        kind: model.kind,
        url: await resolveCatalogAssetUrl(req, model.storageKey, model.url),
      }))),
      dimensions: product.widthMm || product.heightMm || product.depthMm
        ? {
            widthM: product.widthMm != null ? product.widthMm / 1000 : null,
            heightM: product.heightMm != null ? product.heightMm / 1000 : null,
            depthM: product.depthMm != null ? product.depthMm / 1000 : null,
            realWorldScale: true as const,
          }
        : null,
      publishedAt: product.publishedAt,
    })));

    const publicSellers = await Promise.all(shuffle(sellers).map(async (seller) => ({
      id: seller.id,
      slug: seller.slug,
      storeName: seller.storeName,
      description: seller.description,
      logoUrl: seller.logoUrl
        ? await publicLogoUrl(req, seller.slug, seller.logoUrl, seller.logoStorageKey)
        : null,
      themeColor: seller.themeColor,
      contactEmail: seller.contactEmail,
      contactPhone: seller.contactPhone,
      address: seller.address,
      socialLinks: parseJson(seller.socialLinks, {}),
    })));

    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.json({
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      version: `live-${Date.now()}`,
      products: publicProducts,
      sellers: publicSellers,
      settings: settings ?? {},
      plans: plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        durationDays: plan.durationDays,
        price: plan.price,
        discountPct: plan.discountPct,
        productLimit: plan.productLimit,
        storageLimitMb: plan.storageLimitMb,
        features: parseJson(plan.features, {}),
        categoryId: plan.categoryId,
        sortOrder: plan.sortOrder,
      })),
      planCategories: planCategories.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        sortOrder: category.sortOrder,
        isActive: category.isActive,
      })),
    });
  } catch (error) {
    next(error);
  }
});


async function resolveCatalogAssetUrl(
  req: { protocol: string; get(name: string): string | undefined },
  storageKey: string,
  storedUrl?: string,
): Promise<string> {
  // Keep all browser-facing product media on the same-origin backend host.
  // This avoids requiring visitors to reach Supabase directly (which may be
  // unavailable on some networks). Storage credentials remain server-side.
  // Legacy ZIP assets retain their existing compatibility route.
  const ref = parsePackageStorageKey(storageKey);
  if (ref) {
    return absolutePackageUrl(req, packageAssetUrl(ref.productId, ref.kind, ref.name));
  }

  if (storageKey) return absolutePublicAssetUrl(req, storageKey);
  return resolveAssetUrl(req, storageKey, storedUrl);
}

async function publicLogoUrl(
  req: { protocol: string; get(name: string): string | undefined },
  sellerSlug: string,
  logoUrl: string,
  logoStorageKey: string | null | undefined,
): Promise<string> {
  // Always expose the logo through our backend public-asset route. This avoids
  // leaking provider-specific URLs and guarantees the browser gets consistent
  // CORS/MIME/cache behavior even when the underlying storage provider changes.
  const storageKey = logoStorageKey || extractStorageKey(logoUrl);
  if (storageKey) return absolutePublicAssetUrl(req, storageKey);

  // Legacy rows that predate logoStorageKey are still served by the public
  // slug endpoint, which can redirect to the original provider URL if needed.
  const host = req.get("host");
  if (!host) throw new HttpError(500, "آدرس عمومی Backend تنظیم نشده است.");
  return `${req.protocol}://${host}/api/sellers/by-slug/${encodeURIComponent(sellerSlug)}/logo`;
}

function extractStorageKey(value: string): string | null {
  const normalized = String(value || "").trim();
  if (!normalized) return null;

  if (/^https?:\/\//i.test(normalized)) {
    try {
      const url = new URL(normalized);
      const marker = "/api/public/assets/";
      const index = url.pathname.indexOf(marker);
      if (index >= 0) return decodeURIComponent(url.pathname.slice(index + marker.length));
      return null;
    } catch {
      return null;
    }
  }

  const marker = "/api/public/assets/";
  const index = normalized.indexOf(marker);
  if (index >= 0) return decodeURIComponent(normalized.slice(index + marker.length));
  if (/^(products|sellers)\//.test(normalized)) return normalized.replace(/^\/+/, "");
  return null;
}

function absolutePublicAssetUrl(
  req: { protocol: string; get(name: string): string | undefined },
  storageKey: string,
): string {
  const host = req.get("host");
  if (!host) throw new HttpError(500, "آدرس عمومی Backend تنظیم نشده است.");
  const encoded = storageKey
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${req.protocol}://${host}/api/public/assets/${encoded}`;
}

function absolutePackageUrl(req: { protocol: string; get(name: string): string | undefined }, relative: string): string {
  const host = req.get("host");
  if (!host) throw new HttpError(500, "آدرس عمومی Backend تنظیم نشده است.");
  return `${req.protocol}://${host}${relative}`;
}

async function resolveAssetUrl(
  _req: { protocol: string; get(name: string): string | undefined },
  storageKey: string,
  storedUrl?: string,
): Promise<string> {
  // Browser-facing files should be served through the API host, not a
  // provider URL that may be unreachable for visitors without VPN.
  if (storageKey) return storage.getUrl(storageKey);
  return storedUrl || "";
}

function getAssetContentType(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith(".glb")) return "model/gltf-binary";
  if (lower.endsWith(".gltf")) return "model/gltf+json";
  if (lower.endsWith(".usdz")) return "model/vnd.usdz+zip";
  if (lower.endsWith(".bin")) return "application/octet-stream";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}
