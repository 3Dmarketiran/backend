import { Router } from "express";
import { prisma } from "../config/prisma";
import { parseJson } from "../utils/json";
import { storage } from "../storage";
import { HttpError } from "../middleware/errorHandler";

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
      if (!resourceId || parts[2] !== "models") {
        throw new HttpError(404, "فایل مدل معتبر نیست.");
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
        throw new HttpError(404, "فایل مدل منتشرشده پیدا نشد.");
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

/**
 * Live public catalog. This endpoint is intentionally read-only and does not
 * require authentication. GitHub Pages uses it as the live source of truth;
 * the generated public-data snapshot remains a safe fallback for outages.
 */
publicCatalogRouter.get("/catalog", async (req, res, next) => {
  try {
    const now = new Date();

    const [products, sellers, categories, settings, plans] = await Promise.all([
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
              sellerCategory: { select: { slug: true, name: true } },
            },
          },
          category: {
            select: { slug: true, name: true, isActive: true },
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
        orderBy: { storeName: "asc" },
        include: {
          sellerCategory: { select: { slug: true, name: true } },
        },
      }),
      prisma.category.findMany({
        where: { isActive: true },
        select: { id: true, slug: true, name: true, isActive: true },
        orderBy: { name: "asc" },
      }),
      prisma.platformSetting.findUnique({ where: { id: "singleton" } }),
      prisma.subscriptionPlan.findMany({
        where: { isActive: true },
        orderBy: { durationDays: "asc" },
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

    const publicProducts = products.map((product) => ({
      id: product.id,
      slug: product.slug,
      name: product.name,
      shortDescription: product.shortDescription,
      fullDescription: product.fullDescription,
      tags: product.tags?.split(",").map((tag) => tag.trim()).filter(Boolean) ?? [],
      price: product.price,
      isPinned: product.isPinned,
      pinOrder: product.pinOrder,
      viewCount: viewCounts.get(product.id) ?? 0,
      category: product.category?.isActive
        ? { slug: product.category.slug, name: product.category.name }
        : null,
      seller: {
        id: product.seller.id,
        slug: product.seller.slug,
        storeName: product.seller.storeName,
        category: product.seller.sellerCategory
          ? { slug: product.seller.sellerCategory.slug, name: product.seller.sellerCategory.name }
          : null,
      },
      images: product.images.map((image) => ({ url: image.url, isPrimary: image.isPrimary })),
      models: product.models.map((model) => ({
        kind: model.kind,
        // Always build the public model URL from storageKey. This prevents a
        // custom-domain migration from leaving old provider URLs in the DB.
        url: publicAssetUrl(req, model.storageKey),
      })),
      dimensions: product.widthMm || product.heightMm || product.depthMm
        ? {
            widthM: product.widthMm != null ? product.widthMm / 1000 : null,
            heightM: product.heightMm != null ? product.heightMm / 1000 : null,
            depthM: product.depthMm != null ? product.depthMm / 1000 : null,
            realWorldScale: true as const,
          }
        : null,
      publishedAt: product.publishedAt,
    }));

    const publicSellers = sellers.map((seller) => ({
      id: seller.id,
      slug: seller.slug,
      storeName: seller.storeName,
      description: seller.description,
      logoUrl: seller.logoUrl
        ? publicLogoUrl(req, seller.logoUrl)
        : null,
      themeColor: seller.themeColor,
      contactEmail: seller.contactEmail,
      contactPhone: seller.contactPhone,
      address: seller.address,
      category: seller.sellerCategory
        ? { slug: seller.sellerCategory.slug, name: seller.sellerCategory.name }
        : null,
      socialLinks: parseJson(seller.socialLinks, {}),
    }));

    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.json({
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      version: `live-${Date.now()}`,
      products: publicProducts,
      sellers: publicSellers,
      categories,
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
      })),
    });
  } catch (error) {
    next(error);
  }
});


function publicLogoUrl(req: { protocol: string; get(name: string): string | undefined }, logoUrl: string): string {
  const storageKey = extractStorageKey(logoUrl);
  if (storageKey) return publicAssetUrl(req, storageKey);
  if (/^https?:\/\//i.test(logoUrl)) return logoUrl;
  if (/^\/api\/sellers\//i.test(logoUrl)) {
    const host = req.get("host");
    if (!host) throw new HttpError(500, "آدرس عمومی Backend تنظیم نشده است.");
    return `${req.protocol}://${host}${logoUrl}`;
  }
  return publicAssetUrl(req, logoUrl.replace(/^\/+/, ""));
}

function extractStorageKey(value: string): string | null {
  try {
    const url = new URL(value);
    const publicBase = process.env.PUBLIC_ASSET_BASE_URL;
    if (!publicBase) return null;
    const base = new URL(publicBase.endsWith("/") ? publicBase : `${publicBase}/`);
    if (url.origin !== base.origin) return null;
    const basePath = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
    if (!url.pathname.startsWith(basePath)) return null;
    const encoded = url.pathname.slice(basePath.length);
    return decodeURIComponent(encoded).replace(/^\/+/, "") || null;
  } catch {
    return null;
  }
}

function publicAssetUrl(req: { protocol: string; get(name: string): string | undefined }, storageKey: string): string {
  const host = req.get("host");
  if (!host) throw new HttpError(500, "آدرس عمومی Backend تنظیم نشده است.");
  const encodedKey = storageKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${req.protocol}://${host}/api/public/assets/${encodedKey}`;
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
