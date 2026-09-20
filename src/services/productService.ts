import { prisma } from "../config/prisma";
import { storage } from "../storage";
import { slugify } from "../utils/slug";
import { toMillimeters } from "../utils/dimensions";
import { HttpError } from "../middleware/errorHandler";
import type { z } from "zod";
import type { createProductSchema, updateProductSchema, listProductsQuerySchema } from "../validators/product";

type CreateInput = z.infer<typeof createProductSchema>;
type UpdateInput = z.infer<typeof updateProductSchema>;
type ListQuery = z.infer<typeof listProductsQuerySchema>;

export async function listProducts(query: ListQuery, opts: { publicOnly: boolean }) {
  const where: Record<string, unknown> = {};

  if (opts.publicOnly) {
    // Public catalog: only PUBLISHED products belonging to sellers whose
    // subscription is currently active (spec sections 15/22/46).
    where.visibility = "PUBLISHED";
    where.seller = {
      isActive: true,
      subscriptions: { some: { status: "ACTIVE", endDate: { gte: new Date() } } },
    };
  } else {
    if (query.visibility) where.visibility = query.visibility;
    if (query.sellerId) where.sellerId = query.sellerId;
  }

  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.search) {
    where.OR = [
      { name: { contains: query.search } },
      { shortDescription: { contains: query.search } },
      { tags: { contains: query.search } },
    ];
  }

  const orderBy =
    query.sort === "alphabetical" ? { name: "asc" as const } : { createdAt: "desc" as const };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
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
    prisma.product.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getProductById(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      models: true,
      seller: { select: { id: true, slug: true, storeName: true, isActive: true } },
      category: true,
    },
  });
  if (!product) throw new HttpError(404, "محصول یافت نشد.");
  return product;
}

export async function createProduct(sellerId: string, input: CreateInput) {
  await enforceProductLimit(sellerId);

  const slug = slugify(input.name);

  const dims =
    input.unit && (input.width || input.height || input.depth)
      ? {
          widthMm: input.width ? toMillimeters(input.width, input.unit) : null,
          heightMm: input.height ? toMillimeters(input.height, input.unit) : null,
          depthMm: input.depth ? toMillimeters(input.depth, input.unit) : null,
          inputUnit: input.unit,
        }
      : {};

  return prisma.product.create({
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

export async function updateProduct(id: string, input: UpdateInput) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "محصول یافت نشد.");

  const dims =
    input.unit && (input.width !== undefined || input.height !== undefined || input.depth !== undefined)
      ? {
          widthMm: input.width !== undefined ? toMillimeters(input.width, input.unit) : existing.widthMm,
          heightMm: input.height !== undefined ? toMillimeters(input.height, input.unit) : existing.heightMm,
          depthMm: input.depth !== undefined ? toMillimeters(input.depth, input.unit) : existing.depthMm,
          inputUnit: input.unit,
        }
      : {};

  // Any edit to an already-published product marks it as having
  // unpublished changes — the public site must NOT change until the
  // seller explicitly publishes again (spec section 4).
  const hasUnpublishedChanges = existing.visibility === "PUBLISHED" ? true : existing.hasUnpublishedChanges;

  return prisma.product.update({
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

export async function deleteProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { images: true, models: true },
  });
  if (!product) throw new HttpError(404, "محصول یافت نشد.");

  // Best-effort cleanup of stored files; DB rows cascade-delete via Prisma relations.
  await Promise.all([
    ...product.images.map((img) => storage.delete(img.storageKey).catch(() => undefined)),
    ...product.models.map((m) => storage.delete(m.storageKey).catch(() => undefined)),
  ]);

  await prisma.product.delete({ where: { id } });
}

async function enforceProductLimit(sellerId: string): Promise<void> {
  const activeSub = await prisma.subscription.findFirst({
    where: { sellerId, status: "ACTIVE", endDate: { gte: new Date() } },
    include: { plan: true },
    orderBy: { endDate: "desc" },
  });

  if (!activeSub) {
    throw new HttpError(403, "برای افزودن محصول، اشتراک فعال لازم است.");
  }

  if (activeSub.plan.productLimit) {
    const count = await prisma.product.count({ where: { sellerId } });
    if (count >= activeSub.plan.productLimit) {
      throw new HttpError(
        403,
        `محدودیت تعداد محصول پلن شما (${activeSub.plan.productLimit}) به پایان رسیده است.`
      );
    }
  }
}

/** Used by the publish flow (Phase 5) to confirm the seller may publish right now. */
export async function assertSellerCanPublish(sellerId: string): Promise<void> {
  const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
  if (!seller || !seller.isActive) {
    throw new HttpError(403, "فروشنده غیرفعال است.");
  }
  const activeSub = await prisma.subscription.findFirst({
    where: { sellerId, status: "ACTIVE", endDate: { gte: new Date() } },
  });
  if (!activeSub) {
    throw new HttpError(403, "اشتراک فعال برای انتشار لازم است.");
  }
}
