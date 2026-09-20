import type { Request, Response, NextFunction } from "express";
import { getUserBySession } from "../services/authService";
import type { Seller } from "@prisma/client";
import { isRole, type Role } from "../types/domain";

export interface AuthedUser {
  id: string;
  email: string;
  role: Role;
  seller: Seller | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

const SESSION_COOKIE_NAME = "platform_session";
export { SESSION_COOKIE_NAME };

/**
 * Reads the HttpOnly session cookie and attaches the resolved user to
 * req.user if valid. Does NOT reject unauthenticated requests — that is
 * the job of requireAuth() / requireRole() below, so public routes can
 * still use this to optionally know "who is asking".
 */
export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const sessionId = req.cookies?.[SESSION_COOKIE_NAME];
    if (!sessionId) return next();

    const user = await getUserBySession(sessionId);
    if (user) {
      if (!isRole(user.role)) {
        return next(new Error("Invalid role stored for user."));
      }
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        seller: user.seller ?? null,
      };
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "احراز هویت لازم است." });
  }
  next();
}
