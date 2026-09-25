"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storage = void 0;
const LocalStorageProvider_1 = require("./LocalStorageProvider");
const S3StorageProvider_1 = require("./S3StorageProvider");
const env_1 = require("../config/env");
/**
 * Single point of truth for which storage backend the app uses.
 * Every other file imports `storage` from here — never instantiate a
 * provider directly elsewhere. This is what makes storage swappable
 * (spec section 5) without touching route/service code.
 */
exports.storage = env_1.env.STORAGE_PROVIDER === "s3" ? new S3StorageProvider_1.S3StorageProvider() : new LocalStorageProvider_1.LocalStorageProvider();
//# sourceMappingURL=index.js.map