"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpError = void 0;
exports.errorHandler = errorHandler;
exports.notFoundHandler = notFoundHandler;
const zod_1 = require("zod");
const logger_1 = require("../utils/logger");
const env_1 = require("../config/env");
const authService_1 = require("../services/authService");
class HttpError extends Error {
    statusCode;
    details;
    constructor(statusCode, message, details) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
    }
}
exports.HttpError = HttpError;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function errorHandler(err, req, res, _next) {
    // Log full detail server-side always.
    logger_1.logger.error({ err, path: req.path, method: req.method }, "request error");
    if (err instanceof zod_1.ZodError) {
        return res.status(400).json({
            error: "ورودی نامعتبر است.",
            details: err.flatten().fieldErrors,
        });
    }
    if (err instanceof authService_1.AuthError) {
        return res.status(err.statusCode).json({ error: err.message });
    }
    if (err instanceof HttpError) {
        return res.status(err.statusCode).json({ error: err.message, details: err.details });
    }
    // Unknown error: never leak stack traces or internals to the client,
    // especially in production.
    const message = "خطای داخلی سرور رخ داد.";
    res.status(500).json({
        error: message,
        ...(env_1.isProduction ? {} : { debug: err instanceof Error ? err.message : String(err) }),
    });
}
function notFoundHandler(_req, res) {
    res.status(404).json({ error: "مسیر یافت نشد." });
}
//# sourceMappingURL=errorHandler.js.map