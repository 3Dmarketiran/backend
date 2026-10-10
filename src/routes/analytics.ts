import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { serializeJson } from "../utils/json";
import { requireAdmin, requireOwnSeller } from "../middleware/rbac";

export const analyticsRouter = Router();

const trackSchema = z.object({
  type: z.enum([
    "PRODUCT_VIEW",
    "PRODUCT_DETAIL_VIEW",
    "VIEWER_3D_OPEN",
    "AR_LAUNCH",
    "SELLER_PAGE_VIEW",
    "SEARCH",
  ]),
  sellerId: z.string().trim().min(1).max(128).optional(),
  productId: z.string().cuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Public endpoint — the static public website calls this (no auth) to
// record product views, 3D opens, AR launches, etc. Intentionally
// collects no personal information (spec section 23): no IP, no user
// agent, no identifiers beyond the anonymous event itself.
analyticsRouter.post("/track", async (req, res, next) => {
  try {
    const input = trackSchema.parse(req.body);
    const productEvent = new Set([
      "PRODUCT_VIEW",
      "PRODUCT_DETAIL_VIEW",
      "VIEWER_3D_OPEN",
      "AR_LAUNCH",
    ]).has(input.type);

    if (productEvent) {
      if (!input.productId) throw new HttpError(400, "شناسه محصول برای این رویداد الزامی است.");
      const now = new Date();
      const product = await prisma.product.findFirst({
        where: {
          id: input.productId,
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
        select: { sellerId: true },
      });
      if (!product) throw new HttpError(404, "محصول عمومی یافت نشد.");
      if (input.sellerId && input.sellerId !== product.sellerId) {
        throw new HttpError(400, "ارتباط فروشنده و محصول نامعتبر است.");
      }
      await prisma.analyticsEvent.create({
        data: {
          type: input.type,
          sellerId: product.sellerId,
          productId: input.productId,
          metadata: serializeJson(input.metadata),
        },
      });
    } else if (input.type === "SELLER_PAGE_VIEW") {
      if (!input.sellerId) throw new HttpError(400, "شناسه فروشنده برای این رویداد الزامی است.");
      const seller = await prisma.seller.findFirst({
        where: {
          id: input.sellerId,
          isActive: true,
          subscriptions: {
            some: {
              status: "ACTIVE",
              startDate: { lte: new Date() },
              endDate: { gte: new Date() },
              plan: { is: { isActive: true } },
            },
          },
        },
        select: { id: true },
      });
      if (!seller) throw new HttpError(404, "فروشگاه عمومی یافت نشد.");
      await prisma.analyticsEvent.create({
        data: {
          type: input.type,
          sellerId: seller.id,
          metadata: serializeJson(input.metadata),
        },
      });
    } else {
      await prisma.analyticsEvent.create({
        data: {
          type: input.type,
          metadata: serializeJson(input.metadata),
        },
      });
    }

    res.status(202).json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Admin: platform-wide analytics.
analyticsRouter.get("/admin/overview", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const [sellerCounts, productCounts, eventCounts] = await Promise.all([
      prisma.seller.groupBy({ by: ["isActive"], _count: { _all: true } }),
      prisma.product.groupBy({ by: ["visibility"], _count: { _all: true } }),
      prisma.analyticsEvent.groupBy({ by: ["type"], _count: { _all: true } }),
    ]);

    // Flatten Prisma's `_count: { _all: number }` groupBy shape into a plain
    // `_count: number` so it matches what the admin dashboard expects.
    res.json({
      sellerCounts: sellerCounts.map((row) => ({ isActive: row.isActive, _count: row._count._all })),
      productCounts: productCounts.map((row) => ({ visibility: row.visibility, _count: row._count._all })),
      eventCounts: eventCounts.map((row) => ({ type: row.type, _count: row._count._all })),
    });
  } catch (err) {
    next(err);
  }
});

// Seller: analytics scoped to their own products only.
analyticsRouter.get(
  "/seller/:sellerId/overview",
  requireAuth,
  requireOwnSeller(),
  async (req, res, next) => {
    try {
      const eventCounts = await prisma.analyticsEvent.groupBy({
        by: ["type"],
        where: { sellerId: req.params.sellerId },
        _count: { _all: true },
      });
      // Flatten `_count: { _all: number }` into `_count: number` for the
      // seller analytics panel (see the admin/overview handler above).
      res.json({
        eventCounts: eventCounts.map((row) => ({ type: row.type, _count: row._count._all })),
      });
    } catch (err) {
      next(err);
    }
  }
);
