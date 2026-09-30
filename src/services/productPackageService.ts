import unzipper from "unzipper";
import { nanoid } from "nanoid";
import sharp from "sharp";
import { prisma } from "../config/prisma";
import { storage } from "../storage";
import { HttpError } from "../middleware/errorHandler";
import { assertValidImage, assertValidModel } from "../middleware/upload";

/**
 * Direct asset storage architecture.
 *
 * The browser must receive public asset URLs from Supabase Storage/CDN, not
 * stream product binaries through Render. The upload request may still pass
 * through Render because the current admin/seller UI uses multipart upload;
 * after validation, each binary is written as an individual object.
 */
const MAX_ASSET_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PACKAGE_FILES = 35;

const MODEL_EXTENSIONS = new Set(["glb", "gltf", "bin", "png", "jpg", "jpeg", "webp", "ktx2", "basis", "hdr", "exr", "bmp", "tga", "gif"]);
const MODEL_ROOT_EXTENSIONS = new Set(["glb", "gltf", "usdz"]);

type PackageKind = "images" | "models" | "ar";

function extension(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

function safeName(name: string, fallback: string): string {
  const normalized = name.replace(/\\/g, "/").split("/").filter(Boolean).pop() || fallback;
  const clean = normalized.replace(/[^a-zA-Z0-9\u0600-\u06FF._-]/g, "_");
  if (!clean || clean === "." || clean === "..") {
    throw new HttpError(400, "نام فایل نامعتبر است.");
  }
  return clean.slice(0, 180);
}

function contentType(name: string): string {
  switch (extension(name)) {
    case "webp": return "image/webp";
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "glb": return "model/gltf-binary";
    case "gltf": return "model/gltf+json";
    case "usdz": return "model/vnd.usdz+zip";
    case "bin": return "application/octet-stream";
    case "ktx2": return "image/ktx2";
    case "basis": return "application/octet-stream";
    case "hdr": return "image/vnd.radiance";
    case "exr": return "image/x-exr";
    default: return "application/octet-stream";
  }
}

async function assertPackageStorageLimit(productId: string, incomingBytes: number): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { sellerId: true },
  });
  if (!product) throw new HttpError(404, "محصول یافت نشد.");

  const now = new Date();
  const sub = await prisma.subscription.findFirst({
    where: {
      sellerId: product.sellerId,
      status: "ACTIVE",
      startDate: { lte: now },
      endDate: { gte: now },
      plan: { is: { isActive: true } },
    },
    include: { plan: true },
    orderBy: { endDate: "desc" },
  });

  const limitMb = sub?.plan.storageLimitMb;
  if (limitMb == null) return;

  const [images, models] = await Promise.all([
    prisma.productImage.aggregate({
      where: { product: { sellerId: product.sellerId } },
      _sum: { sizeBytes: true },
    }),
    prisma.productModel.aggregate({
      where: { product: { sellerId: product.sellerId } },
      _sum: { sizeBytes: true },
    }),
  ]);

  const used = (images._sum.sizeBytes ?? 0) + (models._sum.sizeBytes ?? 0);
  const limit = limitMb * 1024 * 1024;
  if (used + incomingBytes > limit) {
    throw new HttpError(403, `فضای ذخیره‌سازی پلن شما کافی نیست. مصرف فعلی: ${Math.ceil(used / 1048576)}MB، فایل‌های جدید: ${Math.ceil(incomingBytes / 1048576)}MB، سقف پلن: ${limitMb}MB.`);
  }
}

async function optimizeImage(file: Express.Multer.File): Promise<{ name: string; buffer: Buffer; width: number; height: number }> {
  if (!file?.buffer?.length) throw new HttpError(400, "فایل تصویر خالی است.");
  if (file.buffer.length > MAX_IMAGE_BYTES) throw new HttpError(413, "حجم تصویر نباید بیشتر از 10MB باشد.");
  await assertValidImage(file.buffer);
  try {
    const result = await sharp(file.buffer)
      .rotate()
      .webp({ quality: 88, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return {
      name: `${safeName(file.originalname, "image").replace(/\.[^.]+$/, "")}.webp`,
      buffer: result.data,
      width: result.info.width,
      height: result.info.height,
    };
  } catch {
    throw new HttpError(400, "پردازش تصویر ناموفق بود. لطفاً یک تصویر معتبر انتخاب کنید.");
  }
}

function isRootModel(name: string): boolean {
  return MODEL_ROOT_EXTENSIONS.has(extension(name));
}

/**
 * Store every uploaded package member as its own object.
 *
 * GLTF dependencies are kept in the same model folder, preserving relative
 * paths such as scene.gltf -> scene.bin / textures/albedo.png.
 */
export async function upsertProductPackage(params: {
  productId: string;
  images?: Express.Multer.File[];
  models?: Express.Multer.File[];
  ar?: Express.Multer.File[];
}) {
  const allFiles = [...(params.images || []), ...(params.models || []), ...(params.ar || [])];
  if (!allFiles.length) throw new HttpError(400, "هیچ فایل معتبری برای بسته ارسال نشده است.");
  if (allFiles.length > MAX_PACKAGE_FILES) throw new HttpError(400, `حداکثر ${MAX_PACKAGE_FILES} فایل در هر بسته مجاز است.`);

  const preparedImages: Array<{ file: Express.Multer.File; optimized: Awaited<ReturnType<typeof optimizeImage>> }> = [];
  for (const file of params.images || []) {
    preparedImages.push({ file, optimized: await optimizeImage(file) });
  }

  const preparedModels: Express.Multer.File[] = [];
  for (const file of params.models || []) {
    if (!file?.buffer?.length) throw new HttpError(400, "فایل مدل خالی است.");
    if (file.buffer.length > MAX_ASSET_BYTES) throw new HttpError(413, "حجم هر فایل مدل نباید بیشتر از 50MB باشد.");
    const ext = extension(file.originalname);
    if (!MODEL_EXTENSIONS.has(ext) || !isRootModel(file.originalname)) {
      throw new HttpError(400, "فرمت مدل مجاز نیست. GLB، GLTF و USDZ پشتیبانی می‌شوند.");
    }
    await assertValidModel(file.buffer, file.originalname);
    preparedModels.push(file);
  }

  const dependencies = (params.models || []).filter((file) => {
    const ext = extension(file.originalname);
    return MODEL_EXTENSIONS.has(ext) && !isRootModel(file.originalname);
  });
  for (const file of dependencies) {
    if (file.buffer.length > MAX_ASSET_BYTES) throw new HttpError(413, "حجم هر فایل وابسته نباید بیشتر از 50MB باشد.");
  }

  const preparedAr: Express.Multer.File[] = [];
  for (const file of params.ar || []) {
    if (!file?.buffer?.length) throw new HttpError(400, "فایل AR خالی است.");
    if (file.buffer.length > MAX_ASSET_BYTES) throw new HttpError(413, "حجم هر فایل AR نباید بیشتر از 50MB باشد.");
    if (extension(file.originalname) !== "usdz") throw new HttpError(400, "بخش AR فقط USDZ می‌پذیرد.");
    await assertValidModel(file.buffer, file.originalname);
    preparedAr.push(file);
  }

  const incomingBytes = [
    ...preparedImages.map((item) => item.optimized.buffer.length),
    ...preparedModels.map((file) => file.buffer.length),
    ...dependencies.map((file) => file.buffer.length),
    ...preparedAr.map((file) => file.buffer.length),
  ].reduce((sum, bytes) => sum + bytes, 0);

  await assertPackageStorageLimit(params.productId, incomingBytes);

  const createdStorageKeys: string[] = [];
  const createdImageIds: string[] = [];
  const createdModelIds: string[] = [];

  try {
    const imageCount = await prisma.productImage.count({ where: { productId: params.productId } });
    let sortOrder = imageCount;

    for (const { optimized } of preparedImages) {
      const key = `products/${params.productId}/images/${nanoid(16)}-${optimized.name}`;
      const stored = await storage.save({
        folder: `products/${params.productId}/images`,
        filename: optimized.name,
        storageKey: key,
        buffer: optimized.buffer,
        contentType: "image/webp",
      });
      createdStorageKeys.push(stored.storageKey);

      const image = await prisma.productImage.create({
        data: {
          productId: params.productId,
          url: stored.url,
          storageKey: stored.storageKey,
          isPrimary: imageCount === 0 && sortOrder === 0,
          sortOrder,
          width: optimized.width,
          height: optimized.height,
          sizeBytes: stored.sizeBytes,
        },
      });
      createdImageIds.push(image.id);
      sortOrder += 1;
    }

    // Each model/dependency set gets its own folder so GLTF relative URLs work.
    for (const root of preparedModels) {
      const modelFolder = `products/${params.productId}/models/${nanoid(16)}`;
      const rootName = safeName(root.originalname, `model.${extension(root.originalname)}`);

      const rootStored = await storage.save({
        folder: modelFolder,
        filename: rootName,
        storageKey: `${modelFolder}/${rootName}`,
        buffer: root.buffer,
        contentType: contentType(rootName),
      });
      createdStorageKeys.push(rootStored.storageKey);

      // Dependencies are assigned to the model folder. If multiple GLTF roots
      // are uploaded together, the UI should send their dependencies with the
      // matching root folder/name; when that information is unavailable, the
      // files remain available as standalone assets under this product.
      const model = await prisma.productModel.create({
        data: {
          productId: params.productId,
          kind: extension(root.originalname).toUpperCase(),
          url: rootStored.url,
          storageKey: rootStored.storageKey,
          sizeBytes: rootStored.sizeBytes,
        },
      });
      createdModelIds.push(model.id);
    }

    for (const dependency of dependencies) {
      const dependencyFolder = `products/${params.productId}/models/dependencies`;
      const dependencyName = safeName(dependency.originalname, `dependency.${extension(dependency.originalname)}`);
      const key = `${dependencyFolder}/${nanoid(10)}-${dependencyName}`;
      const stored = await storage.save({
        folder: dependencyFolder,
        filename: dependencyName,
        storageKey: key,
        buffer: dependency.buffer,
        contentType: contentType(dependencyName),
      });
      createdStorageKeys.push(stored.storageKey);
    }

    for (const file of preparedAr) {
      const name = safeName(file.originalname, "model.usdz");
      const key = `products/${params.productId}/ar/${nanoid(16)}-${name}`;
      const stored = await storage.save({
        folder: `products/${params.productId}/ar`,
        filename: name,
        storageKey: key,
        buffer: file.buffer,
        contentType: "model/vnd.usdz+zip",
      });
      createdStorageKeys.push(stored.storageKey);

      const model = await prisma.productModel.create({
        data: {
          productId: params.productId,
          kind: "USDZ",
          url: stored.url,
          storageKey: stored.storageKey,
          sizeBytes: stored.sizeBytes,
        },
      });
      createdModelIds.push(model.id);
    }

    const manifest = Buffer.from(JSON.stringify({
      version: 2,
      productId: params.productId,
      assets: createdStorageKeys,
      updatedAt: new Date().toISOString(),
    }), "utf8");
    const manifestKey = `products/${params.productId}/package/manifest-${nanoid(12)}.json`;
    const manifestStored = await storage.save({
      folder: `products/${params.productId}/package`,
      filename: "manifest.json",
      storageKey: manifestKey,
      buffer: manifest,
      contentType: "application/json",
    });
    createdStorageKeys.push(manifestStored.storageKey);

    const current = await prisma.productAssetPackage.findUnique({ where: { productId: params.productId } });
    await prisma.productAssetPackage.upsert({
      where: { productId: params.productId },
      create: { productId: params.productId, storageKey: manifestStored.storageKey, sizeBytes: manifestStored.sizeBytes, version: 1 },
      update: { storageKey: manifestStored.storageKey, sizeBytes: manifestStored.sizeBytes, version: (current?.version || 0) + 1 },
    });

    await prisma.product.update({
      where: { id: params.productId },
      data: { hasUnpublishedChanges: true },
    });

    // Remove the previous package manifest only after the new package is valid.
    if (current?.storageKey && current.storageKey !== manifestStored.storageKey) {
      await storage.delete(current.storageKey).catch(() => undefined);
    }

    return prisma.product.findUnique({
      where: { id: params.productId },
      include: {
        images: { orderBy: { sortOrder: "asc" } },
        models: true,
        assetPackage: true,
      },
    });
  } catch (error) {
    await Promise.all(createdStorageKeys.map((key) => storage.delete(key).catch(() => undefined)));
    if (createdImageIds.length) await prisma.productImage.deleteMany({ where: { id: { in: createdImageIds } } }).catch(() => undefined);
    if (createdModelIds.length) await prisma.productModel.deleteMany({ where: { id: { in: createdModelIds } } }).catch(() => undefined);
    throw error;
  }
}

// Kept only for backwards compatibility with products created by the old ZIP
// package implementation. New assets never use package: storage keys.
export function isPackageStorageKey(value: string): boolean {
  return value.startsWith("package:");
}

export function parsePackageStorageKey(value: string): { productId: string; kind: PackageKind; name: string } | null {
  if (!isPackageStorageKey(value)) return null;
  const parts = value.split(":");
  if (parts.length < 4 || !["images", "models", "ar"].includes(parts[2])) return null;
  return {
    productId: parts[1],
    kind: parts[2] as PackageKind,
    name: decodeURIComponent(parts.slice(3).join(":")),
  };
}

export function packageAssetUrl(productId: string, kind: PackageKind, name: string): string {
  return `/api/public/package/${encodeURIComponent(productId)}/${kind}/${name.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Legacy helper. Old package assets still use the Render proxy until migrated.
 * New package uploads use direct storage URLs and never call this path.
 */
export async function readPackageAsset(productId: string, kind: PackageKind, name: string): Promise<Buffer> {
  const pkg = await prisma.productAssetPackage.findUnique({
    where: { productId },
    select: { storageKey: true },
  });
  if (!pkg || !isPackageStorageKey(pkg.storageKey)) {
    throw new HttpError(404, "بسته قدیمی محصول پیدا نشد.");
  }

  const outer = await unzipper.Open.buffer(await storage.read(pkg.storageKey));
  const innerName = `${kind}.zip`;
  const inner = outer.files.find((file) => file.type === "File" && file.path === innerName);
  if (!inner) throw new HttpError(404, "فایل محصول پیدا نشد.");

  const innerDirectory = await unzipper.Open.buffer(await inner.buffer());
  const target = innerDirectory.files.find((file) => file.type === "File" && file.path === name);
  if (!target) throw new HttpError(404, "فایل محصول پیدا نشد.");
  return target.buffer();
}

export function getPackageContentType(name: string): string {
  return contentType(name);
}

export async function removePackageAsset(_productId: string, _kind: PackageKind, _name: string): Promise<void> {
  // Legacy ZIP packages contain multiple assets in one object. Do not delete
  // the whole ZIP when one legacy DB row is removed; product deletion handles
  // the package object as a whole. New uploads never use this path.
}
