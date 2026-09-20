import { Router } from "express";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { testConnection as testGithubConnection } from "../services/githubService";
import { storage } from "../storage";

export const healthRouter = Router();

// GET /api/health — spec section 44: backend, database, storage, GitHub.
// A plain, unauthenticated liveness/readiness probe (no secrets returned).
// The admin dashboard's System Health page polls this directly.
healthRouter.get("/", async (_req, res) => {
  const startedAt = Date.now();

  let dbStatus: "ok" | "error" = "ok";
  let dbLatencyMs: number | null = null;
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - dbStart;
  } catch {
    dbStatus = "error";
  }

  let storageStatus: "ok" | "error" = "ok";
  try {
    await storage.healthCheck();
  } catch {
    storageStatus = "error";
  }

  // Real network call to GitHub's API (repo read), never returns the token.
  const github = await testGithubConnection();

  const overall = dbStatus === "ok" && storageStatus === "ok" && github.ok ? "ok" : "degraded";

  res.status(overall === "ok" ? 200 : 503).json({
    status: overall,
    uptimeMs: process.uptime() * 1000,
    checkDurationMs: Date.now() - startedAt,
    services: {
      database: { status: dbStatus, latencyMs: dbLatencyMs },
      storage: { provider: env.STORAGE_PROVIDER, status: storageStatus },
      github: { configured: Boolean(env.GITHUB_TOKEN && env.GITHUB_OWNER && env.GITHUB_REPOSITORY), status: github.ok ? "ok" : "error", message: github.message },
    },
  });
});
