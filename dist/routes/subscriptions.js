"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscriptionsRouter = void 0;
exports.expireOverdueSubscriptions = expireOverdueSubscriptions;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const errorHandler_1 = require("../middleware/errorHandler");
const json_1 = require("../utils/json");
exports.subscriptionsRouter = (0, express_1.Router)();
// ---------------------------------------------------------------------
// Plans (public read so the seller dashboard / a future pricing page can
// show them; only admins can create/edit plans).
// ---------------------------------------------------------------------
exports.subscriptionsRouter.get("/plans", async (_req, res, next) => {
    try {
        const plans = await prisma_1.prisma.subscriptionPlan.findMany({
            where: { isActive: true },
            orderBy: { durationDays: "asc" },
        });
        res.json({ plans: plans.map((p) => ({ ...p, features: (0, json_1.parseJson)(p.features, {}) })) });
    }
    catch (err) {
        next(err);
    }
});
const planSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(120),
    durationDays: zod_1.z.number().int().positive(),
    price: zod_1.z.number().nonnegative(),
    discountPct: zod_1.z.number().min(0).max(100).optional(),
    features: zod_1.z.record(zod_1.z.unknown()).optional(),
    productLimit: zod_1.z.number().int().positive().optional(),
    storageLimitMb: zod_1.z.number().int().positive().optional(),
});
exports.subscriptionsRouter.post("/plans", auth_1.requireAuth, rbac_1.requireAdmin, async (req, res, next) => {
    try {
        const input = planSchema.parse(req.body);
        const plan = await prisma_1.prisma.subscriptionPlan.create({ data: { ...input, features: (0, json_1.serializeJson)(input.features) } });
        res.status(201).json({ plan: { ...plan, features: (0, json_1.parseJson)(plan.features, {}) } });
    }
    catch (err) {
        next(err);
    }
});
exports.subscriptionsRouter.put("/plans/:id", auth_1.requireAuth, rbac_1.requireAdmin, async (req, res, next) => {
    try {
        const input = planSchema.partial().parse(req.body);
        const plan = await prisma_1.prisma.subscriptionPlan.update({ where: { id: req.params.id }, data: { ...input, ...(input.features !== undefined ? { features: (0, json_1.serializeJson)(input.features) } : {}) } });
        res.json({ plan: { ...plan, features: (0, json_1.parseJson)(plan.features, {}) } });
    }
    catch (err) {
        next(err);
    }
});
// ---------------------------------------------------------------------
// Subscriptions themselves — NO online payment (spec section 21). Admin
// manually activates after receiving payment through an offline channel.
// ---------------------------------------------------------------------
const activateSchema = zod_1.z.object({
    sellerId: zod_1.z.string().cuid(),
    planId: zod_1.z.string().cuid(),
    startDate: zod_1.z.string().datetime().optional(),
    notes: zod_1.z.string().max(1000).optional(),
});
exports.subscriptionsRouter.post("/activate", auth_1.requireAuth, rbac_1.requireAdmin, async (req, res, next) => {
    try {
        const input = activateSchema.parse(req.body);
        const plan = await prisma_1.prisma.subscriptionPlan.findUnique({ where: { id: input.planId } });
        if (!plan)
            throw new errorHandler_1.HttpError(404, "پلن یافت نشد.");
        const startDate = input.startDate ? new Date(input.startDate) : new Date();
        const endDate = new Date(startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
        const subscription = await prisma_1.prisma.subscription.create({
            data: {
                sellerId: input.sellerId,
                planId: input.planId,
                status: "ACTIVE",
                startDate,
                endDate,
                activatedById: req.user.id,
                notes: input.notes,
            },
        });
        await prisma_1.prisma.auditLog.create({
            data: {
                actorId: req.user.id,
                sellerId: input.sellerId,
                action: "SUBSCRIPTION_ACTIVATED",
                entity: "Subscription",
                entityId: subscription.id,
                metadata: (0, json_1.serializeJson)({ planId: input.planId, endDate }),
                ipAddress: req.ip,
            },
        });
        res.status(201).json({ subscription: { ...subscription, plan: { ...plan, features: (0, json_1.parseJson)(plan.features, {}) } } });
    }
    catch (err) {
        next(err);
    }
});
exports.subscriptionsRouter.post("/:id/cancel", auth_1.requireAuth, rbac_1.requireAdmin, async (req, res, next) => {
    try {
        const subscription = await prisma_1.prisma.subscription.update({
            where: { id: req.params.id },
            data: { status: "CANCELLED" },
        });
        await prisma_1.prisma.auditLog.create({
            data: {
                actorId: req.user.id,
                sellerId: subscription.sellerId,
                action: "SUBSCRIPTION_CANCELLED",
                entity: "Subscription",
                entityId: subscription.id,
                ipAddress: req.ip,
            },
        });
        res.json({ subscription });
    }
    catch (err) {
        next(err);
    }
});
// Seller (or admin) can view a seller's subscription history.
exports.subscriptionsRouter.get("/seller/:sellerId", auth_1.requireAuth, (0, rbac_1.requireOwnSeller)(), async (req, res, next) => {
    try {
        const subscriptions = await prisma_1.prisma.subscription.findMany({
            where: { sellerId: req.params.sellerId },
            include: { plan: true },
            orderBy: { createdAt: "desc" },
        });
        res.json({ subscriptions: subscriptions.map((s) => ({ ...s, plan: { ...s.plan, features: (0, json_1.parseJson)(s.plan.features, {}) } })) });
    }
    catch (err) {
        next(err);
    }
});
/**
 * Called by a scheduled job (see scripts/expireSubscriptions.ts) — flips
 * any subscription whose endDate has passed from ACTIVE to EXPIRED. This
 * does NOT delete any seller/product data (spec section 22); it only
 * changes status, which the public-data generator (Phase 5/6) reads to
 * decide what stays in the public catalog.
 */
async function expireOverdueSubscriptions() {
    const result = await prisma_1.prisma.subscription.updateMany({
        where: { status: "ACTIVE", endDate: { lt: new Date() } },
        data: { status: "EXPIRED" },
    });
    return result.count;
}
//# sourceMappingURL=subscriptions.js.map