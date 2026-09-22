import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { prisma } from "../config/prisma";
import type { Role } from "../types/domain";

const SALT_ROUNDS = 12;
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export class AuthError extends Error {
  constructor(message: string, public statusCode = 401) {
    super(message);
    this.name = "AuthError";
  }
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Attempts a login. Records every attempt (success or failure) for rate
 * limiting / brute-force detection, and never reveals whether the email
 * or the password was the wrong part (prevents user enumeration).
 *
 * The seller relation is loaded during login so seller accounts have
 * everything required by the frontend immediately after authentication.
 */
export async function login(
  email: string,
  password: string,
  ipAddress: string | undefined,
  userAgent: string | undefined
) {
  const user = await prisma.user.findUnique({
    where: {
      email: email.toLowerCase(),
    },
    include: {
      seller: true,
    },
  });

  const genericError = () =>
    new AuthError("ایمیل یا رمز عبور نادرست است.", 401);

  if (!user || !user.isActive) {
    await prisma.loginAttempt.create({
      data: {
        email: email.toLowerCase(),
        success: false,
        ipAddress,
      },
    });

    throw genericError();
  }

  const valid = await verifyPassword(password, user.passwordHash);

  await prisma.loginAttempt.create({
    data: {
      email: email.toLowerCase(),
      userId: user.id,
      success: valid,
      ipAddress,
    },
  });

  if (!valid) {
    throw genericError();
  }

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      ipAddress,
      userAgent,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "LOGIN",
      entity: "User",
      entityId: user.id,
      ipAddress,
    },
  });

  return {
    user,
    sessionId: session.id,
    expiresAt: session.expiresAt,
  };
}

export async function logout(
  sessionId: string,
  actorId?: string
) {
  await prisma.session.deleteMany({
    where: {
      id: sessionId,
    },
  });

  if (actorId) {
    await prisma.auditLog.create({
      data: {
        actorId,
        action: "LOGOUT",
        entity: "User",
        entityId: actorId,
      },
    });
  }
}

/**
 * Resolves a session cookie value to its user, or null if invalid/expired.
 */
export async function getUserBySession(sessionId: string) {
  if (!sessionId) {
    return null;
  }

  const session = await prisma.session.findUnique({
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

  if (session.expiresAt < new Date()) {
    // Expired — clean up lazily and treat as unauthenticated.
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
 * Creates a new user + (optionally) an associated seller profile.
 * Only ever called from admin-guarded routes or the seed script — there is
 * no public self-registration endpoint per the spec (admin-controlled ecosystem).
 */
export async function createUserWithRole(params: {
  email: string;
  password: string;
  role: Role;
  seller?: {
    storeName: string;
    slug: string;
  };
}) {
  const passwordHash = await hashPassword(params.password);

  return prisma.user.create({
    data: {
      email: params.email.toLowerCase(),
      passwordHash,
      role: params.role,
      seller: params.seller
        ? {
            create: {
              storeName: params.seller.storeName,
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

export function generateSecureToken(): string {
  return nanoid(48);
}
