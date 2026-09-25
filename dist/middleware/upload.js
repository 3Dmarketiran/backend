"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadModel = exports.uploadImage = void 0;
exports.assertValidImage = assertValidImage;
exports.assertValidModel = assertValidModel;
const multer_1 = __importDefault(require("multer"));
const file_type_1 = require("file-type");
const errorHandler_1 = require("../middleware/errorHandler");
// Multer buffers files in memory (not disk) so the StorageProvider is the
// only thing that ever writes to a persistent location — no orphaned temp
// files, and it works identically for local and S3 providers.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_MODEL_BYTES = 100 * 1024 * 1024; // 100MB (GLB/USDZ can be large)
exports.uploadImage = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES },
}).single("image");
exports.uploadModel = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: MAX_MODEL_BYTES },
}).single("model");
const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
// GLB has a reliable magic number (glTF binary header "glTF"); GLTF is JSON
// text (no binary signature) so we fall back to extension + content
// inspection for it. USDZ is a ZIP container.
const ALLOWED_MODEL_EXTENSIONS = new Set(["glb", "gltf", "usdz"]);
/**
 * Validates an uploaded image by inspecting its actual file signature
 * (magic bytes), NOT the filename extension or the client-supplied
 * Content-Type header — both of which are trivially spoofable.
 */
async function assertValidImage(buffer) {
    const type = await (0, file_type_1.fromBuffer)(buffer);
    if (!type || !ALLOWED_IMAGE_MIME.has(type.mime)) {
        throw new errorHandler_1.HttpError(400, "فرمت تصویر مجاز نیست. فقط JPG، PNG و WEBP پذیرفته می‌شود.");
    }
}
/**
 * Validates an uploaded 3D/AR model file. GLB has a binary magic number we
 * check directly; GLTF/USDZ are validated by structural sniffing since they
 * don't have a single universal magic-byte signature recognized by
 * file-type for our purposes.
 */
async function assertValidModel(buffer, originalFilename) {
    const ext = (originalFilename.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED_MODEL_EXTENSIONS.has(ext)) {
        throw new errorHandler_1.HttpError(400, "فرمت فایل سه‌بعدی مجاز نیست. فقط GLB، GLTF و USDZ پذیرفته می‌شود.");
    }
    if (ext === "glb") {
        // glTF binary spec: first 4 bytes must be ASCII "glTF" (0x676c5446).
        const magic = buffer.subarray(0, 4).toString("ascii");
        if (magic !== "glTF") {
            throw new errorHandler_1.HttpError(400, "فایل GLB نامعتبر است (امضای فایل مطابقت ندارد).");
        }
    }
    else if (ext === "gltf") {
        // .gltf is JSON — verify it actually parses as JSON with expected keys,
        // rather than trusting the extension alone.
        try {
            const parsed = JSON.parse(buffer.toString("utf-8"));
            if (!parsed.asset || !parsed.asset.version) {
                throw new Error("missing asset.version");
            }
        }
        catch {
            throw new errorHandler_1.HttpError(400, "فایل GLTF نامعتبر است.");
        }
    }
    else if (ext === "usdz") {
        // USDZ is a (typically uncompressed) ZIP container — verify the ZIP
        // local-file-header magic number (PK\x03\x04).
        const magic = buffer.subarray(0, 4);
        if (!(magic[0] === 0x50 && magic[1] === 0x4b && magic[2] === 0x03 && magic[3] === 0x04)) {
            throw new errorHandler_1.HttpError(400, "فایل USDZ نامعتبر است (امضای فایل مطابقت ندارد).");
        }
    }
    return ext.toUpperCase();
}
//# sourceMappingURL=upload.js.map