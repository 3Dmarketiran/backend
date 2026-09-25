import { prisma } from "../config/prisma";
import { storage } from "../storage";
import { assertValidImage, assertValidModel } from "../middleware/upload";
import { HttpError } from "../middleware/errorHandler";

export async function addProductImage(productId: string, file: Express.Multer.File) {
  await assertValidImage(file.buffer);

  const stored = await storage.save({
    folder: `products/${productId}/images`,
    filename: file.originalname,
    buffer: file.buffer,
    contentType: file.mimetype,
  });

  const existingCount = await prisma.productImage.count({ where: { productId } });

  const image = await prisma.productImage.create({
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

export async function deleteProductImage(productId: string, imageId: string) {
  const image = await prisma.productImage.findFirst({ where: { id: imageId, productId } });
  if (!image) throw new HttpError(404, "تصویر یافت نشد.");

  await storage.delete(image.storageKey).catch(() => undefined);
  await prisma.productImage.delete({ where: { id: imageId } });

  // If the deleted image was primary, promote the next one.
  if (image.isPrimary) {
    const next = await prisma.productImage.findFirst({
      where: { productId },
      orderBy: { sortOrder: "asc" },
    });
    if (next) {
      await prisma.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
  }

  await markUnpublishedIfNeeded(productId);
}

export async function setPrimaryImage(productId: string, imageId: string) {
  const image = await prisma.productImage.findFirst({ where: { id: imageId, productId } });
  if (!image) throw new HttpError(404, "تصویر یافت نشد.");

  await prisma.$transaction([
    prisma.productImage.updateMany({ where: { productId }, data: { isPrimary: false } }),
    prisma.productImage.update({ where: { id: imageId }, data: { isPrimary: true } }),
  ]);

  await markUnpublishedIfNeeded(productId);
}

export async function reorderImages(productId: string, imageIds: string[]) {
  const images = await prisma.productImage.findMany({ where: { productId } });
  const ownedIds = new Set(images.map((i) => i.id));

  for (const id of imageIds) {
    if (!ownedIds.has(id)) {
      throw new HttpError(400, "شناسه تصویر نامعتبر است.");
    }
  }

  await prisma.$transaction(
    imageIds.map((id, index) =>
      prisma.productImage.update({ where: { id }, data: { sortOrder: index } })
    )
  );

  await markUnpublishedIfNeeded(productId);
}

export async function addProductModel(productId: string, file: Express.Multer.File) {
  const kind = await assertValidModel(file.buffer, file.originalname);

  const stored = await storage.save({
    folder: `products/${productId}/models`,
    filename: file.originalname,
    buffer: file.buffer,
    contentType: file.mimetype || "application/octet-stream",
  });

  const model = await prisma.productModel.create({
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

export async function deleteProductModel(productId: string, modelId: string) {
  const model = await prisma.productModel.findFirst({ where: { id: modelId, productId } });
  if (!model) throw new HttpError(404, "فایل سه‌بعدی یافت نشد.");

  await storage.delete(model.storageKey).catch(() => undefined);
  await prisma.productModel.delete({ where: { id: modelId } });
  await markUnpublishedIfNeeded(productId);
}

async function markUnpublishedIfNeeded(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (product?.visibility === "PUBLISHED") {
    await prisma.product.update({
      where: { id: productId },
      data: { hasUnpublishedChanges: true },
    });
  }
}
