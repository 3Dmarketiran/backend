"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listProducts = listProducts;
exports.getProductById = getProductById;
exports.createProduct = createProduct;
exports.updateProduct = updateProduct;
exports.deleteProduct = deleteProduct;
exports.assertSellerCanPublish = assertSellerCanPublish;
const prisma_1 = require("../config/prisma");
const storage_1 = require("../storage");
const slug_1 = require("../utils/slug");
const dimensions_1 = require("../utils/dimensions");
const errorHandler_1 = require("../middleware/errorHandler");
async function listProducts(query, opts) {
    const where = {};
    if (opts.publicOnly) {
        // Public catalog: only PUBLISHED products belonging to sellers whose
        // subscription is currently active (spec sections 15/22/46).
        where.visibility = "PUBLISHED";
        where.seller = {
            isActive: true,
            subscriptions: { some: { status: "ACTIVE", endDate: { gte: new Date() } } },
        };
    }
    else {
        if (query.visibility)
            where.visibility = query.visibility;
        if (query.sellerId)
            where.sellerId = query.sellerId;
    }
    if (query.categoryId)
        where.categoryId = query.categoryId;
    if (query.search) {
        where.OR = [
            { name: { contains: query.search } },
            { shortDescription: { contains: query.search } },
            { tags: { contains: query.search } },
        ];
    }
    const orderBy = query.sort === "alphabetical" ? { name: "asc" } : { createdAt: "desc" };
    const [items, total] = await Promise.all([
        prisma_1.prisma.product.findMany({
            where,
            orderBy,
            skip: (query.page - 1) * query.pageSize,
            take: query.pageSize,
            include: {
                images: { orderBy: { sortOrder: "asc" }, take: 1 },
                seller: { select: { id: true, slug: true, storeName: true } },
                category: { select: { id: true, slug: true, name: true } },
            },
        }),
        prisma_1.prisma.product.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
}
async function getProductById(id) {
    const product = await prisma_1.prisma.product.findUnique({
        where: { id },
        include: {
            images: { orderBy: { sortOrder: "asc" } },
            models: true,
            seller: { select: { id: true, slug: true, storeName: true, isActive: true } },
            category: true,
        },
    });
    if (!product)
        throw new errorHandler_1.HttpError(404, "محصول یافت نشد.");
    return product;
}
async function createProduct(sellerId, input) {
    await enforceProductLimit(sellerId);
    const slug = (0, slug_1.slugify)(input.name);
    const dims = input.unit && (input.width || input.height || input.depth)
        ? {
            widthMm: input.width ? (0, dimensions_1.toMillimeters)(input.width, input.unit) : null,
            heightMm: input.height ? (0, dimensions_1.toMillimeters)(input.height, input.unit) : null,
            depthMm: input.depth ? (0, dimensions_1.toMillimeters)(input.depth, input.unit) : null,
            inputUnit: input.unit,
        }
        : {};
    return prisma_1.prisma.product.create({
        data: {
            sellerId,
            slug,
            name: input.name,
            shortDescription: input.shortDescription,
            fullDescription: input.fullDescription,
            categoryId: input.categoryId,
            tags: input.tags,
            visibility: "DRAFT",
            ...dims,
        },
    });
}
async function updateProduct(id, input) {
    const existing = await prisma_1.prisma.product.findUnique({ where: { id } });
    if (!existing)
        throw new errorHandler_1.HttpError(404, "محصول یافت نشد.");
    const dims = input.unit && (input.width !== undefined || input.height !== undefined || input.depth !== undefined)
        ? {
            widthMm: input.width !== undefined ? (0, dimensions_1.toMillimeters)(input.width, input.unit) : existing.widthMm,
            heightMm: input.height !== undefined ? (0, dimensions_1.toMillimeters)(input.height, input.unit) : existing.heightMm,
            depthMm: input.depth !== undefined ? (0, dimensions_1.toMillimeters)(input.depth, input.unit) : existing.depthMm,
            inputUnit: input.unit,
        }
        : {};
    // Any edit to an already-published product marks it as having
    // unpublished changes — the public site must NOT change until the
    // seller explicitly publishes again (spec section 4).
    const hasUnpublishedChanges = existing.visibility === "PUBLISHED" ? true : existing.hasUnpublishedChanges;
    return prisma_1.prisma.product.update({
        where: { id },
        data: {
            name: input.name,
            shortDescription: input.shortDescription,
            fullDescription: input.fullDescription,
            categoryId: input.categoryId,
            tags: input.tags,
            visibility: input.visibility,
            hasUnpublishedChanges,
            ...dims,
        },
    });
}
async function deleteProduct(id) {
    const product = await prisma_1.prisma.product.findUnique({
        where: { id },
        include: { images: true, models: true },
    });
    if (!product)
        throw new errorHandler_1.HttpError(404, "محصول یافت نشد.");
    // Best-effort cleanup of stored files; DB rows cascade-delete via Prisma relations.
    await Promise.all([
        ...product.images.map((img) => storage_1.storage.delete(img.storageKey).catch(() => undefined)),
        ...product.models.map((m) => storage_1.storage.delete(m.storageKey).catch(() => undefined)),
    ]);
    await prisma_1.prisma.product.delete({ where: { id } });
}
async function enforceProductLimit(sellerId) {
    const activeSub = await prisma_1.prisma.subscription.findFirst({
        where: { sellerId, status: "ACTIVE", endDate: { gte: new Date() } },
        include: { plan: true },
        orderBy: { endDate: "desc" },
    });
    if (!activeSub) {
        throw new errorHandler_1.HttpError(403, "برای افزودن محصول، اشتراک فعال لازم است.");
    }
    if (activeSub.plan.productLimit) {
        const count = await prisma_1.prisma.product.count({ where: { sellerId } });
        if (count >= activeSub.plan.productLimit) {
            throw new errorHandler_1.HttpError(403, `محدودیت تعداد محصول پلن شما (${activeSub.plan.productLimit}) به پایان رسیده است.`);
        }
    }
}
/** Used by the publish flow (Phase 5) to confirm the seller may publish right now. */
async function assertSellerCanPublish(sellerId) {
    const seller = await prisma_1.prisma.seller.findUnique({ where: { id: sellerId } });
    if (!seller || !seller.isActive) {
        throw new errorHandler_1.HttpError(403, "فروشنده غیرفعال است.");
    }
    const activeSub = await prisma_1.prisma.subscription.findFirst({
        where: { sellerId, status: "ACTIVE", endDate: { gte: new Date() } },
    });
    if (!activeSub) {
        throw new errorHandler_1.HttpError(403, "اشتراک فعال برای انتشار لازم است.");
    }
}
//# sourceMappingURL=productService.js.map