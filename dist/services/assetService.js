"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addProductImage = addProductImage;
exports.deleteProductImage = deleteProductImage;
exports.setPrimaryImage = setPrimaryImage;
exports.reorderImages = reorderImages;
exports.addProductModel = addProductModel;
exports.deleteProductModel = deleteProductModel;
const prisma_1 = require("../config/prisma");
const storage_1 = require("../storage");
const upload_1 = require("../middleware/upload");
const errorHandler_1 = require("../middleware/errorHandler");
async function addProductImage(productId, file) {
    await (0, upload_1.assertValidImage)(file.buffer);
    const stored = await storage_1.storage.save({
        folder: `products/${productId}/images`,
        filename: file.originalname,
        buffer: file.buffer,
        contentType: file.mimetype,
    });
    const existingCount = await prisma_1.prisma.productImage.count({ where: { productId } });
    const image = await prisma_1.prisma.productImage.create({
        data: {
            productId,
            url: stored.url,
            storageKey: stored.storageKey,
            isPrimary: existingCount === 0, // first uploaded image becomes primary by default
            sortOrder: existingCount,
            sizeBytes: stored.sizeBytes,
        },
    });
    await markUnpublishedIfNeeded(productId);
    return image;
}
async function deleteProductImage(productId, imageId) {
    const image = await prisma_1.prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!image)
        throw new errorHandler_1.HttpError(404, "تصویر یافت نشد.");
    await storage_1.storage.delete(image.storageKey).catch(() => undefined);
    await prisma_1.prisma.productImage.delete({ where: { id: imageId } });
    // If the deleted image was primary, promote the next one.
    if (image.isPrimary) {
        const next = await prisma_1.prisma.productImage.findFirst({
            where: { productId },
            orderBy: { sortOrder: "asc" },
        });
        if (next) {
            await prisma_1.prisma.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
        }
    }
    await markUnpublishedIfNeeded(productId);
}
async function setPrimaryImage(productId, imageId) {
    const image = await prisma_1.prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!image)
        throw new errorHandler_1.HttpError(404, "تصویر یافت نشد.");
    await prisma_1.prisma.$transaction([
        prisma_1.prisma.productImage.updateMany({ where: { productId }, data: { isPrimary: false } }),
        prisma_1.prisma.productImage.update({ where: { id: imageId }, data: { isPrimary: true } }),
    ]);
    await markUnpublishedIfNeeded(productId);
}
async function reorderImages(productId, imageIds) {
    const images = await prisma_1.prisma.productImage.findMany({ where: { productId } });
    const ownedIds = new Set(images.map((i) => i.id));
    for (const id of imageIds) {
        if (!ownedIds.has(id)) {
            throw new errorHandler_1.HttpError(400, "شناسه تصویر نامعتبر است.");
        }
    }
    await prisma_1.prisma.$transaction(imageIds.map((id, index) => prisma_1.prisma.productImage.update({ where: { id }, data: { sortOrder: index } })));
    await markUnpublishedIfNeeded(productId);
}
async function addProductModel(productId, file) {
    const kind = await (0, upload_1.assertValidModel)(file.buffer, file.originalname);
    const stored = await storage_1.storage.save({
        folder: `products/${productId}/models`,
        filename: file.originalname,
        buffer: file.buffer,
        contentType: file.mimetype || "application/octet-stream",
    });
    const model = await prisma_1.prisma.productModel.create({
        data: {
            productId,
            kind, // "GLB" | "GLTF" | "USDZ"
            url: stored.url,
            storageKey: stored.storageKey,
            sizeBytes: stored.sizeBytes,
        },
    });
    await markUnpublishedIfNeeded(productId);
    return model;
}
async function deleteProductModel(productId, modelId) {
    const model = await prisma_1.prisma.productModel.findFirst({ where: { id: modelId, productId } });
    if (!model)
        throw new errorHandler_1.HttpError(404, "فایل سه‌بعدی یافت نشد.");
    await storage_1.storage.delete(model.storageKey).catch(() => undefined);
    await prisma_1.prisma.productModel.delete({ where: { id: modelId } });
    await markUnpublishedIfNeeded(productId);
}
async function markUnpublishedIfNeeded(productId) {
    const product = await prisma_1.prisma.product.findUnique({ where: { id: productId } });
    if (product?.visibility === "PUBLISHED") {
        await prisma_1.prisma.product.update({
            where: { id: productId },
            data: { hasUnpublishedChanges: true },
        });
    }
}
//# sourceMappingURL=assetService.js.map