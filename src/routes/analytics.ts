import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
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
  sellerId: z.string().cuid().optional(),
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
    await prisma.analyticsEvent.create({
      data: {
        type: input.type,
        sellerId: input.sellerId,
        productId: input.productId,
        metadata: serializeJson(input.metadata),
      },
    });
    res.status(202).json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Admin: platform-wide analytics.
analyticsRouter.get("/admin/overview", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const [sellerCounts, productCounts, eventCounts] = await Promise.all([
      prisma.seller.groupBy({ by: ["isActive"], _count: true }),
      prisma.product.groupBy({ by: ["visibility"], _count: true }),
      prisma.analyticsEvent.groupBy({ by: ["type"], _count: true }),
    ]);

    res.json({ sellerCounts, productCounts, eventCounts });
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
        _count: true,
      });
      res.json({ eventCounts });
    } catch (err) {
      next(err);
    }
  }
);
