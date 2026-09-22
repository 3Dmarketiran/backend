import type {
  Request,
  Response,
  NextFunction,
} from "express";
import type { Seller } from "@prisma/client";
import {
  getUserBySession,
} from "../services/authService";
import {
  isRole,
  type Role,
} from "../types/domain";

export interface AuthedUser {
  id: string;
  email: string;
  role: Role;
  seller: Seller | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

/**
 * Must stay synchronized with the authentication route.
 *
 * auth.ts sets this cookie after successful login.
 */
const SESSION_COOKIE_NAME = "session";

export { SESSION_COOKIE_NAME };

function getSessionId(
  req: Request,
): string | undefined {
  const cookieSession =
    req.cookies?.[
      SESSION_COOKIE_NAME
    ];

  if (
    typeof cookieSession === "string" &&
    cookieSession.trim()
  ) {
    return cookieSession.trim();
  }

  const authorization =
    req.headers.authorization;

  if (
    typeof authorization !== "string"
  ) {
    return undefined;
  }

  const match =
    authorization.match(
      /^Bearer\s+(.+)$/i,
    );

  if (!match?.[1]) {
    return undefined;
  }

  const token = match[1].trim();

  return token || undefined;
}

/**
 * Attaches the authenticated user to req.user when a
 * valid session exists.
 *
 * This middleware does not reject anonymous requests.
 * Use requireAuth for protected routes.
 */
export async function attachUser(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const sessionId =
      getSessionId(req);

    if (!sessionId) {
      return next();
    }

    const user =
      await getUserBySession(
        sessionId,
      );

    if (!user) {
      return next();
    }

    if (!isRole(user.role)) {
      return next(
        new Error(
          "Invalid role stored for user.",
        ),
      );
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      seller: user.seller ?? null,
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Requires an authenticated user.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      message:
        "احراز هویت لازم است.",
    });
  }

  return next();
}
