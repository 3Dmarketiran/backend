import sharp from "sharp";
import { prisma } from "../config/prisma";
import { storage } from "../storage";
import { assertValidImage, assertValidModel } from "../middleware/upload";
import { HttpError } from "../middleware/errorHandler";

async function assertUploadAllowed(
  productId: string,
  incomingBytes: number
): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { sellerId: true },
  });

  if (!product) {
    throw new HttpError(404, "محصول یافت نشد.");
  }

  const activeSub = await prisma.subscription.findFirst({
    where: {
      sellerId: product.sellerId,
      status: "ACTIVE",
      endDate: {
        gte: new Date(),
      },
    },
    include: {
      plan: true,
    },
    orderBy: {
      endDate: "desc",
    },
  });

  if (!activeSub) {
    throw new HttpError(
      403,
      "برای آپلود فایل، اشتراک فعال لازم است."
    );
  }

  const storageLimitMb = activeSub.plan.storageLimitMb;

  if (!storageLimitMb) {
    return;
  }

  const [imageUsage, modelUsage] = await Promise.all([
    prisma.productImage.aggregate({
      where: {
        product: {
          sellerId: product.sellerId,
        },
      },
      _sum: {
        sizeBytes: true,
      },
    }),

    prisma.productModel.aggregate({
      where: {
        product: {
          sellerId: product.sellerId,
        },
      },
      _sum: {
        sizeBytes: true,
      },
    }),
  ]);

  const usedBytes =
    (imageUsage._sum.sizeBytes ?? 0) +
    (modelUsage._sum.sizeBytes ?? 0);

  const limitBytes = storageLimitMb * 1024 * 1024;

  if (usedBytes + incomingBytes > limitBytes) {
    const usedMb = Math.ceil(
      usedBytes / (1024 * 1024)
    );

    const incomingMb = Math.ceil(
      incomingBytes / (1024 * 1024)
    );

    throw new HttpError(
      403,
      `فضای ذخیره‌سازی پلن شما کافی نیست. مصرف فعلی: ${usedMb}MB، فایل جدید: ${incomingMb}MB، سقف پلن: ${storageLimitMb}MB.`
    );
  }
}

/**
 * Converts supported raster images to WebP before storage.
 *
 * This gives the public site smaller and faster-loading images while
 * keeping the original upload completely outside persistent storage.
 */
async function convertImageToWebP(
  buffer: Buffer
): Promise<{
  buffer: Buffer;
  width?: number;
  height?: number;
}> {
  try {
    const result = await sharp(buffer)
      .rotate()
      .webp({
        quality: 88,
        effort: 4,
      })
      .toBuffer({
        resolveWithObject: true,
      });

    return {
      buffer: result.data,
      width: result.info.width,
      height: result.info.height,
    };
  } catch {
    throw new HttpError(
      400,
      "پردازش تصویر ناموفق بود. لطفاً یک تصویر معتبر JPG، PNG یا WEBP انتخاب کنید."
    );
  }
}

export async function addProductImage(
  productId: string,
  file: Express.Multer.File
) {
  await assertUploadAllowed(
    productId,
    file.buffer.length
  );

  await assertValidImage(file.buffer);

  const converted = await convertImageToWebP(
    file.buffer
  );

  /*
   * Storage accounting is based on the actual stored file size,
   * not the temporary uploaded file size.
   */
  if (converted.buffer.length > file.buffer.length) {
    // The original upload has already passed the upload-size limit.
    // We intentionally do not reject a valid image just because WebP
    // happens to be slightly larger than the original.
  }

  const stored = await storage.save({
    folder: `products/${productId}/images`,
    filename: `${stripExtension(file.originalname)}.webp`,
    buffer: converted.buffer,
    contentType: "image/webp",
  });

  const existingCount = await prisma.productImage.count({
    where: {
      productId,
    },
  });

  const image = await prisma.productImage.create({
    data: {
      productId,
      url: stored.url,
      storageKey: stored.storageKey,
      isPrimary: existingCount === 0,
      sortOrder: existingCount,
      width: converted.width ?? null,
      height: converted.height ?? null,
      sizeBytes: stored.sizeBytes,
    },
  });

  await markUnpublishedIfNeeded(productId);

  return image;
}

export async function deleteProductImage(
  productId: string,
  imageId: string
) {
  const image = await prisma.productImage.findFirst({
    where: {
      id: imageId,
      productId,
    },
  });

  if (!image) {
    throw new HttpError(
      404,
      "تصویر یافت نشد."
    );
  }

  await storage
    .delete(image.storageKey)
    .catch(() => undefined);

  await prisma.productImage.delete({
    where: {
      id: imageId,
    },
  });

  if (image.isPrimary) {
    const next = await prisma.productImage.findFirst({
      where: {
        productId,
      },
      orderBy: {
        sortOrder: "asc",
      },
    });

    if (next) {
      await prisma.productImage.update({
        where: {
          id: next.id,
        },
        data: {
          isPrimary: true,
        },
      });
    }
  }

  await markUnpublishedIfNeeded(productId);
}

export async function setPrimaryImage(
  productId: string,
  imageId: string
) {
  const image = await prisma.productImage.findFirst({
    where: {
      id: imageId,
      productId,
    },
  });

  if (!image) {
    throw new HttpError(
      404,
      "تصویر یافت نشد."
    );
  }

  await prisma.$transaction([
    prisma.productImage.updateMany({
      where: {
        productId,
      },
      data: {
        isPrimary: false,
      },
    }),

    prisma.productImage.update({
      where: {
        id: imageId,
      },
      data: {
        isPrimary: true,
      },
    }),
  ]);

  await markUnpublishedIfNeeded(productId);
}

export async function reorderImages(
  productId: string,
  imageIds: string[]
) {
  const images = await prisma.productImage.findMany({
    where: {
      productId,
    },
  });

  const ownedIds = new Set(
    images.map((image) => image.id)
  );

  for (const id of imageIds) {
    if (!ownedIds.has(id)) {
      throw new HttpError(
        400,
        "شناسه تصویر نامعتبر است."
      );
    }
  }

  if (new Set(imageIds).size !== imageIds.length) {
    throw new HttpError(
      400,
      "شناسه‌های تصویر تکراری هستند."
    );
  }

  await prisma.$transaction(
    imageIds.map((id, index) =>
      prisma.productImage.update({
        where: {
          id,
        },
        data: {
          sortOrder: index,
        },
      })
    )
  );

  await markUnpublishedIfNeeded(productId);
}

export async function addProductModel(
  productId: string,
  file: Express.Multer.File
) {
  await assertUploadAllowed(
    productId,
    file.buffer.length
  );

  const kind = await assertValidModel(
    file.buffer,
    file.originalname
  );

  const stored = await storage.save({
    folder: `products/${productId}/models`,
    filename: file.originalname,
    buffer: file.buffer,
    contentType:
      file.mimetype ||
      "application/octet-stream",
  });

  const model = await prisma.productModel.create({
    data: {
      productId,
      kind,
      url: stored.url,
      storageKey: stored.storageKey,
      sizeBytes: stored.sizeBytes,
    },
  });

  await markUnpublishedIfNeeded(productId);

  return model;
}

export async function deleteProductModel(
  productId: string,
  modelId: string
) {
  const model = await prisma.productModel.findFirst({
    where: {
      id: modelId,
      productId,
    },
  });

  if (!model) {
    throw new HttpError(
      404,
      "فایل سه‌بعدی یافت نشد."
    );
  }

  await storage
    .delete(model.storageKey)
    .catch(() => undefined);

  await prisma.productModel.delete({
    where: {
      id: modelId,
    },
  });

  await markUnpublishedIfNeeded(productId);
}

async function markUnpublishedIfNeeded(
  productId: string
) {
  const product = await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

  if (product?.visibility === "PUBLISHED") {
    await prisma.product.update({
      where: {
        id: productId,
      },
      data: {
        hasUnpublishedChanges: true,
      },
    });
  }
}

function stripExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");

  if (lastDot <= 0) {
    return "image";
  }

  const name = filename.slice(0, lastDot);

  return (
    name
      .replace(/[^a-zA-Z0-9\u0600-\u06FF_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "image"
  );
}
