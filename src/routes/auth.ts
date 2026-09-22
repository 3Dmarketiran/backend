import { Router } from "express";
import { z } from "zod";
import { login, logout } from "../services/authService";
import { requireAuth, SESSION_COOKIE_NAME } from "../middleware/auth";
import { loginRateLimiter } from "../middleware/rateLimit";
import { isProduction } from "../config/env";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function getCookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? ("none" as const) : ("lax" as const),
    ...(expires ? { expires } : {}),
    path: "/",
  };
});

authRouter.post("/login", loginRateLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const { sessionId, expiresAt, user } = await login(
      email,
      password,
      req.ip,
      req.headers["user-agent"]
    );

    res.cookie(
      SESSION_COOKIE_NAME,
      sessionId,
      getCookieOptions(expiresAt)
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        seller: user.seller
          ? {
              id: user.seller.id,
              slug: user.seller.slug,
              storeName: user.seller.storeName,
            }
          : null,
      },
      sessionId,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", requireAuth, async (req, res, next) => {
  try {
    const cookieSession = req.cookies?.[SESSION_COOKIE_NAME];

    const bearerSession =
      req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

    const sessionId = cookieSession || bearerSession;

    if (sessionId) {
      await logout(sessionId, req.user!.id);
    }

    res.clearCookie(
      SESSION_COOKIE_NAME,
      getCookieOptions()
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user!.id,
      email: req.user!.email,
      role: req.user!.role,
      seller: req.user!.seller
        ? {
            id: req.user!.seller.id,
            slug: req.user!.seller.slug,
            storeName: req.user!.seller.storeName,
          }
        : null,
    },
  });
});
