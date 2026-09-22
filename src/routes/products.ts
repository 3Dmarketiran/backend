import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  requireOwnProduct,
  requireSeller,
  requireAdmin,
} from "../middleware/rbac";
import {
  uploadImage,
  uploadModel,
  uploadModelZip,
} from "../middleware/upload";
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

function assertRouteId(
  value: string | undefined,
  message = "شناسه نامعتبر است."
): string {
  const id = value?.trim();

  if (!id) {
    throw new HttpError(400, message);
  }

  return id;
}

function isStaffRole(
  role: string | undefined
): boolean {
  return (
    role === "ADMIN" ||
    role === "SUPER_ADMIN"
  );
}

// ---------------------------------------------------------------------
// Product listing
// ---------------------------------------------------------------------

productsRouter.get(
  "/",
  async (req, res, next) => {
    try {
      const query =
        listProductsQuerySchema.parse(
          req.query
        );

      const isStaffOrSeller =
        isStaffRole(req.user?.role) ||
        req.user?.role === "SELLER";

      if (
        req.user?.role === "SELLER"
      ) {
        const sellerId =
          req.user.seller?.id;

        if (!sellerId) {
          throw new HttpError(
            403,
            "حساب فروشنده به پروفایل فروشگاه متصل نیست."
          );
        }

        query.sellerId = sellerId;
      }

      const result =
        await productService.listProducts(
          query,
          {
            publicOnly:
              !isStaffOrSeller,
          }
        );

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// Single product
// ---------------------------------------------------------------------

productsRouter.get(
  "/:id",
  async (req, res, next) => {
    try {
      const productId =
        assertRouteId(
          req.params.id,
          "شناسه محصول نامعتبر است."
        );

      const product =
        await productService.getProductById(
          productId
        );

      const isOwner =
        req.user?.seller?.id ===
        product.sellerId;

      const isStaff =
        isStaffRole(
          req.user?.role
        );

      if (
        !isOwner &&
        !isStaff &&
        product.visibility !==
          "PUBLISHED"
      ) {
        throw new HttpError(
          404,
          "محصول یافت نشد."
        );
      }

      res.json({
        product,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// Create product
// ---------------------------------------------------------------------

productsRouter.post(
  "/",
  requireAuth,
  requireSeller,
  async (req, res, next) => {
    try {
      const sellerId =
        req.user?.seller?.id;

      if (!sellerId) {
        throw new HttpError(
          403,
          "حساب فروشنده به پروفایل فروشگاه متصل نیست."
        );
      }

      const input =
        createProductSchema.parse(
          req.body
        );

      const product =
        await productService.createProduct(
          sellerId,
          input
        );

      await prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          sellerId,
          productId: product.id,
          action: "PRODUCT_CREATED",
          entity: "Product",
          entityId: product.id,
          ipAddress: req.ip,
        },
      });

      res.status(201).json({
        product,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// Update product
// ---------------------------------------------------------------------

productsRouter.put(
  "/:id",
  requireAuth,
  requireOwnProduct(),
  async (req, res, next) => {
    try {
      const productId =
        assertRouteId(
          req.params.id,
          "شناسه محصول نامعتبر است."
        );

      const input =
        updateProductSchema.parse(
          req.body
        );

      const product =
        await productService.updateProduct(
          productId,
          input
        );

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

      res.json({
        product,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// Delete product
// ---------------------------------------------------------------------

productsRouter.delete(
  "/:id",
  requireAuth,
  requireOwnProduct(),
  async (req, res, next) => {
    try {
      const productId =
        assertRouteId(
          req.params.id,
          "شناسه محصول نامعتبر است."
        );

      const existing =
        await productService.getProductById(
          productId
        );

      await productService.deleteProduct(
        productId
      );

      await prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          sellerId:
            existing.sellerId,
          action: "PRODUCT_DELETED",
          entity: "Product",
          entityId: productId,
          ipAddress: req.ip,
        },
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// Product images
// ---------------------------------------------------------------------

productsRouter.post(
  "/:id/images",
  requireAuth,
  requireOwnProduct(),
  uploadImage,
  async (req, res, next) => {
    try {
      const productId =
        assertRouteId(
          req.params.id,
          "شناسه محصول نامعتبر است."
        );

      if (!req.file) {
        throw new HttpError(
          400,
          "فایل تصویر ارسال نشده است."
        );
      }

      const image =
        await assetService.addProductImage(
          productId,
          req.file
        );

      await prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          productId,
          action: "PRODUCT_IMAGE_ADDED",
          entity: "ProductImage",
          entityId: image.id,
          ipAddress: req.ip,
        },
      });

      res.status(201).json({
        image,
      });
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
      const productId =
        assertRouteId(
          req.params.id,
          "شناسه محصول نامعتبر است."
        );

      const imageId =
        assertRouteId(
          req.params.imageId,
          "شناسه تصویر نامعتبر است."
        );

      await assetService.deleteProductImage(
        productId,
        imageId
      );

      await prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          productId,
          action: "PRODUCT_IMAGE_DELETED",
          entity: "ProductImage",
          entityId: imageId,
          ipAddress: req.ip,
        },
      });

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
      const productId =
        assertRouteId(
          req.params.id,
          "شناسه محصول نامعتبر است."
        );

      const imageId =
        assertRouteId(
          req.params.imageId,
          "شناسه تصویر نامعتبر است."
        );

      await assetService.setPrimaryImage(
        productId,
        imageId
      );

      await prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          productId,
          action: "PRODUCT_IMAGE_PRIMARY_CHANGED",
          entity: "ProductImage",
          entityId: imageId,
          ipAddress: req.ip,
        },
      });

      res.json({
        success: true,
      });
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
      const productId =
        assertRouteId(
          req.params.id,
          "شناسه محصول نامعتبر است."
        );

      const { imageIds } =
        reorderImagesSchema.parse(
          req.body
        );

      await assetService.reorderImages(
        productId,
        imageIds
      );

      await prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          productId,
          action: "PRODUCT_IMAGES_REORDERED",
          entity: "Product",
          entityId: productId,
          ipAddress: req.ip,
        },
      });

      res.json({
        success: true,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// Single 3D / AR model
// ---------------------------------------------------------------------

productsRouter.post(
  "/:id/models",
  requireAuth,
  requireOwnProduct(),
  uploadModel,
  async (req, res, next) => {
    try {
      const productId =
        assertRouteId(
          req.params.id,
          "شناسه محصول نامعتبر است."
        );

      if (!req.file) {
        throw new HttpError(
          400,
          "فایل سه‌بعدی ارسال نشده است."
        );
      }

      const model =
        await assetService.addProductModel(
          productId,
          req.file
        );

      await prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          productId,
          action: "PRODUCT_MODEL_ADDED",
          entity: "ProductModel",
          entityId: model.id,
          ipAddress: req.ip,
        },
      });

      res.status(201).json({
        model,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// ZIP 3D / AR model upload
// ---------------------------------------------------------------------

productsRouter.post(
  "/:id/models/zip",
  requireAuth,
  requireOwnProduct(),
  uploadModelZip,
  async (req, res, next) => {
    try {
      const productId =
        assertRouteId(
          req.params.id,
          "شناسه محصول نامعتبر است."
        );

      if (!req.file) {
        throw new HttpError(
          400,
          "فایل ZIP ارسال نشده است."
        );
      }

      const models =
        await assetService.addProductModelsFromZip(
          productId,
          req.file
        );

      await prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          productId,
          action: "PRODUCT_MODELS_ZIP_ADDED",
          entity: "Product",
          entityId: productId,
          ipAddress: req.ip,
        },
      });

      res.status(201).json({
        models,
        count: models.length,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// Delete 3D / AR model
// ---------------------------------------------------------------------

productsRouter.delete(
  "/:id/models/:modelId",
  requireAuth,
  requireOwnProduct(),
  async (req, res, next) => {
    try {
      const productId =
        assertRouteId(
          req.params.id,
          "شناسه محصول نامعتبر است."
        );

      const modelId =
        assertRouteId(
          req.params.modelId,
          "شناسه مدل نامعتبر است."
        );

      await assetService.deleteProductModel(
        productId,
        modelId
      );

      await prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          productId,
          action: "PRODUCT_MODEL_DELETED",
          entity: "ProductModel",
          entityId: modelId,
          ipAddress: req.ip,
        },
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// Admin-only product moderation
// ---------------------------------------------------------------------

productsRouter.post(
  "/:id/force-hide",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const productId =
        assertRouteId(
          req.params.id,
          "شناسه محصول نامعتبر است."
        );

      const product =
        await productService.updateProduct(
          productId,
          {
            visibility: "HIDDEN",
          }
        );

      await prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          productId: product.id,
          sellerId: product.sellerId,
          action: "PRODUCT_FORCE_HIDDEN",
          entity: "Product",
          entityId: product.id,
          ipAddress: req.ip,
        },
      });

      res.json({
        product,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default productsRouter;
