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
  uploadProductPackage,
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
import * as productPackageService from "../services/productPackageService";
import { prisma } from "../config/prisma";
import { storage } from "../storage";
import { readPackageAsset, getPackageContentType, parsePackageStorageKey } from "../services/productPackageService";
import { queueRepublishForSeller } from "../services/publishService";

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

function sellerAssetUrl(req: any, productId: string, storageKey: string, kind: "images" | "models" | "ar") {
  const host = req.get("host");
  const base = host ? `${req.protocol}://${host}` : "";
  const encoded = storageKey.split("/").filter(Boolean).map((part: string) => encodeURIComponent(part)).join("/");
  return `${base}/api/products/${encodeURIComponent(productId)}/assets/${kind}/${encoded}`;
}

function contentTypeForAsset(key: string) {
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

      if (req.user?.role === "SELLER" || isStaffRole(req.user?.role)) {
        result.items = result.items.map((item: any) => ({
          ...item,
          images: item.images.map((image: any) => image.storageKey ? { ...image, url: sellerAssetUrl(req, item.id, image.storageKey, "images") } : image),
        }));
      }
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// Authenticated seller/staff asset preview. These reads never consume the
// storefront traffic quota because they are internal dashboard previews.
// ---------------------------------------------------------------------
productsRouter.get(
  "/:id/assets/:kind/*",
  requireAuth,
  async (req, res, next) => {
    try {
      const productId = assertRouteId(req.params.id, "شناسه محصول نامعتبر است.");
      const kind = String(req.params.kind || "");
      if (!["images", "models", "ar"].includes(kind)) throw new HttpError(404, "نوع فایل نامعتبر است.");
      const raw = String((req.params as Record<string, string | undefined>)["0"] || "").replace(/^\/+/, "");
      const key = decodeURIComponent(raw).replace(/\\/g, "/");
      if (!key || key.includes("..")) throw new HttpError(404, "فایل پیدا نشد.");
      const product = await prisma.product.findUnique({ where: { id: productId }, select: { sellerId: true } });
      const isOwner = req.user?.seller?.id === product?.sellerId;
      if (!product || (!isOwner && !isStaffRole(req.user?.role))) throw new HttpError(404, "فایل پیدا نشد.");
      const prefix = `products/${productId}/${kind}/`;
      if (!key.startsWith(prefix)) throw new HttpError(404, "فایل پیدا نشد.");
      const ref = parsePackageStorageKey(key);
      const buffer = ref ? await readPackageAsset(productId, ref.kind, ref.name) : await storage.read(key);
      res.setHeader("Content-Type", ref ? getPackageContentType(ref.name) : contentTypeForAsset(key));
      res.setHeader("Cache-Control", "private, max-age=300");
      res.setHeader("Access-Control-Allow-Origin", req.get("origin") || "*");
      return res.send(buffer);
    } catch (err) { next(err); }
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

      if (!isOwner && !isStaff) {
        const now = new Date();
        const sellerPublic = await prisma.seller.findFirst({
          where: {
            id: product.sellerId,
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
        if (product.visibility !== "PUBLISHED" || product.hasUnpublishedChanges || !sellerPublic) {
        throw new HttpError(
          404,
          "محصول یافت نشد."
        );
        }
      }

      const host = req.get("host");
      const base = host ? `${req.protocol}://${host}` : "";
      const decorated = {
        ...product,
        // Normal assets are already canonical R2 URLs from productService.
        // Only legacy ZIP members require the backend compatibility route.
        images: product.images.map((image) => {
          const ref = productPackageService.parsePackageStorageKey(image.storageKey);
          return ref ? { ...image, url: `${base}${productPackageService.packageAssetUrl(ref.productId, ref.kind, ref.name)}` } : (isOwner || isStaff ? { ...image, url: sellerAssetUrl(req, product.id, image.storageKey, "images") } : image);
        }),
        models: product.models.map((model) => {
          const ref = productPackageService.parsePackageStorageKey(model.storageKey);
          return ref ? { ...model, url: `${base}${productPackageService.packageAssetUrl(ref.productId, ref.kind, ref.name)}` } : (isOwner || isStaff ? { ...model, url: sellerAssetUrl(req, product.id, model.storageKey, model.kind === "USDZ" ? "ar" : "models") } : model);
        }),
      };

      res.json({ product: decorated });
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
// Pin product for the seller storefront (max 3)
// ---------------------------------------------------------------------
productsRouter.post(
  "/:id/pin",
  requireAuth,
  requireOwnProduct(),
  async (req, res, next) => {
    try {
      const productId = assertRouteId(req.params.id);
      const pinned = req.body?.pinned !== false;
      const product = await productService.setProductPinned(
        productId,
        req.user!.seller!.id,
        pinned,
      );
      res.json({ product });
    } catch (err) {
      next(err);
    }
  },
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
          sellerId: existing.sellerId,
          action: "PRODUCT_DELETED",
          entity: "Product",
          entityId: productId,
          ipAddress: req.ip,
        },
      });

      // Rebuild even for HIDDEN/failed states: a previous failed publication
      // may have left the deleted product inside the last public snapshot.
      queueRepublishForSeller(existing.sellerId, req.user!.id);

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
// Unified product asset package upload
// ---------------------------------------------------------------------

productsRouter.post(
  "/:id/package",
  requireAuth,
  requireOwnProduct(),
  uploadProductPackage,
  async (req, res, next) => {
    try {
      const productId = assertRouteId(req.params.id, "شناسه محصول نامعتبر است.");
      const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
      const result = await productPackageService.upsertProductPackage({
        productId,
        images: files.images ?? [],
        models: files.models ?? [],
        ar: files.ar ?? [],
      });

      await prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          productId,
          sellerId: req.user!.seller!.id,
          action: "PRODUCT_ASSET_PACKAGE_UPDATED",
          entity: "ProductAssetPackage",
          entityId: productId,
          ipAddress: req.ip,
        },
      });

      res.status(201).json({ product: result });
    } catch (err) {
      next(err);
    }
  }
);

// ZIP model uploads are intentionally disabled to avoid large in-memory
// multipart buffers and archive extraction on the API server. Sellers must
// upload supported model files individually (GLB, GLTF, USDZ).
productsRouter.post(
  "/:id/models/zip",
  requireAuth,
  requireOwnProduct(),
  async (_req, res) => {
    res.status(410).json({
      error: "آپلود ZIP غیرفعال است. فایل‌های GLB، GLTF یا USDZ را جداگانه بارگذاری کنید.",
    });
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

      const existing = await productService.getProductById(productId);
      const product = await prisma.product.update({
        where: { id: productId },
        data: { visibility: "HIDDEN", hasUnpublishedChanges: false },
      });

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

      queueRepublishForSeller(existing.sellerId, req.user!.id);

      res.json({ product });
    } catch (err) {
      next(err);
    }
  }
);

export default productsRouter;
