import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import { fromBuffer } from "file-type";
import { HttpError } from "../middleware/errorHandler";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_MODEL_BYTES = 100 * 1024 * 1024; // 100MB
const MAX_ZIP_BYTES = 150 * 1024 * 1024; // 150MB
const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5MB

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

// ---------------------------------------------------------------------
// Multer upload handlers
// ---------------------------------------------------------------------

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

// Logo upload middleware.
//
// This is intentionally wrapped instead of exporting multer().single()
// directly so Multer errors and the actual image validation are handled
// before the request reaches the seller route.
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_LOGO_BYTES,
  },
}).single("logo");

export const uploadLogo = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  logoUpload(req, res, async (err: unknown) => {
    if (err) {
      if (
        err instanceof multer.MulterError &&
        err.code === "LIMIT_FILE_SIZE"
      ) {
        return next(
          new HttpError(
            413,
            "حجم لوگو نباید بیشتر از ۵ مگابایت باشد."
          )
        );
      }

      if (err instanceof multer.MulterError) {
        return next(
          new HttpError(
            400,
            "آپلود لوگو نامعتبر است."
          )
        );
      }

      return next(err);
    }

    if (!req.file) {
      return next(
        new HttpError(
          400,
          "فایل لوگو ارسال نشده است."
        )
      );
    }

    try {
      await assertValidLogo(req.file.buffer);
      next();
    } catch (validationError) {
      next(validationError);
    }
  });
};

// ---------------------------------------------------------------------
// Image validation
// ---------------------------------------------------------------------

export async function assertValidImage(
  buffer: Buffer
): Promise<void> {
  if (!buffer || buffer.length === 0) {
    throw new HttpError(
      400,
      "فایل تصویر خالی است."
    );
  }

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

// ---------------------------------------------------------------------
// Logo validation
// ---------------------------------------------------------------------

export async function assertValidLogo(
  buffer: Buffer
): Promise<void> {
  await assertValidImage(buffer);
}

// ---------------------------------------------------------------------
// 3D / AR model validation
// ---------------------------------------------------------------------

export async function assertValidModel(
  buffer: Buffer,
  originalFilename: string
): Promise<string> {
  const ext = (
    originalFilename
      .split(".")
      .pop() ?? ""
  ).toLowerCase();

  if (
    !ALLOWED_MODEL_EXTENSIONS.has(ext)
  ) {
    throw new HttpError(
      400,
      "فرمت فایل سه‌بعدی مجاز نیست. فقط GLB، GLTF و USDZ پذیرفته می‌شود."
    );
  }

  // ---------------------------------------------------------------
  // GLB
  // ---------------------------------------------------------------

  if (ext === "glb") {
    if (buffer.length < 12) {
      throw new HttpError(
        400,
        "فایل GLB ناقص یا نامعتبر است."
      );
    }

    const magic =
      buffer
        .subarray(0, 4)
        .toString("ascii");

    if (magic !== "glTF") {
      throw new HttpError(
        400,
        "فایل GLB نامعتبر است (امضای فایل مطابقت ندارد)."
      );
    }

    const version =
      buffer.readUInt32LE(4);

    const declaredLength =
      buffer.readUInt32LE(8);

    if (version !== 2) {
      throw new HttpError(
        400,
        "فقط GLB نسخه 2 پشتیبانی می‌شود."
      );
    }

    if (
      declaredLength !==
      buffer.length
    ) {
      throw new HttpError(
        400,
        "طول فایل GLB با محتوای واقعی آن مطابقت ندارد."
      );
    }
  }

  // ---------------------------------------------------------------
  // GLTF
  // ---------------------------------------------------------------

  else if (ext === "gltf") {
    try {
      const parsed = JSON.parse(
        buffer.toString("utf-8")
      );

      if (
        !parsed ||
        typeof parsed !== "object" ||
        !parsed.asset ||
        !parsed.asset.version
      ) {
        throw new Error(
          "missing asset.version"
        );
      }
    } catch {
      throw new HttpError(
        400,
        "فایل GLTF نامعتبر است."
      );
    }
  }

  // ---------------------------------------------------------------
  // USDZ
  // ---------------------------------------------------------------

  else if (ext === "usdz") {
    if (buffer.length < 4) {
      throw new HttpError(
        400,
        "فایل USDZ ناقص است."
      );
    }

    const isZip =
      (
        buffer[0] === 0x50 &&
        buffer[1] === 0x4b &&
        buffer[2] === 0x03 &&
        buffer[3] === 0x04
      ) ||
      (
        buffer[0] === 0x50 &&
        buffer[1] === 0x4b &&
        buffer[2] === 0x05 &&
        buffer[3] === 0x06
      ) ||
      (
        buffer[0] === 0x50 &&
        buffer[1] === 0x4b &&
        buffer[2] === 0x07 &&
        buffer[3] === 0x08
      );

    if (!isZip) {
      throw new HttpError(
        400,
        "فایل USDZ نامعتبر است (ساختار ZIP پیدا نشد)."
      );
    }
  }

  return ext.toUpperCase();
}

// ---------------------------------------------------------------------
// ZIP validation
// ---------------------------------------------------------------------

export function assertValidZip(
  buffer: Buffer
): void {
  if (!buffer.length) {
    throw new HttpError(
      400,
      "فایل ZIP خالی است."
    );
  }

  if (buffer.length < 4) {
    throw new HttpError(
      400,
      "فایل ZIP نامعتبر است."
    );
  }

  const isZip =
    (
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04
    ) ||
    (
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x05 &&
      buffer[3] === 0x06
    ) ||
    (
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x07 &&
      buffer[3] === 0x08
    );

  if (!isZip) {
    throw new HttpError(
      400,
      "فایل ZIP نامعتبر است."
    );
  }
}

// ---------------------------------------------------------------------
// Exported limits
// ---------------------------------------------------------------------

export const uploadLimits = {
  image: MAX_IMAGE_BYTES,
  model: MAX_MODEL_BYTES,
  zip: MAX_ZIP_BYTES,
  logo: MAX_LOGO_BYTES,
};
