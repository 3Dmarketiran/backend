import unzipper from "unzipper";
import sharp from "sharp";
import { prisma } from "../config/prisma";
import { storage } from "../storage";
import {
  assertValidImage,
  assertValidModel,
} from "../middleware/upload";
import { HttpError } from "../middleware/errorHandler";

const MAX_ZIP_ENTRIES = 50;
const MAX_EXTRACTED_BYTES = 300 * 1024 * 1024; // 300MB
const MAX_SINGLE_EXTRACTED_FILE = 100 * 1024 * 1024; // 100MB

const MODEL_EXTENSIONS = new Set([
  "glb",
  "gltf",
  "usdz",
]);

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

  const storageLimitMb =
    activeSub.plan.storageLimitMb;

  if (!storageLimitMb) {
    return;
  }

  const [imageUsage, modelUsage] =
    await Promise.all([
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

  const limitBytes =
    storageLimitMb * 1024 * 1024;

  if (
    usedBytes + incomingBytes >
    limitBytes
  ) {
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

// ---------------------------------------------------------------------
// Product images
// ---------------------------------------------------------------------

export async function addProductImage(
  productId: string,
  file: Express.Multer.File
) {
  await assertUploadAllowed(
    productId,
    file.buffer.length
  );

  await assertValidImage(file.buffer);

  const converted =
    await convertImageToWebP(file.buffer);

  const stored = await storage.save({
    folder: `products/${productId}/images`,
    filename: `${stripExtension(
      file.originalname
    )}.webp`,
    buffer: converted.buffer,
    contentType: "image/webp",
  });

  const existingCount =
    await prisma.productImage.count({
      where: { productId },
    });

  const image =
    await prisma.productImage.create({
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
  const image =
    await prisma.productImage.findFirst({
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
    const next =
      await prisma.productImage.findFirst({
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
  const image =
    await prisma.productImage.findFirst({
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
  const images =
    await prisma.productImage.findMany({
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

  if (
    new Set(imageIds).size !==
    imageIds.length
  ) {
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

// ---------------------------------------------------------------------
// Single 3D / AR model
// ---------------------------------------------------------------------

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

  const model =
    await prisma.productModel.create({
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

// ---------------------------------------------------------------------
// ZIP model upload
// ---------------------------------------------------------------------

export async function addProductModelsFromZip(
  productId: string,
  file: Express.Multer.File
) {
  if (!file.buffer?.length) {
    throw new HttpError(
      400,
      "فایل ZIP خالی است."
    );
  }

  const directory =
    await unzipper.Open.buffer(file.buffer);

  if (directory.files.length === 0) {
    throw new HttpError(
      400,
      "فایل ZIP خالی است."
    );
  }

  if (
    directory.files.length >
    MAX_ZIP_ENTRIES
  ) {
    throw new HttpError(
      400,
      `فایل ZIP بیش از حد مجاز فایل دارد. حداکثر ${MAX_ZIP_ENTRIES} فایل مجاز است.`
    );
  }

  const candidates: Array<{
    filename: string;
    buffer: Buffer;
    kind: string;
  }> = [];

  let totalExtractedBytes = 0;

  for (const entry of directory.files) {
    if (entry.type !== "File") {
      continue;
    }

    const safePath =
      sanitizeZipEntryPath(entry.path);

    if (!safePath) {
      throw new HttpError(
        400,
        "فایل ZIP شامل مسیر نامعتبر است."
      );
    }

    const extension =
      getExtension(safePath);

    // ZIP may contain thumbnails, textures or metadata.
    // Only model files are imported into ProductModel.
    if (
      !MODEL_EXTENSIONS.has(extension)
    ) {
      continue;
    }

    const uncompressedSize =
      Number(entry.uncompressedSize ?? 0);

    if (
      uncompressedSize >
      MAX_SINGLE_EXTRACTED_FILE
    ) {
      throw new HttpError(
        400,
        `فایل ${safePath} پس از استخراج بیش از 100MB خواهد بود.`
      );
    }

    totalExtractedBytes +=
      uncompressedSize;

    if (
      totalExtractedBytes >
      MAX_EXTRACTED_BYTES
    ) {
      throw new HttpError(
        400,
        "حجم فایل‌های استخراج‌شده از ZIP بیش از حد مجاز است."
      );
    }

    const buffer =
      await entry.buffer();

    if (
      buffer.length >
      MAX_SINGLE_EXTRACTED_FILE
    ) {
      throw new HttpError(
        400,
        `فایل ${safePath} بیش از 100MB است.`
      );
    }

    const kind =
      await assertValidModel(
        buffer,
        safePath
      );

    candidates.push({
      filename: safePath,
      buffer,
      kind,
    });
  }

  if (candidates.length === 0) {
    throw new HttpError(
      400,
      "داخل ZIP هیچ فایل GLB، GLTF یا USDZ معتبری پیدا نشد."
    );
  }

  await assertUploadAllowed(
    productId,
    candidates.reduce(
      (sum, item) =>
        sum + item.buffer.length,
      0
    )
  );

  const createdModels = [];

  try {
    for (const item of candidates) {
      const stored =
        await storage.save({
          folder: `products/${productId}/models`,
          filename: item.filename,
          buffer: item.buffer,
          contentType:
            getModelContentType(
              item.kind
            ),
        });

      const model =
        await prisma.productModel.create({
          data: {
            productId,
            kind: item.kind,
            url: stored.url,
            storageKey:
              stored.storageKey,
            sizeBytes:
              stored.sizeBytes,
          },
        });

      createdModels.push(model);
    }
  } catch (error) {
    // If one file fails after previous files were stored,
    // remove the already-created assets to avoid orphaned files.
    for (const model of createdModels) {
      await storage
        .delete(model.storageKey)
        .catch(() => undefined);

      await prisma.productModel
        .delete({
          where: {
            id: model.id,
          },
        })
        .catch(() => undefined);
    }

    throw error;
  }

  await markUnpublishedIfNeeded(productId);

  return createdModels;
}

// ---------------------------------------------------------------------
// Delete 3D / AR model
// ---------------------------------------------------------------------

export async function deleteProductModel(
  productId: string,
  modelId: string
) {
  const model =
    await prisma.productModel.findFirst({
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

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function sanitizeZipEntryPath(
  entryPath: string
): string | null {
  const normalized =
    entryPath.replace(/\\/g, "/");

  if (
    normalized.startsWith("/") ||
    normalized.startsWith("\\") ||
    /^[a-zA-Z]:\//.test(normalized)
  ) {
    return null;
  }

  const parts = normalized.split("/");

  if (
    parts.some(
      (part) =>
        part === ".." ||
        part === "."
    )
  ) {
    return null;
  }

  const clean = parts
    .filter(Boolean)
    .join("/");

  if (!clean) {
    return null;
  }

  return clean;
}

function getExtension(
  filename: string
): string {
  const dot =
    filename.lastIndexOf(".");

  if (dot < 0) {
    return "";
  }

  return filename
    .slice(dot + 1)
    .toLowerCase();
}

function getModelContentType(
  kind: string
): string {
  switch (kind) {
    case "GLB":
      return "model/gltf-binary";

    case "GLTF":
      return "model/gltf+json";

    case "USDZ":
      return "model/vnd.usdz+zip";

    default:
      return "application/octet-stream";
  }
}

function stripExtension(
  filename: string
): string {
  const lastDot =
    filename.lastIndexOf(".");

  if (lastDot <= 0) {
    return "image";
  }

  const name =
    filename.slice(0, lastDot);

  return (
    name
      .replace(
        /[^a-zA-Z0-9\u0600-\u06FF_-]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      )
      .slice(0, 100) ||
    "image"
  );
}

async function markUnpublishedIfNeeded(
  productId: string
) {
  const product =
    await prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

  if (
    product?.visibility ===
    "PUBLISHED"
  ) {
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
