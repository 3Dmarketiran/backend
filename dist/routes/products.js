"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.productsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const upload_1 = require("../middleware/upload");
const errorHandler_1 = require("../middleware/errorHandler");
const product_1 = require("../validators/product");
const productService = __importStar(require("../services/productService"));
const assetService = __importStar(require("../services/assetService"));
const prisma_1 = require("../config/prisma");
exports.productsRouter = (0, express_1.Router)();
// ---------------------------------------------------------------------
// Listing. Public catalog is enforced server-side (never trust a client
// -supplied "give me all products" for the public route) — admins/sellers
// get the private listing via requireAuth below.
// ---------------------------------------------------------------------
exports.productsRouter.get("/", async (req, res, next) => {
    try {
        const query = product_1.listProductsQuerySchema.parse(req.query);
        const isStaffOrSeller = req.user?.role === "ADMIN" || req.user?.role === "SUPER_ADMIN" || req.user?.role === "SELLER";
        // Sellers without admin rights may only ever list their own products,
        // regardless of a sellerId they might pass in the query string.
        if (req.user?.role === "SELLER" && req.user.seller) {
            query.sellerId = req.user.seller.id;
        }
        const result = await productService.listProducts(query, { publicOnly: !isStaffOrSeller });
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
exports.productsRouter.get("/:id", async (req, res, next) => {
    try {
        const product = await productService.getProductById(req.params.id);
        // Non-owners/non-staff may only view PUBLISHED products of active sellers.
        const isOwner = req.user?.seller?.id === product.sellerId;
        const isStaff = req.user?.role === "ADMIN" || req.user?.role === "SUPER_ADMIN";
        if (!isOwner && !isStaff && product.visibility !== "PUBLISHED") {
            throw new errorHandler_1.HttpError(404, "محصول یافت نشد.");
        }
        res.json({ product });
    }
    catch (err) {
        next(err);
    }
});
// ---------------------------------------------------------------------
// Mutations — seller-owned, tenant-isolated
// ---------------------------------------------------------------------
exports.productsRouter.post("/", auth_1.requireAuth, rbac_1.requireSeller, async (req, res, next) => {
    try {
        const input = product_1.createProductSchema.parse(req.body);
        const product = await productService.createProduct(req.user.seller.id, input);
        await prisma_1.prisma.auditLog.create({
            data: {
                actorId: req.user.id,
                sellerId: req.user.seller.id,
                productId: product.id,
                action: "PRODUCT_CREATED",
                entity: "Product",
                entityId: product.id,
                ipAddress: req.ip,
            },
        });
        res.status(201).json({ product });
    }
    catch (err) {
        next(err);
    }
});
exports.productsRouter.put("/:id", auth_1.requireAuth, (0, rbac_1.requireOwnProduct)(), async (req, res, next) => {
    try {
        const input = product_1.updateProductSchema.parse(req.body);
        const product = await productService.updateProduct(req.params.id, input);
        await prisma_1.prisma.auditLog.create({
            data: {
                actorId: req.user.id,
                productId: product.id,
                sellerId: product.sellerId,
                action: "PRODUCT_EDITED",
                entity: "Product",
                entityId: product.id,
                ipAddress: req.ip,
            },
        });
        res.json({ product });
    }
    catch (err) {
        next(err);
    }
});
exports.productsRouter.delete("/:id", auth_1.requireAuth, (0, rbac_1.requireOwnProduct)(), async (req, res, next) => {
    try {
        await productService.deleteProduct(req.params.id);
        await prisma_1.prisma.auditLog.create({
            data: {
                actorId: req.user.id,
                action: "PRODUCT_DELETED",
                entity: "Product",
                entityId: req.params.id,
                ipAddress: req.ip,
            },
        });
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
// ---------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------
exports.productsRouter.post("/:id/images", auth_1.requireAuth, (0, rbac_1.requireOwnProduct)(), upload_1.uploadImage, async (req, res, next) => {
    try {
        if (!req.file)
            throw new errorHandler_1.HttpError(400, "فایل تصویر ارسال نشده است.");
        const image = await assetService.addProductImage(req.params.id, req.file);
        res.status(201).json({ image });
    }
    catch (err) {
        next(err);
    }
});
exports.productsRouter.delete("/:id/images/:imageId", auth_1.requireAuth, (0, rbac_1.requireOwnProduct)(), async (req, res, next) => {
    try {
        await assetService.deleteProductImage(req.params.id, req.params.imageId);
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
exports.productsRouter.post("/:id/images/:imageId/primary", auth_1.requireAuth, (0, rbac_1.requireOwnProduct)(), async (req, res, next) => {
    try {
        await assetService.setPrimaryImage(req.params.id, req.params.imageId);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
exports.productsRouter.post("/:id/images/reorder", auth_1.requireAuth, (0, rbac_1.requireOwnProduct)(), async (req, res, next) => {
    try {
        const { imageIds } = product_1.reorderImagesSchema.parse(req.body);
        await assetService.reorderImages(req.params.id, imageIds);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
// ---------------------------------------------------------------------
// 3D / AR models
// ---------------------------------------------------------------------
exports.productsRouter.post("/:id/models", auth_1.requireAuth, (0, rbac_1.requireOwnProduct)(), upload_1.uploadModel, async (req, res, next) => {
    try {
        if (!req.file)
            throw new errorHandler_1.HttpError(400, "فایل سه‌بعدی ارسال نشده است.");
        const model = await assetService.addProductModel(req.params.id, req.file);
        res.status(201).json({ model });
    }
    catch (err) {
        next(err);
    }
});
exports.productsRouter.delete("/:id/models/:modelId", auth_1.requireAuth, (0, rbac_1.requireOwnProduct)(), async (req, res, next) => {
    try {
        await assetService.deleteProductModel(req.params.id, req.params.modelId);
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
// Admin-only override: hide any product platform-wide (e.g. policy violation).
exports.productsRouter.post("/:id/force-hide", auth_1.requireAuth, rbac_1.requireAdmin, async (req, res, next) => {
    try {
        const product = await productService.updateProduct(req.params.id, { visibility: "HIDDEN" });
        await prisma_1.prisma.auditLog.create({
            data: {
                actorId: req.user.id,
                productId: product.id,
                action: "PRODUCT_FORCE_HIDDEN",
                entity: "Product",
                entityId: product.id,
                ipAddress: req.ip,
            },
        });
        res.json({ product });
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=products.js.map