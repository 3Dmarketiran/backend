import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/rbac";
import { env } from "../config/env";
import { testConnection as testGithubConnection } from "../services/githubService";
import { parseJson, serializeJson } from "../utils/json";

export const adminSettingsRouter = Router();

// Public: the public website reads branding to theme itself (colors, logo,
// platform name) — none of this is sensitive.
adminSettingsRouter.get("/branding", async (_req, res, next) => {
  try {
    const settings = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });
    res.json({ settings: settings ? { ...settings, socialLinks: parseJson(settings.socialLinks, {}) } : null });
  } catch (err) {
    next(err);
  }
});

const brandingSchema = z.object({
  platformName: z.string().min(2).max(100).optional(),
  logoUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
  colorPrimary: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorSecondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorAccent: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorBackground: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorText: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  fontFamily: z.string().max(60).optional(),
  socialLinks: z.record(z.string().url()).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(30).optional(),
});

adminSettingsRouter.put("/branding", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const input = brandingSchema.parse(req.body);
    const settings = await prisma.platformSetting.update({ where: { id: "singleton" }, data: { ...input, socialLinks: serializeJson(input.socialLinks) } });

    await prisma.auditLog.create({
      data: { actorId: req.user!.id, action: "PLATFORM_SETTINGS_UPDATED", entity: "PlatformSetting", entityId: "singleton" },
    });

    res.json({ settings: { ...settings, socialLinks: parseJson(settings.socialLinks, {}) } });
  } catch (err) {
    next(err);
  }
});

// --- GitHub connection status (spec section 45) --------------------------
// CRITICAL: this route must NEVER return env.GITHUB_TOKEN or any derivative
// of it. It only reports configuration presence and the last known
// deployment state recorded from real publish jobs (Phase 5).

adminSettingsRouter.get("/github/status", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const settings = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });

    const lastSuccess = await prisma.publishJob.findFirst({
      where: { status: "SUCCESS" },
      orderBy: { finishedAt: "desc" },
    });
    const lastFailure = await prisma.publishJob.findFirst({
      where: { status: "FAILED" },
      orderBy: { finishedAt: "desc" },
    });

    res.json({
      connected: Boolean(env.GITHUB_TOKEN && env.GITHUB_OWNER && env.GITHUB_REPOSITORY),
      owner: settings?.githubOwner ?? env.GITHUB_OWNER ?? null,
      repository: settings?.githubRepository ?? env.GITHUB_REPOSITORY ?? null,
      branch: settings?.githubBranch ?? env.GITHUB_BRANCH,
      lastSuccessfulPublish: lastSuccess
        ? { at: lastSuccess.finishedAt, commitSha: lastSuccess.commitSha }
        : null,
      lastFailedPublish: lastFailure
        ? { at: lastFailure.finishedAt, error: lastFailure.errorMessage }
        : null,
      // token is intentionally never included here
    });
  } catch (err) {
    next(err);
  }
});

const githubConfigSchema = z.object({
  githubOwner: z.string().min(1).optional(),
  githubRepository: z.string().min(1).optional(),
  githubBranch: z.string().min(1).optional(),
});

// Admin can set owner/repo/branch (non-secret metadata); the actual TOKEN
// is only ever set via the server's environment variable, never through
// this or any other HTTP endpoint.
adminSettingsRouter.put("/github/config", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const input = githubConfigSchema.parse(req.body);
    const settings = await prisma.platformSetting.update({ where: { id: "singleton" }, data: input });

    await prisma.auditLog.create({
      data: { actorId: req.user!.id, action: "GITHUB_CONFIG_CHANGED", entity: "PlatformSetting", entityId: "singleton", metadata: serializeJson(input) },
    });

    res.json({ settings: { ...settings, socialLinks: parseJson(settings.socialLinks, {}) } });
  } catch (err) {
    next(err);
  }
});

// "Test connection" button (spec section 45) — makes a real, read-only call
// to GitHub's API using the server-side token and reports ok/failure only.
adminSettingsRouter.post("/github/test", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await testGithubConnection();
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: "GITHUB_CONNECTION_TESTED",
        entity: "PlatformSetting",
        entityId: "singleton",
        metadata: serializeJson({ ok: result.ok }),
      },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Audit logs — admin only, read-only.
adminSettingsRouter.get("/audit-logs", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Number(req.query.pageSize) || 30);

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { actor: { select: { email: true, role: true } } },
      }),
      prisma.auditLog.count(),
    ]);

    res.json({ items: items.map((item) => ({ ...item, metadata: parseJson(item.metadata, {}) })), total, page, pageSize });
  } catch (err) {
    next(err);
  }
});
