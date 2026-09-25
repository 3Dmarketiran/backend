"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminSettingsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const env_1 = require("../config/env");
const githubService_1 = require("../services/githubService");
const json_1 = require("../utils/json");
exports.adminSettingsRouter = (0, express_1.Router)();
// Public: the public website reads branding to theme itself (colors, logo,
// platform name) — none of this is sensitive.
exports.adminSettingsRouter.get("/branding", async (_req, res, next) => {
    try {
        const settings = await prisma_1.prisma.platformSetting.findUnique({ where: { id: "singleton" } });
        res.json({ settings: settings ? { ...settings, socialLinks: (0, json_1.parseJson)(settings.socialLinks, {}) } : null });
    }
    catch (err) {
        next(err);
    }
});
const brandingSchema = zod_1.z.object({
    platformName: zod_1.z.string().min(2).max(100).optional(),
    logoUrl: zod_1.z.string().url().optional(),
    faviconUrl: zod_1.z.string().url().optional(),
    colorPrimary: zod_1.z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    colorSecondary: zod_1.z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    colorAccent: zod_1.z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    colorBackground: zod_1.z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    colorText: zod_1.z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    fontFamily: zod_1.z.string().max(60).optional(),
    socialLinks: zod_1.z.record(zod_1.z.string().url()).optional(),
    contactEmail: zod_1.z.string().email().optional(),
    contactPhone: zod_1.z.string().max(30).optional(),
});
exports.adminSettingsRouter.put("/branding", auth_1.requireAuth, rbac_1.requireAdmin, async (req, res, next) => {
    try {
        const input = brandingSchema.parse(req.body);
        const settings = await prisma_1.prisma.platformSetting.update({ where: { id: "singleton" }, data: { ...input, socialLinks: (0, json_1.serializeJson)(input.socialLinks) } });
        await prisma_1.prisma.auditLog.create({
            data: { actorId: req.user.id, action: "PLATFORM_SETTINGS_UPDATED", entity: "PlatformSetting", entityId: "singleton" },
        });
        res.json({ settings: { ...settings, socialLinks: (0, json_1.parseJson)(settings.socialLinks, {}) } });
    }
    catch (err) {
        next(err);
    }
});
// --- GitHub connection status (spec section 45) --------------------------
// CRITICAL: this route must NEVER return env.GITHUB_TOKEN or any derivative
// of it. It only reports configuration presence and the last known
// deployment state recorded from real publish jobs (Phase 5).
exports.adminSettingsRouter.get("/github/status", auth_1.requireAuth, rbac_1.requireAdmin, async (_req, res, next) => {
    try {
        const settings = await prisma_1.prisma.platformSetting.findUnique({ where: { id: "singleton" } });
        const lastSuccess = await prisma_1.prisma.publishJob.findFirst({
            where: { status: "SUCCESS" },
            orderBy: { finishedAt: "desc" },
        });
        const lastFailure = await prisma_1.prisma.publishJob.findFirst({
            where: { status: "FAILED" },
            orderBy: { finishedAt: "desc" },
        });
        res.json({
            connected: Boolean(env_1.env.GITHUB_TOKEN && env_1.env.GITHUB_OWNER && env_1.env.GITHUB_REPOSITORY),
            owner: settings?.githubOwner ?? env_1.env.GITHUB_OWNER ?? null,
            repository: settings?.githubRepository ?? env_1.env.GITHUB_REPOSITORY ?? null,
            branch: settings?.githubBranch ?? env_1.env.GITHUB_BRANCH,
            lastSuccessfulPublish: lastSuccess
                ? { at: lastSuccess.finishedAt, commitSha: lastSuccess.commitSha }
                : null,
            lastFailedPublish: lastFailure
                ? { at: lastFailure.finishedAt, error: lastFailure.errorMessage }
                : null,
            // token is intentionally never included here
        });
    }
    catch (err) {
        next(err);
    }
});
const githubConfigSchema = zod_1.z.object({
    githubOwner: zod_1.z.string().min(1).optional(),
    githubRepository: zod_1.z.string().min(1).optional(),
    githubBranch: zod_1.z.string().min(1).optional(),
});
// Admin can set owner/repo/branch (non-secret metadata); the actual TOKEN
// is only ever set via the server's environment variable, never through
// this or any other HTTP endpoint.
exports.adminSettingsRouter.put("/github/config", auth_1.requireAuth, rbac_1.requireAdmin, async (req, res, next) => {
    try {
        const input = githubConfigSchema.parse(req.body);
        const settings = await prisma_1.prisma.platformSetting.update({ where: { id: "singleton" }, data: input });
        await prisma_1.prisma.auditLog.create({
            data: { actorId: req.user.id, action: "GITHUB_CONFIG_CHANGED", entity: "PlatformSetting", entityId: "singleton", metadata: (0, json_1.serializeJson)(input) },
        });
        res.json({ settings: { ...settings, socialLinks: (0, json_1.parseJson)(settings.socialLinks, {}) } });
    }
    catch (err) {
        next(err);
    }
});
// "Test connection" button (spec section 45) — makes a real, read-only call
// to GitHub's API using the server-side token and reports ok/failure only.
exports.adminSettingsRouter.post("/github/test", auth_1.requireAuth, rbac_1.requireAdmin, async (req, res, next) => {
    try {
        const result = await (0, githubService_1.testConnection)();
        await prisma_1.prisma.auditLog.create({
            data: {
                actorId: req.user.id,
                action: "GITHUB_CONNECTION_TESTED",
                entity: "PlatformSetting",
                entityId: "singleton",
                metadata: (0, json_1.serializeJson)({ ok: result.ok }),
            },
        });
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
// Audit logs — admin only, read-only.
exports.adminSettingsRouter.get("/audit-logs", auth_1.requireAuth, rbac_1.requireAdmin, async (req, res, next) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const pageSize = Math.min(100, Number(req.query.pageSize) || 30);
        const [items, total] = await Promise.all([
            prisma_1.prisma.auditLog.findMany({
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * pageSize,
                take: pageSize,
                include: { actor: { select: { email: true, role: true } } },
            }),
            prisma_1.prisma.auditLog.count(),
        ]);
        res.json({ items: items.map((item) => ({ ...item, metadata: (0, json_1.parseJson)(item.metadata, {}) })), total, page, pageSize });
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=adminSettings.js.map