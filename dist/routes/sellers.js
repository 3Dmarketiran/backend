"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sellersRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const errorHandler_1 = require("../middleware/errorHandler");
const authService_1 = require("../services/authService");
const slug_1 = require("../utils/slug");
const json_1 = require("../utils/json");
exports.sellersRouter = (0, express_1.Router)();
// ---------------------------------------------------------------------
// Public: storefront lookup by slug. Only visible if seller is active
// AND has a currently-active subscription (spec sections 20/22).
// ---------------------------------------------------------------------
exports.sellersRouter.get("/by-slug/:slug", async (req, res, next) => {
    try {
        const seller = await prisma_1.prisma.seller.findUnique({
            where: { slug: req.params.slug },
            include: {
                subscriptions: { where: { status: "ACTIVE", endDate: { gte: new Date() } } },
            },
        });
        const isPubliclyVisible = seller?.isActive && (seller?.subscriptions.length ?? 0) > 0;
        if (!seller || !isPubliclyVisible) {
            throw new errorHandler_1.HttpError(404, "فروشنده یافت نشد.");
        }
        res.json({
            seller: {
                id: seller.id,
                slug: seller.slug,
                storeName: seller.storeName,
                description: seller.description,
                logoUrl: seller.logoUrl,
                contactEmail: seller.contactEmail,
                contactPhone: seller.contactPhone,
                socialLinks: (0, json_1.parseJson)(seller.socialLinks, {}),
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// ---------------------------------------------------------------------
// Admin: list / manage sellers
// ---------------------------------------------------------------------
exports.sellersRouter.get("/", auth_1.requireAuth, rbac_1.requireAdmin, async (_req, res, next) => {
    try {
        const sellers = await prisma_1.prisma.seller.findMany({
            include: {
                user: { select: { email: true, isActive: true, createdAt: true } },
                _count: { select: { products: true } },
                subscriptions: {
                    where: { status: "ACTIVE", endDate: { gte: new Date() } },
                    orderBy: { endDate: "desc" },
                    take: 1,
                },
            },
            orderBy: { createdAt: "desc" },
        });
        res.json({ sellers: sellers.map((seller) => ({ ...seller, socialLinks: (0, json_1.parseJson)(seller.socialLinks, {}) })) });
    }
    catch (err) {
        next(err);
    }
});
const createSellerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8, "رمز عبور باید حداقل ۸ کاراکتر باشد."),
    storeName: zod_1.z.string().min(2).max(120),
    contactEmail: zod_1.z.string().email().optional(),
    contactPhone: zod_1.z.string().max(30).optional(),
});
// Admin-only: creates seller accounts (no public self-registration, per spec).
exports.sellersRouter.post("/", auth_1.requireAuth, rbac_1.requireAdmin, async (req, res, next) => {
    try {
        const input = createSellerSchema.parse(req.body);
        const slug = (0, slug_1.slugify)(input.storeName);
        const user = await (0, authService_1.createUserWithRole)({
            email: input.email,
            password: input.password,
            role: "SELLER",
            seller: { storeName: input.storeName, slug },
        });
        if (input.contactEmail || input.contactPhone) {
            await prisma_1.prisma.seller.update({
                where: { id: user.seller.id },
                data: { contactEmail: input.contactEmail, contactPhone: input.contactPhone },
            });
        }
        await prisma_1.prisma.auditLog.create({
            data: {
                actorId: req.user.id,
                sellerId: user.seller.id,
                action: "SELLER_CREATED",
                entity: "Seller",
                entityId: user.seller.id,
                ipAddress: req.ip,
            },
        });
        res.status(201).json({ seller: user.seller });
    }
    catch (err) {
        if (err instanceof Error && "code" in err && err.code === "P2002") {
            return next(new errorHandler_1.HttpError(409, "این ایمیل قبلاً ثبت شده است."));
        }
        next(err);
    }
});
const updateSellerSchema = zod_1.z.object({
    storeName: zod_1.z.string().min(2).max(120).optional(),
    description: zod_1.z.string().max(2000).optional(),
    logoUrl: zod_1.z.string().url().optional(),
    contactEmail: zod_1.z.string().email().optional(),
    contactPhone: zod_1.z.string().max(30).optional(),
    socialLinks: zod_1.z.record(zod_1.z.string().url()).optional(),
    isActive: zod_1.z.boolean().optional(), // admin-only field, stripped below for sellers
});
exports.sellersRouter.put("/:id", auth_1.requireAuth, (0, rbac_1.requireOwnSeller)(), async (req, res, next) => {
    try {
        const input = updateSellerSchema.parse(req.body);
        const isAdmin = req.user.role === "ADMIN" || req.user.role === "SUPER_ADMIN";
        const seller = await prisma_1.prisma.seller.update({
            where: { id: req.params.id },
            data: {
                storeName: input.storeName,
                description: input.description,
                logoUrl: input.logoUrl,
                contactEmail: input.contactEmail,
                contactPhone: input.contactPhone,
                socialLinks: (0, json_1.serializeJson)(input.socialLinks),
                // A seller can never activate/deactivate themselves — admin only.
                ...(isAdmin && input.isActive !== undefined ? { isActive: input.isActive } : {}),
            },
        });
        res.json({ seller: { ...seller, socialLinks: (0, json_1.parseJson)(seller.socialLinks, {}) } });
    }
    catch (err) {
        next(err);
    }
});
exports.sellersRouter.get("/:id", auth_1.requireAuth, (0, rbac_1.requireOwnSeller)(), async (req, res, next) => {
    try {
        const seller = await prisma_1.prisma.seller.findUnique({
            where: { id: req.params.id },
            include: {
                subscriptions: { orderBy: { createdAt: "desc" }, include: { plan: true } },
                _count: { select: { products: true } },
            },
        });
        if (!seller)
            throw new errorHandler_1.HttpError(404, "فروشنده یافت نشد.");
        res.json({ seller: { ...seller, socialLinks: (0, json_1.parseJson)(seller.socialLinks, {}), subscriptions: seller.subscriptions.map((s) => ({ ...s, plan: { ...s.plan, features: (0, json_1.parseJson)(s.plan.features, {}) } })) } });
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=sellers.js.map