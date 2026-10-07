import type { RequestHandler } from "express";
import { env } from "../config/env";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const AUTH_EXEMPT_PATHS = new Set(["/api/auth/login", "/api/auth/logout"]);

function allowedOrigins(): Set<string> {
  const configured = env.CORS_ORIGIN.split(",").map((value) => value.trim()).filter(Boolean);
  return new Set([
    ...configured,
    "https://3dmarketiran.ir",
    "https://www.3dmarketiran.ir",
    "https://3dmarketiran.github.io",
    "https://admin.3dmarketiran.ir",
  ]);
}

function isAllowedSource(value?: string | null): boolean {
  if (!value) return false;
  try {
    return allowedOrigins().has(new URL(value).origin);
  } catch {
    return false;
  }
}

/**
 * Blocks cross-site cookie-authenticated state-changing requests.
 * Bearer-token requests from the admin/seller client do not need this check
 * because the token is not ambient browser state.
 */
export const csrfProtection: RequestHandler = (req, res, next) => {
  if (SAFE_METHODS.has(req.method) || AUTH_EXEMPT_PATHS.has(req.path)) {
    next();
    return;
  }

  const hasAuthorization = Boolean(req.get("Authorization"));
  const hasSessionCookie = Boolean(req.cookies?.session || req.cookies?.["connect.sid"]);
  if (hasAuthorization || !hasSessionCookie) {
    next();
    return;
  }

  const origin = req.get("Origin");
  const referer = req.get("Referer");
  if (isAllowedSource(origin) || isAllowedSource(referer)) {
    next();
    return;
  }

  res.status(403).json({ error: "CSRF_BLOCKED", message: "درخواست از مبدأ مجاز ارسال نشده است." });
};
