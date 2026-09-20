import { Router } from "express";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import { requireOwnProduct, requireAdmin } from "../middleware/rbac";
import { requestPublish, requestUnpublish } from "../services/publishService";
import { testConnection } from "../services/githubService";
import { HttpError } from "../middleware/errorHandler";

export const publishingRouter = Router();

// The frontend (seller dashboard) only ever calls this one endpoint to
// publish a product (spec section 25: "The frontend must only communicate
// with POST /api/products/:id/publish. The backend handles everything
// else."). This router is mounted at /api/products in index.ts so the
// final path matches exactly.

export function mountPublishingOnProducts(productsRouter: Router) {
  productsRouter.post("/:id/publish", requireAuth, requireOwnProduct(), async (req, res, next) => {
    try {
      const job = await requestPublish(req.params.id, req.user!.id);
      res.status(202).json({ job });
    } catch (err) {
      next(err);
    }
  });

  productsRouter.post("/:id/unpublish", requireAuth, requireOwnProduct(), async (req, res, next) => {
    try {
      const job = await requestUnpublish(req.params.id, req.user!.id);
      res.status(202).json({ job });

      await prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          productId: req.params.id,
          action: "PRODUCT_UNPUBLISHED",
          entity: "Product",
          entityId: req.params.id,
          ipAddress: req.ip,
        },
      });
    } catch (err) {
      next(err);
    }
  });
}

// ---------------------------------------------------------------------
// Job status / history — sellers see only their own jobs, admins see all.
// ---------------------------------------------------------------------

publishingRouter.get("/jobs", requireAuth, async (req, res, next) => {
  try {
    const isAdmin = req.user!.role === "ADMIN" || req.user!.role === "SUPER_ADMIN";
    const where = isAdmin ? {} : { sellerId: req.user!.seller?.id ?? "__none__" };

    const jobs = await prisma.publishJob.findMany({
      where,
      orderBy: { requestedAt: "desc" },
      take: 50,
      include: { product: { select: { name: true, slug: true } }, seller: { select: { storeName: true } } },
    });

    res.json({ jobs });
  } catch (err) {
    next(err);
  }
});

publishingRouter.get("/jobs/:id", requireAuth, async (req, res, next) => {
  try {
    const job = await prisma.publishJob.findUnique({
      where: { id: req.params.id },
      include: { logs: { orderBy: { createdAt: "asc" } }, product: true, seller: true },
    });

    if (!job) throw new HttpError(404, "درخواست انتشار یافت نشد.");

    const isAdmin = req.user!.role === "ADMIN" || req.user!.role === "SUPER_ADMIN";
    if (!isAdmin && job.sellerId !== req.user!.seller?.id) {
      throw new HttpError(404, "درخواست انتشار یافت نشد.");
    }

    res.json({ job });
  } catch (err) {
    next(err);
  }
});

// Admin: manual "test connection" button (spec section 45).
publishingRouter.get("/github/test", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const result = await testConnection();
    res.json(result);
  } catch (err) {
    next(err);
  }
});
