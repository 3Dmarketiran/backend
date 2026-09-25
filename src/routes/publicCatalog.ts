import { Router } from "express";
import { prisma } from "../config/prisma";
import { parseJson } from "../utils/json";

export const publicCatalogRouter = Router();

/**
 * Live public catalog. This endpoint is intentionally read-only and does not
 * require authentication. GitHub Pages uses it as the live source of truth;
 * the generated public-data snapshot remains a safe fallback for outages.
 */
publicCatalogRouter.get("/catalog", async (_req, res, next) => {
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
      models: product.models.map((model) => ({ kind: model.kind, url: model.url })),
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
      logoUrl: seller.logoUrl,
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
