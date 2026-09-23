import unzipper from "unzipper";
import sharp from "sharp";
import { nanoid } from "nanoid";
import { prisma } from "../config/prisma";
import { storage } from "../storage";
import {
  assertValidImage,
  assertValidModel,
} from "../middleware/upload";
import { HttpError } from "../middleware/errorHandler";

const MAX_ZIP_ENTRIES = 50;
const MAX_EXTRACTED_BYTES = 300 * 1024 * 1024;
const MAX_SINGLE_EXTRACTED_FILE = 100 * 1024 * 1024;

const MODEL_EXTENSIONS = new Set([
  "glb",
  "gltf",
  "usdz",
]);

const GLTF_DEPENDENCY_EXTENSIONS = new Set([
  "bin",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "ktx2",
  "basis",
  "hdr",
  "exr",
  "bmp",
  "tga",
  "gif",
]);

const SAFE_ZIP_PATH_PART = /^[a-zA-Z0-9\u0600-\u06FF._-]+$/;

async function assertUploadAllowed(
  productId: string,
  incomingBytes: number
): Promise<void> {
  if (!Number.isFinite(incomingBytes) || incomingBytes < 0) {
    throw new HttpError(
      400,
      "حجم فایل نامعتبر است."
    );
  }

  const product = await prisma.product.findUnique({
    where: {
      id: productId,
    },
    select: {
      sellerId: true,
    },
  });

  if (!product) {
    throw new HttpError(
      404,
      "محصول یافت نشد."
    );
  }

  const now = new Date();

  const activeSub =
    await prisma.subscription.findFirst({
      where: {
        sellerId: product.sellerId,
        status: "ACTIVE",
        startDate: {
          lte: now,
        },
        endDate: {
          gte: now,
        },
        plan: {
          isActive: true,
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

  if (
    storageLimitMb === null ||
    storageLimitMb === undefined
  ) {
    return;
  }

  const [
    imageUsage,
    modelUsage,
  ] = await Promise.all([
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
  if (!file?.buffer?.length) {
    throw new HttpError(
      400,
      "فایل تصویر خالی است."
    );
  }

  await assertValidImage(file.buffer);

  const converted =
    await convertImageToWebP(file.buffer);

  await assertUploadAllowed(
    productId,
    converted.buffer.length
  );

  const stored =
    await storage.save({
      folder: `products/${productId}/images`,
      filename: `${stripExtension(
        file.originalname
      )}.webp`,
      buffer: converted.buffer,
      contentType: "image/webp",
    });

  try {
    const existingCount =
      await prisma.productImage.count({
        where: {
          productId,
        },
      });

    const image =
      await prisma.productImage.create({
        data: {
          productId,
          url: stored.url,
          storageKey: stored.storageKey,
          isPrimary:
            existingCount === 0,
          sortOrder: existingCount,
          width:
            converted.width ?? null,
          height:
            converted.height ?? null,
          sizeBytes:
            stored.sizeBytes,
        },
      });

    await markUnpublishedIfNeeded(
      productId
    );

    return image;
  } catch (error) {
    await storage
      .delete(stored.storageKey)
      .catch(() => undefined);

    throw error;
  }
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

  await prisma.productImage.delete({
    where: {
      id: imageId,
    },
  });

  await storage
    .delete(image.storageKey)
    .catch(() => undefined);

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

  await markUnpublishedIfNeeded(
    productId
  );
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

  await markUnpublishedIfNeeded(
    productId
  );
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
    images.map(
      (image) => image.id
    )
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

  if (
    imageIds.length !==
    images.length
  ) {
    throw new HttpError(
      400,
      "لیست ترتیب تصاویر باید شامل تمام تصاویر محصول باشد."
    );
  }

  await prisma.$transaction(
    imageIds.map(
      (id, index) =>
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

  await markUnpublishedIfNeeded(
    productId
  );
}

// ---------------------------------------------------------------------
// Single 3D / AR model
// ---------------------------------------------------------------------

export async function addProductModel(
  productId: string,
  file: Express.Multer.File
) {
  if (!file?.buffer?.length) {
    throw new HttpError(
      400,
      "فایل سه‌بعدی خالی است."
    );
  }

  const kind =
    await assertValidModel(
      file.buffer,
      file.originalname
    );

  await assertUploadAllowed(
    productId,
    file.buffer.length
  );

  const stored =
    await storage.save({
      folder: `products/${productId}/models`,
      filename: file.originalname,
      buffer: file.buffer,
      contentType:
        getModelContentType(kind),
    });

  try {
    const model =
      await prisma.productModel.create({
        data: {
          productId,
          kind,
          url: stored.url,
          storageKey:
            stored.storageKey,
          sizeBytes:
            stored.sizeBytes,
        },
      });

    await markUnpublishedIfNeeded(
      productId
    );

    return model;
  } catch (error) {
    await storage
      .delete(stored.storageKey)
      .catch(() => undefined);

    throw error;
  }
}

// ---------------------------------------------------------------------
// ZIP model upload
// ---------------------------------------------------------------------

interface ZipEntryCandidate {
  filename: string;
  buffer: Buffer;
  extension: string;
  isModel: boolean;
}

interface GltfPackage {
  model: ZipEntryCandidate;
  dependencies: ZipEntryCandidate[];
}

export async function addProductModelsFromZip(
  productId: string,
  file: Express.Multer.File
) {
  if (!file?.buffer?.length) {
    throw new HttpError(
      400,
      "فایل ZIP خالی است."
    );
  }

  const directory =
    await unzipper.Open.buffer(
      file.buffer
    );

  if (
    directory.files.length === 0
  ) {
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

  const entries: ZipEntryCandidate[] =
    [];

  let totalExtractedBytes = 0;

  for (const entry of directory.files) {
    if (entry.type !== "File") {
      continue;
    }

    const safePath =
      sanitizeZipEntryPath(
        entry.path
      );

    if (!safePath) {
      throw new HttpError(
        400,
        "فایل ZIP شامل مسیر نامعتبر است."
      );
    }

    const extension =
      getExtension(safePath);

    const isModel =
      MODEL_EXTENSIONS.has(
        extension
      );

    const isDependency =
      GLTF_DEPENDENCY_EXTENSIONS.has(
        extension
      );

    if (
      !isModel &&
      !isDependency
    ) {
      continue;
    }

    const declaredSize =
      Number(
        entry.uncompressedSize ?? 0
      );

    if (
      Number.isFinite(
        declaredSize
      ) &&
      declaredSize >
        MAX_SINGLE_EXTRACTED_FILE
    ) {
      throw new HttpError(
        400,
        `فایل ${safePath} پس از استخراج بیش از 100MB خواهد بود.`
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

    totalExtractedBytes +=
      buffer.length;

    if (
      totalExtractedBytes >
      MAX_EXTRACTED_BYTES
    ) {
      throw new HttpError(
        400,
        "حجم فایل‌های استخراج‌شده از ZIP بیش از حد مجاز است."
      );
    }

    entries.push({
      filename: safePath,
      buffer,
      extension,
      isModel,
    });
  }

  const modelEntries =
    entries.filter(
      (entry) => entry.isModel
    );

  if (
    modelEntries.length === 0
  ) {
    throw new HttpError(
      400,
      "داخل ZIP هیچ فایل GLB، GLTF یا USDZ معتبری پیدا نشد."
    );
  }

  /*
   * Validate every model before writing anything to storage.
   */
  for (const model of modelEntries) {
    await assertValidModel(
      model.buffer,
      model.filename
    );
  }

  const packages =
    buildGltfPackages(entries);

  const incomingStorageBytes =
    calculatePackageStorageBytes(
      packages
    );

  await assertUploadAllowed(
    productId,
    incomingStorageBytes
  );

  const createdModels: Array<{
    id: string;
    storageKey: string;
  }> = [];

  const createdStorageKeys: string[] =
    [];

  try {
    for (const pkg of packages) {
      const modelFolder =
        `products/${productId}/models/${nanoid(16)}`;

      /*
       * GLTF packages keep their internal relative paths.
       *
       * Example:
       *   scene.gltf
       *   scene.bin
       *   textures/albedo.png
       *
       * All are stored under the same model folder so the .gltf file
       * can continue using its relative references.
       */
      for (const dependency of
        pkg.dependencies) {
        const stored =
          await storage.save({
            folder: modelFolder,
            filename:
              dependency.filename,
            buffer:
              dependency.buffer,
            contentType:
              getDependencyContentType(
                dependency.extension
              ),
          });

        createdStorageKeys.push(
          stored.storageKey
        );
      }

      const modelStored =
        await storage.save({
          folder: modelFolder,
          filename: pkg.model.filename,
          buffer: pkg.model.buffer,
          contentType:
            getModelContentType(
              pkg.model.extension
            ),
        });

      createdStorageKeys.push(
        modelStored.storageKey
      );

      const model =
        await prisma.productModel.create({
          data: {
            productId,
            kind:
              getModelKind(
                pkg.model.extension
              ),
            url:
              modelStored.url,
            storageKey:
              modelStored.storageKey,
            sizeBytes:
              calculatePackageSize(pkg),
          },
        });

      createdModels.push({
        id: model.id,
        storageKey:
          modelStored.storageKey,
      });
    }
  } catch (error) {
    for (const model of createdModels) {
      await prisma.productModel
        .delete({
          where: {
            id: model.id,
          },
        })
        .catch(() => undefined);
    }

    for (const storageKey of
      createdStorageKeys) {
      await storage
        .delete(storageKey)
        .catch(() => undefined);
    }

    throw error;
  }

  await markUnpublishedIfNeeded(
    productId
  );

  return await prisma.productModel.findMany({
    where: {
      id: {
        in: createdModels.map(
          (model) => model.id
        ),
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });
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

  await prisma.productModel.delete({
    where: {
      id: modelId,
    },
  });

  await storage
    .delete(model.storageKey)
    .catch(() => undefined);

  await markUnpublishedIfNeeded(
    productId
  );
}

// ---------------------------------------------------------------------
// ZIP / GLTF helpers
// ---------------------------------------------------------------------

function buildGltfPackages(
  entries: ZipEntryCandidate[]
): GltfPackage[] {
  const models =
    entries.filter(
      (entry) => entry.isModel
    );

  const dependencies =
    entries.filter(
      (entry) => !entry.isModel
    );

  const packages: GltfPackage[] =
    [];

  for (const model of models) {
    const extension =
      model.extension;

    /*
     * GLB and USDZ are self-contained.
     */
    if (
      extension === "glb" ||
      extension === "usdz"
    ) {
      packages.push({
        model,
        dependencies: [],
      });

      continue;
    }

    /*
     * GLTF may reference .bin and textures.
     *
     * When there is only one GLTF model in the ZIP, all compatible
     * dependencies are associated with it.
     *
     * When multiple GLTF models exist, dependencies are assigned
     * according to their relative directory.
     */
    const modelDirectory =
      getDirectory(model.filename);

    const related =
      dependencies.filter(
        (dependency) =>
          isPathInsideDirectory(
            dependency.filename,
            modelDirectory
          )
      );

    packages.push({
      model,
      dependencies: related,
    });
  }

  return packages;
}

function calculatePackageStorageBytes(
  packages: GltfPackage[]
): number {
  return packages.reduce(
    (sum, pkg) =>
      sum +
      calculatePackageSize(pkg),
    0
  );
}

function calculatePackageSize(
  pkg: GltfPackage
): number {
  return [
    pkg.model,
    ...pkg.dependencies,
  ].reduce(
    (sum, entry) =>
      sum + entry.buffer.length,
    0
  );
}

function getDirectory(
  pathname: string
): string {
  const normalized =
    pathname.replace(
      /\\/g,
      "/"
    );

  const slash =
    normalized.lastIndexOf("/");

  if (slash < 0) {
    return "";
  }

  return normalized.slice(
    0,
    slash
  );
}

function isPathInsideDirectory(
  pathname: string,
  directory: string
): boolean {
  if (!directory) {
    return true;
  }

  const normalized =
    pathname.replace(
      /\\/g,
      "/"
    );

  return (
    normalized ===
      directory ||
    normalized.startsWith(
      `${directory}/`
    )
  );
}

function getDependencyContentType(
  extension: string
): string {
  switch (extension) {
    case "bin":
      return "application/octet-stream";

    case "png":
      return "image/png";

    case "jpg":
    case "jpeg":
      return "image/jpeg";

    case "webp":
      return "image/webp";

    case "ktx2":
      return "image/ktx2";

    case "hdr":
      return "image/vnd.radiance";

    case "exr":
      return "image/x-exr";

    case "bmp":
      return "image/bmp";

    case "gif":
      return "image/gif";

    case "tga":
      return "image/x-tga";

    default:
      return "application/octet-stream";
  }
}

// ---------------------------------------------------------------------
// Security / validation helpers
// ---------------------------------------------------------------------

function sanitizeZipEntryPath(
  entryPath: string
): string | null {
  const normalized =
    entryPath
      .replace(
        /\\/g,
        "/"
      )
      .replace(
        /\0/g,
        ""
      );

  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.startsWith("\\") ||
    /^[a-zA-Z]:\//.test(
      normalized
    )
  ) {
    return null;
  }

  const parts =
    normalized.split("/");

  if (
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        !SAFE_ZIP_PATH_PART.test(
          part
        )
    )
  ) {
    return null;
  }

  const clean =
    parts.join("/");

  if (
    clean.length > 500
  ) {
    return null;
  }

  return clean;
}

function getExtension(
  filename: string
): string {
  const dot =
    filename.lastIndexOf(".");

  if (
    dot <= 0 ||
    dot ===
      filename.length - 1
  ) {
    return "";
  }

  return filename
    .slice(dot + 1)
    .toLowerCase();
}

function getModelKind(
  extension: string
): string {
  switch (extension) {
    case "glb":
      return "GLB";

    case "gltf":
      return "GLTF";

    case "usdz":
      return "USDZ";

    default:
      throw new HttpError(
        400,
        "فرمت مدل سه‌بعدی پشتیبانی نمی‌شود."
      );
  }
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
    filename.slice(
      0,
      lastDot
    );

  return (
    name
      .replace(
        /[^a-zA-Z0-9\u0600-\u06FF._-]+/g,
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
): Promise<void> {
  await prisma.product.updateMany({
    where: {
      id: productId,
      visibility: "PUBLISHED",
    },
    data: {
      hasUnpublishedChanges: true,
    },
  });
}
