import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  loginRateLimiter,
} from "../middleware/rateLimit";
import {
  createSession,
  getUserBySession,
  login,
} from "../services/authService";
import { env, isProduction } from "../config/env";

const router = Router();

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
  sameSite: isProduction ? ("none" as const) : ("lax" as const),
  path: "/",
  maxAge: COOKIE_MAX_AGE_MS,
});

const getClearCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? ("none" as const) : ("lax" as const),
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

const clearSessionCookie = (res: Response) => {
  res.clearCookie(
    SESSION_COOKIE_NAME,
    getClearCookieOptions(),
  );
};

const getBearerToken = (req: Request) => {
  const authorization =
    req.headers.authorization;

  if (!authorization) {
    return null;
  }

  const [scheme, token] =
    authorization.split(" ");

  if (
    scheme?.toLowerCase() !== "bearer" ||
    !token
  ) {
    return null;
  }

  return token.trim() || null;
};

/**
 * POST /api/auth/login
 */
router.post(
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
          message: "ایمیل یا رمز عبور معتبر نیست.",
        });
      }

      const { email, password } =
        parsed.data;

      const result = await login(
        email,
        password,
      );

      if (!result) {
        return res.status(401).json({
          success: false,
          error: "INVALID_CREDENTIALS",
          message:
            "ایمیل یا رمز عبور اشتباه است.",
        });
      }

      const sessionId =
        await createSession(result.user.id);

      setSessionCookie(
        res,
        sessionId,
      );

      const user = result.user;

      return res.status(200).json({
        success: true,

        user: {
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
        },

        session: {
          id: sessionId,
          expiresAt: new Date(
            Date.now() + COOKIE_MAX_AGE_MS,
          ).toISOString(),
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
 * Supports both:
 * - HttpOnly session cookie
 * - Authorization: Bearer <session>
 */
router.get(
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
          message: "احراز هویت انجام نشده است.",
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

        user: {
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
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * POST /api/auth/logout
 *
 * Clears the browser session cookie.
 *
 * The current session is also invalidated when the
 * authentication service supports session deletion.
 */
router.post(
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
        const { prisma } =
          await import("../lib/prisma");

        await prisma.session.deleteMany({
          where: {
            id: sessionId,
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: "با موفقیت خارج شدید.",
      });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
