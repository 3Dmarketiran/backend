"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginRateLimiter = exports.apiRateLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const env_1 = require("../config/env");
exports.apiRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: env_1.env.RATE_LIMIT_WINDOW_MS,
    max: env_1.env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "تعداد درخواست‌ها بیش از حد مجاز است. لطفاً بعداً تلاش کنید." },
});
// Tighter limiter specifically for the login endpoint to slow brute-force
// attempts, independent of general API traffic from the same client.
exports.loginRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: env_1.env.LOGIN_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: "تلاش‌های ورود بیش از حد مجاز. لطفاً بعداً دوباره تلاش کنید." },
});
//# sourceMappingURL=rateLimit.js.map