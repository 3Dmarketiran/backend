import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { prisma } from "../config/prisma";
import type { Role } from "../types/domain";

const SALT_ROUNDS = 12;

export const SESSION_DURATION_MS =
  1000 * 60 * 60 * 24 * 7; // 7 days

const normalizeEmail = (email: string) =>
  email.trim().toLowerCase();

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode = 401,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export async function hashPassword(
  plain: string,
): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Authenticates a user without creating a session.
 *
 * Session creation is intentionally separated from credential
 * verification so the authentication route can control exactly
 * when and how a session is issued.
 *
 * The seller relation is loaded so the frontend immediately
 * receives seller/store information after authentication.
 */
export async function login(
  email: string,
  password: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const normalizedEmail =
    normalizeEmail(email);

  const user =
    await prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
      include: {
        seller: true,
      },
    });

  const genericError = () =>
    new AuthError(
      "ایمیل یا رمز عبور نادرست است.",
      401,
    );

  /*
   * Always perform the same logical authentication flow
   * for unknown and inactive users.
   *
   * We still record failed attempts without exposing
   * whether the account exists.
   */
  if (!user || !user.isActive) {
    await prisma.loginAttempt.create({
      data: {
        email: normalizedEmail,
        success: false,
        ipAddress,
      },
    });

    throw genericError();
  }

  const valid =
    await verifyPassword(
      password,
      user.passwordHash,
    );

  await prisma.loginAttempt.create({
    data: {
      email: normalizedEmail,
      userId: user.id,
      success: valid,
      ipAddress,
    },
  });

  if (!valid) {
    throw genericError();
  }

  return {
    user,
    ipAddress,
    userAgent,
  };
}

/**
 * Creates an authenticated session for a user.
 */
export async function createSession(
  userId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const user =
    await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        isActive: true,
      },
    });

  if (!user || !user.isActive) {
    throw new AuthError(
      "حساب کاربری فعال نیست.",
      401,
    );
  }

  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_MS,
  );

  const session =
    await prisma.session.create({
      data: {
        userId,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: "LOGIN",
      entity: "User",
      entityId: userId,
      ipAddress,
    },
  });

  return {
    id: session.id,
    expiresAt: session.expiresAt,
  };
}

/**
 * Invalidates a session.
 *
 * deleteMany is intentionally used so logout remains idempotent:
 * logging out with an already-invalid session still succeeds.
 */
export async function logout(
  sessionId: string,
  actorId?: string,
) {
  if (!sessionId) {
    return;
  }

  const session =
    await prisma.session.findUnique({
      where: {
        id: sessionId,
      },
      select: {
        id: true,
        userId: true,
      },
    });

  await prisma.session.deleteMany({
    where: {
      id: sessionId,
    },
  });

  const auditActorId =
    actorId ?? session?.userId;

  if (auditActorId) {
    await prisma.auditLog.create({
      data: {
        actorId: auditActorId,
        action: "LOGOUT",
        entity: "User",
        entityId: auditActorId,
      },
    });
  }
}

/**
 * Resolves a session to its authenticated user.
 *
 * Returns null for:
 * - missing sessions
 * - unknown sessions
 * - expired sessions
 * - inactive users
 *
 * Expired sessions are removed lazily.
 */
export async function getUserBySession(
  sessionId: string,
) {
  if (!sessionId) {
    return null;
  }

  const session =
    await prisma.session.findUnique({
      where: {
        id: sessionId,
      },
      include: {
        user: {
          include: {
            seller: true,
          },
        },
      },
    });

  if (!session) {
    return null;
  }

  const now = new Date();

  if (session.expiresAt <= now) {
    await prisma.session
      .delete({
        where: {
          id: session.id,
        },
      })
      .catch(() => undefined);

    return null;
  }

  if (!session.user.isActive) {
    return null;
  }

  return session.user;
}

/**
 * Creates a user and, optionally, a seller profile.
 *
 * This function is intended for admin-controlled account creation
 * and seed operations. There is no public self-registration flow.
 */
export async function createUserWithRole(
  params: {
    email: string;
    password: string;
    role: Role;
    seller?: {
      storeName: string;
      slug: string;
    };
  },
) {
  const email =
    normalizeEmail(params.email);

  const passwordHash =
    await hashPassword(
      params.password,
    );

  return prisma.user.create({
    data: {
      email,
      passwordHash,
      role: params.role,

      seller: params.seller
        ? {
            create: {
              storeName:
                params.seller.storeName,
              slug: params.seller.slug,
            },
          }
        : undefined,
    },

    include: {
      seller: true,
    },
  });
}

/**
 * Generates a cryptographically strong application token.
 */
export function generateSecureToken(): string {
  return nanoid(48);
}
