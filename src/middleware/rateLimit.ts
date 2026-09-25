import rateLimit, {
  type Options,
  type RateLimitRequestHandler,
} from "express-rate-limit";
import { env, isProduction } from "../config/env";

const standardMessage = {
  success: false,
  error: "TOO_MANY_REQUESTS",
  message:
    "تعداد درخواست‌ها بیش از حد مجاز است. لطفاً کمی بعد دوباره تلاش کنید.",
};

const loginMessage = {
  success: false,
  error: "TOO_MANY_LOGIN_ATTEMPTS",
  message:
    "تعداد تلاش‌های ورود بیش از حد مجاز است. لطفاً کمی بعد دوباره تلاش کنید.",
};

const createLimiter = (
  options: Partial<Options>,
): RateLimitRequestHandler => {
  return rateLimit({
    standardHeaders: "draft-7",
    legacyHeaders: false,

    handler: (_req, res) => {
      res.status(429).json(standardMessage);
    },

    ...options,
  });
};

/**
 * General API rate limiter.
 *
 * This limiter is intentionally moderate because it is applied
 * to the whole /api surface.
 */
export const apiRateLimiter = createLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,

  skip: (req) => {
    // Health checks should remain lightweight and available.
    return req.path === "/health";
  },
});

/**
 * Strict limiter for authentication endpoints.
 *
 * In production the configured limit is enforced.
 * In development we keep the same limiter enabled so that
 * local behavior remains close to production.
 */
export const loginRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,

  limit: env.LOGIN_RATE_LIMIT_MAX,

  standardHeaders: "draft-7",
  legacyHeaders: false,

  handler: (_req, res) => {
    res.status(429).json(loginMessage);
  },

  // Do not count successful login attempts against the limiter.
  skipSuccessfulRequests: true,

  // Keep this explicit so the behavior is predictable in
  // both development and production.
  skip: () => false,

  // Disable the limiter entirely only for automated tests.
  ...(isProduction
    ? {}
    : {
        // Development still uses the configured limits.
      }),
});
