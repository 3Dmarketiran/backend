"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_COOKIE_NAME = void 0;
exports.attachUser = attachUser;
exports.requireAuth = requireAuth;
const authService_1 = require("../services/authService");
const domain_1 = require("../types/domain");
const SESSION_COOKIE_NAME = "platform_session";
exports.SESSION_COOKIE_NAME = SESSION_COOKIE_NAME;
/**
 * Reads the HttpOnly session cookie and attaches the resolved user to
 * req.user if valid. Does NOT reject unauthenticated requests — that is
 * the job of requireAuth() / requireRole() below, so public routes can
 * still use this to optionally know "who is asking".
 */
async function attachUser(req, _res, next) {
    try {
        const sessionId = req.cookies?.[SESSION_COOKIE_NAME];
        if (!sessionId)
            return next();
        const user = await (0, authService_1.getUserBySession)(sessionId);
        if (user) {
            if (!(0, domain_1.isRole)(user.role)) {
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
    }
    catch (err) {
        next(err);
    }
}
function requireAuth(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: "احراز هویت لازم است." });
    }
    next();
}
//# sourceMappingURL=auth.js.map