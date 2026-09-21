import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";
import pinoHttp from "pino-http";
import path from "node:path";

import { env } from "./config/env";
import { logger } from "./utils/logger";
import { attachUser } from "./middleware/auth";
import { apiRateLimiter } from "./middleware/rateLimit";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

import { authRouter } from "./routes/auth";
import { healthRouter } from "./routes/health";
import { productsRouter } from "./routes/products";
import { sellersRouter } from "./routes/sellers";
import { subscriptionsRouter, expireOverdueSubscriptions } from "./routes/subscriptions";
import { categoriesRouter } from "./routes/categories";
import { analyticsRouter } from "./routes/analytics";
import { adminSettingsRouter } from "./routes/adminSettings";
import { publishingRouter, mountPublishingOnProducts } from "./routes/publishing";

// Attaches POST /api/products/:id/publish and /unpublish directly onto the
// products router so the frontend's single publish endpoint (spec section
// 25) lives at the expected path.
mountPublishingOnProducts(productsRouter);

const app = express();

// --- Security & platform middleware -------------------------------------
app.set("trust proxy", 1); // needed for correct req.ip behind a reverse proxy
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(pinoHttp({ logger }));

// General API rate limiting; login has its own tighter limiter (see routes/auth.ts).
app.use("/api", apiRateLimiter);

// Resolve the session cookie (if any) into req.user before routes run.
app.use(attachUser);

// Serves locally-stored uploads when STORAGE_PROVIDER=local (dev only —
// production should point STORAGE_PROVIDER=s3 at a real object store so
// assets don't depend on this process staying up).
app.use("/files", express.static(path.resolve(process.cwd(), "uploads"), { maxAge: "365d" }));

// --- Routes ---------------------------------------------------------------
app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/products", productsRouter);
app.use("/api/sellers", sellersRouter);
app.use("/api/subscriptions", subscriptionsRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/admin", adminSettingsRouter);
app.use("/api/publishing", publishingRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info(`🚀 Backend API listening on http://localhost:${env.PORT}`);
  logger.info(`   Environment: ${env.NODE_ENV}`);
});

// Periodically flip overdue ACTIVE subscriptions to EXPIRED (spec section
// 22). Data is never deleted here — only status changes, which the
// public-data generator (Phase 5/6) reads to decide catalog visibility.
// Runs every 15 minutes; also safe to trigger via a real cron job hitting
// a dedicated endpoint in production instead of relying on process uptime.
setInterval(() => {
  expireOverdueSubscriptions()
    .then((count) => {
      if (count > 0) logger.info(`⏱️  Expired ${count} overdue subscription(s).`);
    })
    .catch((err) => logger.error({ err }, "failed to expire subscriptions"));
}, 15 * 60 * 1000);
