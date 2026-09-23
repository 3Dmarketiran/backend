import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  loginRateLimiter,
} from "../middleware/rateLimit";
import {
  createSession,
  getUserBySession,
  login,
  logout,
} from "../services/authService";
import {
  isProduction,
} from "../config/env";

export const authRouter = Router();

const SESSION_COOKIE_NAME = "session";

const COOKIE_MAX_AGE_MS =
  1000 * 60 * 60 * 24 * 7;

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(320),

  password: z
    .string()
    .min(1)
    .max(200),
});

const getCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction
    ? ("none" as const)
    : ("lax" as const),
  path: "/",
  maxAge: COOKIE_MAX_AGE_MS,
});

const getClearCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction
    ? ("none" as const)
    : ("lax" as const),
  path: "/",
});

const setSessionCookie = (
  res: Response,
  sessionId: string,
) => {
  res.cookie(
    SESSION_COOKIE_NAME,
    sessionId,
    getCookieOptions(),
  );
};

const clearSessionCookie = (
  res: Response,
) => {
  res.clearCookie(
    SESSION_COOKIE_NAME,
    getClearCookieOptions(),
  );
};

const getBearerToken = (
  req: Request,
): string | null => {
  const authorization =
    req.headers.authorization;

  if (!authorization) {
    return null;
  }

  const [scheme, token] =
    authorization.trim().split(/\s+/);

  if (
    scheme?.toLowerCase() !== "bearer" ||
    !token
  ) {
    return null;
  }

  return token.trim() || null;
};

const getClientIp = (
  req: Request,
): string | undefined => {
  const forwardedFor =
    req.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string") {
    const firstIp = forwardedFor
      .split(",")[0]
      ?.trim();

    if (firstIp) {
      return firstIp;
    }
  }

  if (Array.isArray(forwardedFor)) {
    const firstIp =
      forwardedFor[0]?.trim();

    if (firstIp) {
      return firstIp;
    }
  }

  return req.ip || undefined;
};

const getUserAgent = (
  req: Request,
): string | undefined => {
  const userAgent =
    req.headers["user-agent"];

  if (typeof userAgent !== "string") {
    return undefined;
  }

  return userAgent
    .trim()
    .slice(0, 1000) || undefined;
};

const serializeUser = (user: any) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  seller: user.seller
    ? {
        id: user.seller.id,
        slug: user.seller.slug,
        storeName:
          user.seller.storeName,
      }
    : null,
});

/**
 * POST /api/auth/login
 */
authRouter.post(
  "/login",
  loginRateLimiter,
  async (req, res, next) => {
    try {
      const parsed =
        loginSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: "INVALID_INPUT",
          message:
            "ایمیل یا رمز عبور معتبر نیست.",
        });
      }

      const {
        email,
        password,
      } = parsed.data;

      const ipAddress =
        getClientIp(req);

      const userAgent =
        getUserAgent(req);

      const result = await login(
        email,
        password,
        ipAddress,
        userAgent,
      );

      const session =
        await createSession(
          result.user.id,
          ipAddress,
          userAgent,
        );

      setSessionCookie(
        res,
        session.id,
      );

      return res.status(200).json({
        success: true,

        user: serializeUser(
          result.user,
        ),

        session: {
          id: session.id,
          expiresAt:
            session.expiresAt.toISOString(),
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * GET /api/auth/me
 *
 * Supports:
 * - HttpOnly session cookie
 * - Authorization: Bearer <session>
 */
authRouter.get(
  "/me",
  async (req, res, next) => {
    try {
      const sessionId =
        req.cookies?.[
          SESSION_COOKIE_NAME
        ] ||
        getBearerToken(req);

      if (!sessionId) {
        return res.status(401).json({
          success: false,
          error: "UNAUTHORIZED",
          message:
            "احراز هویت انجام نشده است.",
        });
      }

      const user =
        await getUserBySession(
          sessionId,
        );

      if (!user) {
        clearSessionCookie(res);

        return res.status(401).json({
          success: false,
          error: "INVALID_SESSION",
          message:
            "نشست کاربری معتبر نیست یا منقضی شده است.",
        });
      }

      return res.status(200).json({
        success: true,
        user: serializeUser(user),
      });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * POST /api/auth/logout
 */
authRouter.post(
  "/logout",
  async (req, res, next) => {
    try {
      const sessionId =
        req.cookies?.[
          SESSION_COOKIE_NAME
        ] ||
        getBearerToken(req);

      clearSessionCookie(res);

      if (sessionId) {
        await logout(sessionId);
      }

      return res.status(200).json({
        success: true,
        message:
          "با موفقیت خارج شدید.",
      });
    } catch (error) {
      return next(error);
    }
  },
);

