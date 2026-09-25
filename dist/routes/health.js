"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const env_1 = require("../config/env");
const githubService_1 = require("../services/githubService");
const storage_1 = require("../storage");
exports.healthRouter = (0, express_1.Router)();
// GET /api/health — spec section 44: backend, database, storage, GitHub.
// A plain, unauthenticated liveness/readiness probe (no secrets returned).
// The admin dashboard's System Health page polls this directly.
exports.healthRouter.get("/", async (_req, res) => {
    const startedAt = Date.now();
    let dbStatus = "ok";
    let dbLatencyMs = null;
    try {
        const dbStart = Date.now();
        await prisma_1.prisma.$queryRaw `SELECT 1`;
        dbLatencyMs = Date.now() - dbStart;
    }
    catch {
        dbStatus = "error";
    }
    let storageStatus = "ok";
    try {
        await storage_1.storage.healthCheck();
    }
    catch {
        storageStatus = "error";
    }
    // Real network call to GitHub's API (repo read), never returns the token.
    const github = await (0, githubService_1.testConnection)();
    const overall = dbStatus === "ok" && storageStatus === "ok" && github.ok ? "ok" : "degraded";
    res.status(overall === "ok" ? 200 : 503).json({
        status: overall,
        uptimeMs: process.uptime() * 1000,
        checkDurationMs: Date.now() - startedAt,
        services: {
            database: { status: dbStatus, latencyMs: dbLatencyMs },
            storage: { provider: env_1.env.STORAGE_PROVIDER, status: storageStatus },
            github: { configured: Boolean(env_1.env.GITHUB_TOKEN && env_1.env.GITHUB_OWNER && env_1.env.GITHUB_REPOSITORY), status: github.ok ? "ok" : "error", message: github.message },
        },
    });
});
//# sourceMappingURL=health.js.map