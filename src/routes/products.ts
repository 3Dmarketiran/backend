import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireOwnProduct, requireSeller, requireAdmin } from "../middleware/rbac";
import { uploadImage, uploadModel } from "../middleware/upload";
import { HttpError } from "../middleware/errorHandler";
import {
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
  reorderImagesSchema,
} from "../validators/product";
import * as productService from "../services/productService";
import * as assetService from "../services/assetService";
import { prisma } from "../config/prisma";

export const productsRouter = Router();

// ---------------------------------------------------------------------
// Listing. Public catalog is enforced server-side (never trust a client
// -supplied "give me all products" for the public route) — admins/sellers
// get the private listing via requireAuth below.
// ---------------------------------------------------------------------

productsRouter.get("/", async (req, res, next) => {
  try {
    const query = listProductsQuerySchema.parse(req.query);
    const isStaffOrSeller =
      req.user?.role === "ADMIN" || req.user?.role === "SUPER_ADMIN" || req.user?.role === "SELLER";

    // Sellers without admin rights may only ever list their own products,
    // regardless of a sellerId they might pass in the query string.
    if (req.user?.role === "SELLER" && req.user.seller) {
      query.sellerId = req.user.seller.id;
    }

    const result = await productService.listProducts(query, { publicOnly: !isStaffOrSeller });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

productsRouter.get("/:id", async (req, res, next) => {
  try {
    const product = await productService.getProductById(req.params.id);

    // Non-owners/non-staff may only view PUBLISHED products of active sellers.
    const isOwner = req.user?.seller?.id === product.sellerId;
    const isStaff = req.user?.role === "ADMIN" || req.user?.role === "SUPER_ADMIN";
    if (!isOwner && !isStaff && product.visibility !== "PUBLISHED") {
      throw new HttpError(404, "محصول یافت نشد.");
    }

    res.json({ product });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Mutations — seller-owned, tenant-isolated
// ---------------------------------------------------------------------

productsRouter.post("/", requireAuth, requireSeller, async (req, res, next) => {
  try {
    const input = createProductSchema.parse(req.body);
    const product = await productService.createProduct(req.user!.seller!.id, input);

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        sellerId: req.user!.seller!.id,
        productId: product.id,
        action: "PRODUCT_CREATED",
        entity: "Product",
        entityId: product.id,
        ipAddress: req.ip,
      },
    });

    res.status(201).json({ product });
  } catch (err) {
    next(err);
  }
});

productsRouter.put("/:id", requireAuth, requireOwnProduct(), async (req, res, next) => {
  try {
    const input = updateProductSchema.parse(req.body);
    const product = await productService.updateProduct(req.params.id, input);

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        productId: product.id,
        sellerId: product.sellerId,
        action: "PRODUCT_EDITED",
        entity: "Product",
        entityId: product.id,
        ipAddress: req.ip,
      },
    });

    res.json({ product });
  } catch (err) {
    next(err);
  }
});

productsRouter.delete("/:id", requireAuth, requireOwnProduct(), async (req, res, next) => {
  try {
    await productService.deleteProduct(req.params.id);

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: "PRODUCT_DELETED",
        entity: "Product",
        entityId: req.params.id,
        ipAddress: req.ip,
      },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------

productsRouter.post(
  "/:id/images",
  requireAuth,
  requireOwnProduct(),
  uploadImage,
  async (req, res, next) => {
    try {
      if (!req.file) throw new HttpError(400, "فایل تصویر ارسال نشده است.");
      const image = await assetService.addProductImage(req.params.id, req.file);
      res.status(201).json({ image });
    } catch (err) {
      next(err);
    }
  }
);

productsRouter.delete(
  "/:id/images/:imageId",
  requireAuth,
  requireOwnProduct(),
  async (req, res, next) => {
    try {
      await assetService.deleteProductImage(req.params.id, req.params.imageId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

productsRouter.post(
  "/:id/images/:imageId/primary",
  requireAuth,
  requireOwnProduct(),
  async (req, res, next) => {
    try {
      await assetService.setPrimaryImage(req.params.id, req.params.imageId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

productsRouter.post(
  "/:id/images/reorder",
  requireAuth,
  requireOwnProduct(),
  async (req, res, next) => {
    try {
      const { imageIds } = reorderImagesSchema.parse(req.body);
      await assetService.reorderImages(req.params.id, imageIds);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// 3D / AR models
// ---------------------------------------------------------------------

productsRouter.post(
  "/:id/models",
  requireAuth,
  requireOwnProduct(),
  uploadModel,
  async (req, res, next) => {
    try {
      if (!req.file) throw new HttpError(400, "فایل سه‌بعدی ارسال نشده است.");
      const model = await assetService.addProductModel(req.params.id, req.file);
      res.status(201).json({ model });
    } catch (err) {
      next(err);
    }
  }
);

productsRouter.delete(
  "/:id/models/:modelId",
  requireAuth,
  requireOwnProduct(),
  async (req, res, next) => {
    try {
      await assetService.deleteProductModel(req.params.id, req.params.modelId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// Admin-only override: hide any product platform-wide (e.g. policy violation).
productsRouter.post("/:id/force-hide", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const product = await productService.updateProduct(req.params.id, { visibility: "HIDDEN" });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        productId: product.id,
        action: "PRODUCT_FORCE_HIDDEN",
        entity: "Product",
        entityId: product.id,
        ipAddress: req.ip,
      },
    });
    res.json({ product });
  } catch (err) {
    next(err);
  }
});
