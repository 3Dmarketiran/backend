import rateLimit from "express-rate-limit";
import { env } from "../config/env";

export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تعداد درخواست‌ها بیش از حد مجاز است. لطفاً بعداً تلاش کنید." },
});

// Tighter limiter specifically for the login endpoint to slow brute-force
// attempts, independent of general API traffic from the same client.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "تلاش‌های ورود بیش از حد مجاز. لطفاً بعداً دوباره تلاش کنید." },
});
