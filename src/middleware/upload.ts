import multer from "multer";
import { fromBuffer } from "file-type";
import { HttpError } from "../middleware/errorHandler";

// ============================================================
// Upload limits
// ============================================================

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_MODEL_BYTES = 100 * 1024 * 1024; // 100MB
const MAX_ZIP_BYTES = 150 * 1024 * 1024; // 150MB
const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5MB

// ============================================================
// Allowed formats
// ============================================================

const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const ALLOWED_MODEL_EXTENSIONS = new Set([
  "glb",
  "gltf",
  "usdz",
]);

// ============================================================
// Multer upload handlers
//
// memoryStorage is intentional.
// Files are kept in memory and then passed directly to the
// configured StorageProvider (Local / S3 / Supabase-compatible).
// ============================================================

export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
  },
}).single("image");

export const uploadModel = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_MODEL_BYTES,
  },
}).single("model");

export const uploadModelZip = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_ZIP_BYTES,
  },
}).single("modelZip");

export const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_LOGO_BYTES,
  },
}).single("logo");

// ============================================================
// Image validation
// ============================================================

/**
 * Validate image using the actual file signature.
 *
 * Never trust:
 * - filename extension
 * - client supplied Content-Type
 *
 * Supported:
 * - JPEG
 * - PNG
 * - WEBP
 */
export async function assertValidImage(
  buffer: Buffer
): Promise<void> {
  const type = await fromBuffer(buffer);

  if (
    !type ||
    !ALLOWED_IMAGE_MIME.has(type.mime)
  ) {
    throw new HttpError(
      400,
      "فرمت تصویر مجاز نیست. فقط JPG، PNG و WEBP پذیرفته می‌شود."
    );
  }
}

// ============================================================
// 3D / AR model validation
// ============================================================

/**
 * Validate GLB / GLTF / USDZ.
 *
 * Returns the normalized uppercase format:
 * GLB / GLTF / USDZ
 */
export async function assertValidModel(
  buffer: Buffer,
  originalFilename: string
): Promise<string> {
  const extension =
    originalFilename
      .split(".")
      .pop()
      ?.toLowerCase() ?? "";

  if (
    !ALLOWED_MODEL_EXTENSIONS.has(
      extension
    )
  ) {
    throw new HttpError(
      400,
      "فرمت فایل سه‌بعدی مجاز نیست. فقط GLB، GLTF و USDZ پذیرفته می‌شود."
    );
  }

  // ----------------------------------------------------------
  // GLB
  // ----------------------------------------------------------

  if (extension === "glb") {
    // glTF binary magic:
    // ASCII "glTF"
    const magic =
      buffer
        .subarray(0, 4)
        .toString("ascii");

    if (magic !== "glTF") {
      throw new HttpError(
        400,
        "فایل GLB نامعتبر است."
      );
    }

    return "GLB";
  }

  // ----------------------------------------------------------
  // GLTF
  // ----------------------------------------------------------

  if (extension === "gltf") {
    try {
      const parsed =
        JSON.parse(
          buffer.toString("utf-8")
        );

      if (
        !parsed ||
        typeof parsed !== "object" ||
        !parsed.asset ||
        !parsed.asset.version
      ) {
        throw new Error(
          "Invalid GLTF structure"
        );
      }
    } catch {
      throw new HttpError(
        400,
        "فایل GLTF نامعتبر است."
      );
    }

    return "GLTF";
  }

  // ----------------------------------------------------------
  // USDZ
  // ----------------------------------------------------------

  if (extension === "usdz") {
    /*
     * USDZ is based on a ZIP container.
     *
     * Check the ZIP local-file-header signature:
     * PK\x03\x04
     */
    const magic =
      buffer.subarray(0, 4);

    const isZip =
      magic.length >= 4 &&
      magic[0] === 0x50 &&
      magic[1] === 0x4b &&
      magic[2] === 0x03 &&
      magic[3] === 0x04;

    if (!isZip) {
      throw new HttpError(
        400,
        "فایل USDZ نامعتبر است."
      );
    }

    return "USDZ";
  }

  throw new HttpError(
    400,
    "فرمت فایل سه‌بعدی مجاز نیست."
  );
}

// ============================================================
// ZIP validation helpers
// ============================================================

/**
 * ZIP uploads are handled separately from normal model uploads.
 *
 * The actual secure extraction is implemented in assetService.ts.
 * This helper only validates the uploaded ZIP itself.
 */
export function assertValidZip(
  buffer: Buffer
): void {
  if (!buffer || buffer.length < 4) {
    throw new HttpError(
      400,
      "فایل ZIP نامعتبر است."
    );
  }

  const magic =
    buffer.subarray(0, 4);

  const isZip =
    magic[0] === 0x50 &&
    magic[1] === 0x4b &&
    (
      (
        magic[2] === 0x03 &&
        magic[3] === 0x04
      ) ||
      (
        magic[2] === 0x05 &&
        magic[3] === 0x06
      ) ||
      (
        magic[2] === 0x07 &&
        magic[3] === 0x08
      )
    );

  if (!isZip) {
    throw new HttpError(
      400,
      "فایل ZIP نامعتبر است."
    );
  }
}

// ============================================================
// Utility constants
// ============================================================

export const uploadLimits = {
  image: MAX_IMAGE_BYTES,
  model: MAX_MODEL_BYTES,
  zip: MAX_ZIP_BYTES,
  logo: MAX_LOGO_BYTES,
};
