"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const json_1 = require("../utils/json");
const rbac_1 = require("../middleware/rbac");
exports.analyticsRouter = (0, express_1.Router)();
const trackSchema = zod_1.z.object({
    type: zod_1.z.enum([
        "PRODUCT_VIEW",
        "PRODUCT_DETAIL_VIEW",
        "VIEWER_3D_OPEN",
        "AR_LAUNCH",
        "SELLER_PAGE_VIEW",
        "SEARCH",
    ]),
    sellerId: zod_1.z.string().cuid().optional(),
    productId: zod_1.z.string().cuid().optional(),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
});
// Public endpoint — the static public website calls this (no auth) to
// record product views, 3D opens, AR launches, etc. Intentionally
// collects no personal information (spec section 23): no IP, no user
// agent, no identifiers beyond the anonymous event itself.
exports.analyticsRouter.post("/track", async (req, res, next) => {
    try {
        const input = trackSchema.parse(req.body);
        await prisma_1.prisma.analyticsEvent.create({
            data: {
                type: input.type,
                sellerId: input.sellerId,
                productId: input.productId,
                metadata: (0, json_1.serializeJson)(input.metadata),
            },
        });
        res.status(202).json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
// Admin: platform-wide analytics.
exports.analyticsRouter.get("/admin/overview", auth_1.requireAuth, rbac_1.requireAdmin, async (_req, res, next) => {
    try {
        const [sellerCounts, productCounts, eventCounts] = await Promise.all([
            prisma_1.prisma.seller.groupBy({ by: ["isActive"], _count: true }),
            prisma_1.prisma.product.groupBy({ by: ["visibility"], _count: true }),
            prisma_1.prisma.analyticsEvent.groupBy({ by: ["type"], _count: true }),
        ]);
        res.json({ sellerCounts, productCounts, eventCounts });
    }
    catch (err) {
        next(err);
    }
});
// Seller: analytics scoped to their own products only.
exports.analyticsRouter.get("/seller/:sellerId/overview", auth_1.requireAuth, (0, rbac_1.requireOwnSeller)(), async (req, res, next) => {
    try {
        const eventCounts = await prisma_1.prisma.analyticsEvent.groupBy({
            by: ["type"],
            where: { sellerId: req.params.sellerId },
            _count: true,
        });
        res.json({ eventCounts });
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=analytics.js.map