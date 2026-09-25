"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthError = void 0;
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.login = login;
exports.logout = logout;
exports.getUserBySession = getUserBySession;
exports.createUserWithRole = createUserWithRole;
exports.generateSecureToken = generateSecureToken;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const nanoid_1 = require("nanoid");
const prisma_1 = require("../config/prisma");
const SALT_ROUNDS = 12;
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
class AuthError extends Error {
    statusCode;
    constructor(message, statusCode = 401) {
        super(message);
        this.statusCode = statusCode;
        this.name = "AuthError";
    }
}
exports.AuthError = AuthError;
async function hashPassword(plain) {
    return bcryptjs_1.default.hash(plain, SALT_ROUNDS);
}
async function verifyPassword(plain, hash) {
    return bcryptjs_1.default.compare(plain, hash);
}
/**
 * Attempts a login. Records every attempt (success or failure) for rate
 * limiting / brute-force detection, and never reveals whether the email
 * or the password was the wrong part (prevents user enumeration).
 */
async function login(email, password, ipAddress, userAgent) {
    const user = await prisma_1.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    const genericError = () => new AuthError("ایمیل یا رمز عبور نادرست است.", 401);
    if (!user || !user.isActive) {
        await prisma_1.prisma.loginAttempt.create({
            data: { email: email.toLowerCase(), success: false, ipAddress },
        });
        throw genericError();
    }
    const valid = await verifyPassword(password, user.passwordHash);
    await prisma_1.prisma.loginAttempt.create({
        data: { email: email.toLowerCase(), userId: user.id, success: valid, ipAddress },
    });
    if (!valid)
        throw genericError();
    const session = await prisma_1.prisma.session.create({
        data: {
            userId: user.id,
            expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
            ipAddress,
            userAgent,
        },
    });
    await prisma_1.prisma.auditLog.create({
        data: {
            actorId: user.id,
            action: "LOGIN",
            entity: "User",
            entityId: user.id,
            ipAddress,
        },
    });
    return { user, sessionId: session.id, expiresAt: session.expiresAt };
}
async function logout(sessionId, actorId) {
    await prisma_1.prisma.session.deleteMany({ where: { id: sessionId } });
    if (actorId) {
        await prisma_1.prisma.auditLog.create({
            data: { actorId, action: "LOGOUT", entity: "User", entityId: actorId },
        });
    }
}
/** Resolves a session cookie value to its user, or null if invalid/expired. */
async function getUserBySession(sessionId) {
    if (!sessionId)
        return null;
    const session = await prisma_1.prisma.session.findUnique({
        where: { id: sessionId },
        include: { user: { include: { seller: true } } },
    });
    if (!session)
        return null;
    if (session.expiresAt < new Date()) {
        // Expired — clean up lazily and treat as unauthenticated.
        await prisma_1.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
        return null;
    }
    if (!session.user.isActive)
        return null;
    return session.user;
}
/**
 * Creates a new user + (optionally) an associated seller profile.
 * Only ever called from admin-guarded routes or the seed script — there is
 * no public self-registration endpoint per the spec (admin-controlled ecosystem).
 */
async function createUserWithRole(params) {
    const passwordHash = await hashPassword(params.password);
    return prisma_1.prisma.user.create({
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
        include: { seller: true },
    });
}
function generateSecureToken() {
    return (0, nanoid_1.nanoid)(48);
}
//# sourceMappingURL=authService.js.map