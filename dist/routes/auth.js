"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const authService_1 = require("../services/authService");
const auth_1 = require("../middleware/auth");
const rateLimit_1 = require("../middleware/rateLimit");
const env_1 = require("../config/env");
exports.authRouter = (0, express_1.Router)();
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
exports.authRouter.post("/login", rateLimit_1.loginRateLimiter, async (req, res, next) => {
    try {
        const { email, password } = loginSchema.parse(req.body);
        const { sessionId, expiresAt, user } = await (0, authService_1.login)(email, password, req.ip, req.headers["user-agent"]);
        res.cookie(auth_1.SESSION_COOKIE_NAME, sessionId, {
            httpOnly: true,
            secure: env_1.isProduction, // requires HTTPS in production
            sameSite: "none",
            expires: expiresAt,
            path: "/",
        });
        res.json({
            user: { id: user.id, email: user.email, role: user.role },
        });
    }
    catch (err) {
        next(err);
    }
});
exports.authRouter.post("/logout", auth_1.requireAuth, async (req, res, next) => {
    try {
        const sessionId = req.cookies?.[auth_1.SESSION_COOKIE_NAME];
        if (sessionId)
            await (0, authService_1.logout)(sessionId, req.user.id);
        res.clearCookie(auth_1.SESSION_COOKIE_NAME, { path: "/" });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
exports.authRouter.get("/me", auth_1.requireAuth, (req, res) => {
    res.json({
        user: {
            id: req.user.id,
            email: req.user.email,
            role: req.user.role,
            seller: req.user.seller
                ? { id: req.user.seller.id, slug: req.user.seller.slug, storeName: req.user.seller.storeName }
                : null,
        },
    });
});
//# sourceMappingURL=auth.js.map