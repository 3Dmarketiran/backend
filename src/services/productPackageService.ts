import unzipper from "unzipper";
import { nanoid } from "nanoid";
import { prisma } from "../config/prisma";
import { storage } from "../storage";
import { HttpError } from "../middleware/errorHandler";
import { assertValidImage, assertValidModel } from "../middleware/upload";
import sharp from "sharp";

const MAX_PACKAGE_BYTES = 150 * 1024 * 1024;
const MAX_FILES_PER_PACKAGE = 50;
const MAX_TOTAL_EXTRACTED_BYTES = 300 * 1024 * 1024;
const MAX_SINGLE_FILE_BYTES = 100 * 1024 * 1024;
const CACHE_MAX_BYTES = 128 * 1024 * 1024;

const MODEL_EXTENSIONS = new Set(["glb", "gltf", "bin", "png", "jpg", "jpeg", "webp", "ktx2", "basis", "hdr", "exr", "bmp", "tga", "gif"]);
const cache = new Map<string, { buffer: Buffer; touchedAt: number }>();
let cacheBytes = 0;

type PackageKind = "images" | "models" | "ar";

type Entry = { name: string; buffer: Buffer };

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(entries: Entry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, "/"), "utf8");
    const data = entry.buffer;
    const crc = crc32(data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    locals.push(Buffer.concat([local, data]));

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length + data.length;
  }

  const centralDir = Buffer.concat(centrals);
  const body = Buffer.concat(locals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(body.length, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([body, centralDir, end]);
}

function safeName(name: string, fallback: string): string {
  const normalized = name.replace(/\\/g, "/").split("/").filter(Boolean).pop() || fallback;
  const clean = normalized.replace(/[^a-zA-Z0-9\u0600-\u06FF._-]/g, "_");
  if (!clean || clean === "." || clean === "..") throw new HttpError(400, "نام فایل نامعتبر است.");
  return clean.slice(0, 180);
}

async function readZipEntries(buffer: Buffer): Promise<Entry[]> {
  const dir = await unzipper.Open.buffer(buffer);
  if (dir.files.length > MAX_FILES_PER_PACKAGE) throw new HttpError(400, "تعداد فایل‌های بسته بیش از حد مجاز است.");
  const result: Entry[] = [];
  let total = 0;
  for (const file of dir.files) {
    if (file.type !== "File") continue;
    const name = safeName(file.path, `file-${result.length}`);
    const declared = Number(file.uncompressedSize || 0);
    if (declared > MAX_SINGLE_FILE_BYTES) throw new HttpError(400, "یکی از فایل‌های بسته بیش از حد مجاز است.");
    const data = await file.buffer();
    total += data.length;
    if (data.length > MAX_SINGLE_FILE_BYTES || total > MAX_TOTAL_EXTRACTED_BYTES) throw new HttpError(400, "حجم استخراج‌شده بسته بیش از حد مجاز است.");
    result.push({ name, buffer: data });
  }
  return result;
}

async function readOuterPackage(key: string): Promise<Record<PackageKind, Entry[]>> {
  const outer = await readZipEntries(await storage.read(key));
  const result: Record<PackageKind, Entry[]> = { images: [], models: [], ar: [] };
  for (const item of outer) {
    if (!item.name.endsWith(".zip")) continue;
    const kind = item.name.slice(0, -4) as PackageKind;
    if (kind === "images" || kind === "models" || kind === "ar") result[kind] = await readZipEntries(item.buffer);
  }
  return result;
}

async function optimizeImage(file: Express.Multer.File): Promise<Entry> {
  if (file.buffer.length > 10 * 1024 * 1024) throw new HttpError(413, "حجم تصویر نباید بیشتر از 10MB باشد.");
  await assertValidImage(file.buffer);
  const converted = await sharp(file.buffer).rotate().webp({ quality: 88, effort: 4 }).toBuffer();
  return { name: `${safeName(file.originalname, "image").replace(/\.[^.]+$/, "")}.webp`, buffer: converted };
}

function extension(name: string): string { return name.split(".").pop()?.toLowerCase() || ""; }

function upsertEntry(entries: Entry[], incoming: Entry): Entry[] {
  const index = entries.findIndex((e) => e.name.toLowerCase() === incoming.name.toLowerCase());
  if (index >= 0) entries[index] = incoming;
  else entries.push(incoming);
  return entries;
}

function uniqueName(entries: Entry[], name: string): string {
  if (!entries.some((e) => e.name.toLowerCase() === name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 2;
  while (entries.some((e) => e.name.toLowerCase() === `${base}-${i}${ext}`.toLowerCase())) i += 1;
  return `${base}-${i}${ext}`;
}

async function assertPackageStorageLimit(productId: string, newPackageBytes: number): Promise<void> {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { sellerId: true } });
  if (!product) throw new HttpError(404, "محصول یافت نشد.");
  const sub = await prisma.subscription.findFirst({
    where: { sellerId: product.sellerId, status: "ACTIVE", startDate: { lte: new Date() }, endDate: { gte: new Date() }, plan: { is: { isActive: true } } },
    include: { plan: true }, orderBy: { endDate: "desc" },
  });
  if (!sub?.plan.storageLimitMb) return;
  const [packages, legacyImages, legacyModels] = await Promise.all([
    prisma.productAssetPackage.aggregate({ where: { product: { sellerId: product.sellerId } }, _sum: { sizeBytes: true } }),
    prisma.productImage.aggregate({ where: { product: { sellerId: product.sellerId }, storageKey: { not: { startsWith: "package:" } } }, _sum: { sizeBytes: true } }),
    prisma.productModel.aggregate({ where: { product: { sellerId: product.sellerId }, storageKey: { not: { startsWith: "package:" } } }, _sum: { sizeBytes: true } }),
  ]);
  const currentPackage = await prisma.productAssetPackage.findUnique({ where: { productId }, select: { sizeBytes: true } });
  const used = (packages._sum.sizeBytes || 0) - (currentPackage?.sizeBytes || 0) + (legacyImages._sum.sizeBytes || 0) + (legacyModels._sum.sizeBytes || 0) + newPackageBytes;
  const limit = sub.plan.storageLimitMb * 1024 * 1024;
  if (used > limit) throw new HttpError(403, `فضای ذخیره‌سازی پلن شما کافی نیست. سقف پلن: ${sub.plan.storageLimitMb}MB.`);
}

function packageKey(productId: string, kind: PackageKind, name: string): string {
  return `package:${productId}:${kind}:${encodeURIComponent(name)}`;
}

export function isPackageStorageKey(value: string): boolean { return value.startsWith("package:"); }

export function parsePackageStorageKey(value: string): { productId: string; kind: PackageKind; name: string } | null {
  if (!isPackageStorageKey(value)) return null;
  const parts = value.split(":");
  if (parts.length < 4 || !["images", "models", "ar"].includes(parts[2])) return null;
  return { productId: parts[1], kind: parts[2] as PackageKind, name: decodeURIComponent(parts.slice(3).join(":")) };
}

export function packageAssetUrl(productId: string, kind: PackageKind, name: string): string {
  return `/api/public/package/${encodeURIComponent(productId)}/${kind}/${name.split("/").map(encodeURIComponent).join("/")}`;
}

export async function upsertProductPackage(params: {
  productId: string;
  images?: Express.Multer.File[];
  models?: Express.Multer.File[];
  ar?: Express.Multer.File[];
}) {
  const existing = await prisma.productAssetPackage.findUnique({ where: { productId: params.productId } });
  const groups = existing ? await readOuterPackage(existing.storageKey) : { images: [], models: [], ar: [] };

  for (const file of params.images || []) {
    const entry = await optimizeImage(file);
    entry.name = uniqueName(groups.images, entry.name);
    groups.images = upsertEntry(groups.images, entry);
  }

  for (const file of params.models || []) {
    const ext = extension(file.originalname);
    if (file.buffer.length > 100 * 1024 * 1024) throw new HttpError(413, "حجم فایل مدل نباید بیشتر از 100MB باشد.");
    if (!MODEL_EXTENSIONS.has(ext)) throw new HttpError(400, "فایل مدل نامعتبر است.");
    await assertValidModel(file.buffer, file.originalname);
    const entry = { name: safeName(file.originalname, `model.${ext}`), buffer: file.buffer };
    entry.name = uniqueName(groups.models, entry.name);
    groups.models = upsertEntry(groups.models, entry);
  }

  for (const file of params.ar || []) {
    if (file.buffer.length > 100 * 1024 * 1024) throw new HttpError(413, "حجم فایل AR نباید بیشتر از 100MB باشد.");
    await assertValidModel(file.buffer, file.originalname);
    if (extension(file.originalname) !== "usdz") throw new HttpError(400, "بخش AR فقط USDZ می‌پذیرد.");
    const entry = { name: uniqueName(groups.ar, safeName(file.originalname, "model.usdz")), buffer: file.buffer };
    groups.ar = upsertEntry(groups.ar, entry);
  }

  if (!groups.images.length && !groups.models.length && !groups.ar.length) throw new HttpError(400, "هیچ فایل معتبری برای بسته ارسال نشده است.");

  const manifest = Buffer.from(JSON.stringify({ version: 1, productId: params.productId, updatedAt: new Date().toISOString(), groups: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.map((e) => ({ name: e.name, sizeBytes: e.buffer.length }))])) }), "utf8");
  const outer = zipStore([
    { name: "images.zip", buffer: zipStore(groups.images) },
    { name: "models.zip", buffer: zipStore(groups.models) },
    { name: "ar.zip", buffer: zipStore(groups.ar) },
    { name: "manifest.json", buffer: manifest },
  ]);
  if (outer.length > MAX_PACKAGE_BYTES) throw new HttpError(413, "بسته نهایی محصول بیش از 150MB است.");
  await assertPackageStorageLimit(params.productId, outer.length);

  const key = `products/${params.productId}/package/${nanoid(12)}.zip`;
  const stored = await storage.save({ folder: `products/${params.productId}/package`, filename: "product.zip", storageKey: key, buffer: outer, contentType: "application/zip" });

  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.productAssetPackage.findUnique({ where: { productId: params.productId } });
      const version = (current?.version || 0) + 1;
      await tx.productAssetPackage.upsert({ where: { productId: params.productId }, create: { productId: params.productId, storageKey: stored.storageKey, sizeBytes: stored.sizeBytes, version }, update: { storageKey: stored.storageKey, sizeBytes: stored.sizeBytes, version } });

      if (params.images?.length) {
        for (const original of params.images) {
          const converted = await optimizeImage(original);
          const base = `${safeName(original.originalname, "image").replace(/\.[^.]+$/, "")}.webp`;
          const name = groups.images.find((e) => e.buffer.equals(converted.buffer))?.name || base;
          const exists = await tx.productImage.findFirst({ where: { productId: params.productId, storageKey: packageKey(params.productId, "images", name) } });
          if (!exists) await tx.productImage.create({ data: { productId: params.productId, url: packageAssetUrl(params.productId, "images", name), storageKey: packageKey(params.productId, "images", name), isPrimary: (await tx.productImage.count({ where: { productId: params.productId } })) === 0, sortOrder: await tx.productImage.count({ where: { productId: params.productId } }), sizeBytes: converted.length } });
        }
      }

      for (const file of [...(params.models || []), ...(params.ar || [])]) {
        const ext = extension(file.originalname);
        const kind = ext === "usdz" ? "USDZ" : ext === "gltf" ? "GLTF" : ext === "glb" ? "GLB" : null;
        if (!kind) continue;
        const originalName = safeName(file.originalname, `model.${ext}`);
        const storageKind: PackageKind = kind === "USDZ" ? "ar" : "models";
        const name = groups[storageKind].find((entry) => entry.buffer.equals(file.buffer))?.name || originalName;
        const keyRef = packageKey(params.productId, storageKind, name);
        const exists = await tx.productModel.findFirst({ where: { productId: params.productId, storageKey: keyRef } });
        if (!exists) await tx.productModel.create({ data: { productId: params.productId, kind, url: packageAssetUrl(params.productId, storageKind, name), storageKey: keyRef, sizeBytes: file.buffer.length } });
      }

      await tx.product.update({ where: { id: params.productId }, data: { hasUnpublishedChanges: true } });
    });
  } catch (error) {
    await storage.delete(stored.storageKey).catch(() => undefined);
    throw error;
  }

  if (existing?.storageKey && existing.storageKey !== stored.storageKey) await storage.delete(existing.storageKey).catch(() => undefined);
  cache.clear(); cacheBytes = 0;
  return prisma.product.findUnique({ where: { id: params.productId }, include: { images: { orderBy: { sortOrder: "asc" } }, models: true, assetPackage: true } });
}

export async function removePackageAsset(productId: string, kind: PackageKind, name: string): Promise<void> {
  const pkg = await prisma.productAssetPackage.findUnique({ where: { productId } });
  if (!pkg) return;
  const groups = await readOuterPackage(pkg.storageKey);
  groups[kind] = groups[kind].filter((entry) => entry.name !== name);
  const outer = zipStore([
    { name: "images.zip", buffer: zipStore(groups.images) },
    { name: "models.zip", buffer: zipStore(groups.models) },
    { name: "ar.zip", buffer: zipStore(groups.ar) },
    { name: "manifest.json", buffer: Buffer.from(JSON.stringify({ version: pkg.version + 1, productId, updatedAt: new Date().toISOString() }), "utf8") },
  ]);
  const key = `products/${productId}/package/${nanoid(12)}.zip`;
  const stored = await storage.save({ folder: `products/${productId}/package`, filename: "product.zip", storageKey: key, buffer: outer, contentType: "application/zip" });
  await prisma.productAssetPackage.update({ where: { productId }, data: { storageKey: stored.storageKey, sizeBytes: stored.sizeBytes, version: pkg.version + 1 } });
  await storage.delete(pkg.storageKey).catch(() => undefined);
  cache.clear(); cacheBytes = 0;
}

export async function readPackageAsset(productId: string, kind: PackageKind, name: string): Promise<Buffer> {
  const pkg = await prisma.productAssetPackage.findUnique({ where: { productId }, select: { storageKey: true, version: true } });
  if (!pkg) throw new HttpError(404, "بسته فایل محصول پیدا نشد.");
  const cacheKey = `${productId}:${pkg.version}:${kind}:${name}`;
  const cached = cache.get(cacheKey);
  if (cached) { cached.touchedAt = Date.now(); return cached.buffer; }
  const groups = await readOuterPackage(pkg.storageKey);
  const entry = groups[kind].find((item) => item.name === name);
  if (!entry) throw new HttpError(404, "فایل محصول پیدا نشد.");
  cache.set(cacheKey, { buffer: entry.buffer, touchedAt: Date.now() });
  cacheBytes += entry.buffer.length;
  while (cacheBytes > CACHE_MAX_BYTES && cache.size) {
    let oldestKey: string | null = null; let oldest = Infinity;
    for (const [k, v] of cache) if (v.touchedAt < oldest) { oldest = v.touchedAt; oldestKey = k; }
    if (!oldestKey) break;
    cacheBytes -= cache.get(oldestKey)!.buffer.length; cache.delete(oldestKey);
  }
  return entry.buffer;
}

export function getPackageContentType(name: string): string {
  const ext = extension(name);
  if (ext === "webp") return "image/webp";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "glb") return "model/gltf-binary";
  if (ext === "gltf") return "model/gltf+json";
  if (ext === "usdz") return "model/vnd.usdz+zip";
  if (ext === "bin") return "application/octet-stream";
  return "application/octet-stream";
}
