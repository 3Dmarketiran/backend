"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalStorageProvider = void 0;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const nanoid_1 = require("nanoid");
const env_1 = require("../config/env");
const UPLOAD_ROOT = node_path_1.default.resolve(process.cwd(), "uploads");
/**
 * Development-friendly storage provider that writes to local disk and
 * serves files back via the backend's own static file route
 * (see index.ts: app.use("/files", ...)).
 *
 * NOT suitable for production behind multiple server instances or for
 * assets that must remain reachable from the public static GitHub Pages
 * site independently of this backend staying online — use S3Storage for
 * that (see storage/S3Storage.ts).
 */
class LocalStorageProvider {
    async save(params) {
        const safeExt = node_path_1.default.extname(params.filename).toLowerCase().replace(/[^a-z0-9.]/g, "");
        const safeName = `${(0, nanoid_1.nanoid)(16)}${safeExt}`;
        const relDir = sanitizeFolder(params.folder);
        const absDir = node_path_1.default.join(UPLOAD_ROOT, relDir);
        await promises_1.default.mkdir(absDir, { recursive: true });
        const storageKey = node_path_1.default.posix.join(relDir, safeName);
        const absPath = node_path_1.default.join(UPLOAD_ROOT, storageKey);
        // Defense-in-depth: verify the resolved path is still inside UPLOAD_ROOT
        // even though sanitizeFolder() already strips traversal sequences.
        if (!absPath.startsWith(UPLOAD_ROOT)) {
            throw new Error("Invalid storage path (path traversal attempt blocked).");
        }
        await promises_1.default.writeFile(absPath, params.buffer);
        return {
            storageKey,
            url: `${env_1.env.API_URL ?? "http://localhost:" + env_1.env.PORT}/files/${storageKey}`,
            sizeBytes: params.buffer.byteLength,
        };
    }
    async delete(storageKey) {
        const absPath = node_path_1.default.join(UPLOAD_ROOT, sanitizeFolder(storageKey));
        if (!absPath.startsWith(UPLOAD_ROOT))
            return;
        await promises_1.default.rm(absPath, { force: true });
    }
    async getUrl(storageKey) {
        return `${env_1.env.API_URL ?? "http://localhost:" + env_1.env.PORT}/files/${storageKey}`;
    }
    async read(storageKey) {
        const absPath = node_path_1.default.join(UPLOAD_ROOT, sanitizeFolder(storageKey));
        if (!absPath.startsWith(UPLOAD_ROOT)) {
            throw new Error("Invalid storage path (path traversal attempt blocked).");
        }
        return promises_1.default.readFile(absPath);
    }
    async healthCheck() {
        try {
            await promises_1.default.mkdir(UPLOAD_ROOT, { recursive: true });
            await promises_1.default.access(UPLOAD_ROOT);
            return { ok: true };
        }
        catch (err) {
            return { ok: false, message: err instanceof Error ? err.message : "unknown error" };
        }
    }
}
exports.LocalStorageProvider = LocalStorageProvider;
/** Strips path traversal sequences and leading slashes from a folder/key. */
function sanitizeFolder(input) {
    return input
        .split("/")
        .filter((seg) => seg !== "" && seg !== "." && seg !== "..")
        .join("/");
}
//# sourceMappingURL=LocalStorageProvider.js.map