"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishingRouter = void 0;
exports.mountPublishingOnProducts = mountPublishingOnProducts;
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const publishService_1 = require("../services/publishService");
const githubService_1 = require("../services/githubService");
const errorHandler_1 = require("../middleware/errorHandler");
exports.publishingRouter = (0, express_1.Router)();
// The frontend (seller dashboard) only ever calls this one endpoint to
// publish a product (spec section 25: "The frontend must only communicate
// with POST /api/products/:id/publish. The backend handles everything
// else."). This router is mounted at /api/products in index.ts so the
// final path matches exactly.
function mountPublishingOnProducts(productsRouter) {
    productsRouter.post("/:id/publish", auth_1.requireAuth, (0, rbac_1.requireOwnProduct)(), async (req, res, next) => {
        try {
            const job = await (0, publishService_1.requestPublish)(req.params.id, req.user.id);
            res.status(202).json({ job });
        }
        catch (err) {
            next(err);
        }
    });
    productsRouter.post("/:id/unpublish", auth_1.requireAuth, (0, rbac_1.requireOwnProduct)(), async (req, res, next) => {
        try {
            const job = await (0, publishService_1.requestUnpublish)(req.params.id, req.user.id);
            res.status(202).json({ job });
            await prisma_1.prisma.auditLog.create({
                data: {
                    actorId: req.user.id,
                    productId: req.params.id,
                    action: "PRODUCT_UNPUBLISHED",
                    entity: "Product",
                    entityId: req.params.id,
                    ipAddress: req.ip,
                },
            });
        }
        catch (err) {
            next(err);
        }
    });
}
// ---------------------------------------------------------------------
// Job status / history — sellers see only their own jobs, admins see all.
// ---------------------------------------------------------------------
exports.publishingRouter.get("/jobs", auth_1.requireAuth, async (req, res, next) => {
    try {
        const isAdmin = req.user.role === "ADMIN" || req.user.role === "SUPER_ADMIN";
        const where = isAdmin ? {} : { sellerId: req.user.seller?.id ?? "__none__" };
        const jobs = await prisma_1.prisma.publishJob.findMany({
            where,
            orderBy: { requestedAt: "desc" },
            take: 50,
            include: { product: { select: { name: true, slug: true } }, seller: { select: { storeName: true } } },
        });
        res.json({ jobs });
    }
    catch (err) {
        next(err);
    }
});
exports.publishingRouter.get("/jobs/:id", auth_1.requireAuth, async (req, res, next) => {
    try {
        const job = await prisma_1.prisma.publishJob.findUnique({
            where: { id: req.params.id },
            include: { logs: { orderBy: { createdAt: "asc" } }, product: true, seller: true },
        });
        if (!job)
            throw new errorHandler_1.HttpError(404, "درخواست انتشار یافت نشد.");
        const isAdmin = req.user.role === "ADMIN" || req.user.role === "SUPER_ADMIN";
        if (!isAdmin && job.sellerId !== req.user.seller?.id) {
            throw new errorHandler_1.HttpError(404, "درخواست انتشار یافت نشد.");
        }
        res.json({ job });
    }
    catch (err) {
        next(err);
    }
});
// Admin: manual "test connection" button (spec section 45).
exports.publishingRouter.get("/github/test", auth_1.requireAuth, rbac_1.requireAdmin, async (_req, res, next) => {
    try {
        const result = await (0, githubService_1.testConnection)();
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=publishing.js.map