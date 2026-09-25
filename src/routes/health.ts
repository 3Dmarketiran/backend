import { Router } from "express";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { testConnection as testGithubConnection } from "../services/githubService";
import { storage } from "../storage";

export const healthRouter = Router();

// GET /api/health/live — a real liveness probe: no DB, no storage, no
// outbound network calls. Just "is the Node process up and answering
// HTTP requests". Point Render's own Health Check Path at THIS route,
// not at "/" below — a probe that depends on the database or GitHub's
// API means a slow/rate-limited third party can make Render think the
// whole service is down and restart it, causing real outages for an
// otherwise-healthy backend.
healthRouter.get("/live", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// GET /api/health — spec section 44: backend, database, storage, GitHub.
// A plain, unauthenticated liveness/readiness probe (no secrets returned).
// The admin dashboard's System Health page polls this directly.
healthRouter.get("/", async (_req, res) => {
  const startedAt = Date.now();

  // Run all three checks in parallel instead of one after another.
  // Sequential awaits meant total latency was DB + storage + GitHub added
  // together; if any one was slow, the whole health check (and anything
  // polling it, including Render's own health checks) paid the full cost.
  const [dbResult, storageResult, github] = await Promise.all([
    (async () => {
      const dbStart = Date.now();
      try {
        await prisma.$queryRaw`SELECT 1`;
        return { status: "ok" as const, latencyMs: Date.now() - dbStart };
      } catch {
        return { status: "error" as const, latencyMs: null };
      }
    })(),
    (async () => {
      try {
        await storage.healthCheck();
        return "ok" as const;
      } catch {
        return "error" as const;
      }
    })(),
    testGithubConnection(),
  ]);

  const dbStatus = dbResult.status;
  const dbLatencyMs = dbResult.latencyMs;
  const storageStatus = storageResult;

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
