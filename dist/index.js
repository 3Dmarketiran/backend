"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const compression_1 = __importDefault(require("compression"));
const pino_http_1 = __importDefault(require("pino-http"));
const node_path_1 = __importDefault(require("node:path"));
const env_1 = require("./config/env");
const logger_1 = require("./utils/logger");
const auth_1 = require("./middleware/auth");
const rateLimit_1 = require("./middleware/rateLimit");
const errorHandler_1 = require("./middleware/errorHandler");
const auth_2 = require("./routes/auth");
const health_1 = require("./routes/health");
const products_1 = require("./routes/products");
const sellers_1 = require("./routes/sellers");
const subscriptions_1 = require("./routes/subscriptions");
const categories_1 = require("./routes/categories");
const analytics_1 = require("./routes/analytics");
const adminSettings_1 = require("./routes/adminSettings");
const publishing_1 = require("./routes/publishing");
// Attaches POST /api/products/:id/publish and /unpublish directly onto the
// products router so the frontend's single publish endpoint (spec section
// 25) lives at the expected path.
(0, publishing_1.mountPublishingOnProducts)(products_1.productsRouter);
const app = (0, express_1.default)();
// --- Security & platform middleware -------------------------------------
app.set("trust proxy", 1); // needed for correct req.ip behind a reverse proxy
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: env_1.env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true, // required for HttpOnly session cookies
}));
app.use((0, compression_1.default)());
app.use(express_1.default.json({ limit: "2mb" }));
app.use((0, cookie_parser_1.default)());
app.use((0, pino_http_1.default)({ logger: logger_1.logger }));
// General API rate limiting; login has its own tighter limiter (see routes/auth.ts).
app.use("/api", rateLimit_1.apiRateLimiter);
// Resolve the session cookie (if any) into req.user before routes run.
app.use(auth_1.attachUser);
// Serves locally-stored uploads when STORAGE_PROVIDER=local (dev only —
// production should point STORAGE_PROVIDER=s3 at a real object store so
// assets don't depend on this process staying up).
app.use("/files", express_1.default.static(node_path_1.default.resolve(process.cwd(), "uploads"), { maxAge: "365d" }));
// --- Routes ---------------------------------------------------------------
app.use("/api/health", health_1.healthRouter);
app.use("/api/auth", auth_2.authRouter);
app.use("/api/products", products_1.productsRouter);
app.use("/api/sellers", sellers_1.sellersRouter);
app.use("/api/subscriptions", subscriptions_1.subscriptionsRouter);
app.use("/api/categories", categories_1.categoriesRouter);
app.use("/api/analytics", analytics_1.analyticsRouter);
app.use("/api/admin", adminSettings_1.adminSettingsRouter);
app.use("/api/publishing", publishing_1.publishingRouter);
app.use(errorHandler_1.notFoundHandler);
app.use(errorHandler_1.errorHandler);
app.listen(env_1.env.PORT, () => {
    logger_1.logger.info(`🚀 Backend API listening on http://localhost:${env_1.env.PORT}`);
    logger_1.logger.info(`   Environment: ${env_1.env.NODE_ENV}`);
});
// Periodically flip overdue ACTIVE subscriptions to EXPIRED (spec section
// 22). Data is never deleted here — only status changes, which the
// public-data generator (Phase 5/6) reads to decide catalog visibility.
// Runs every 15 minutes; also safe to trigger via a real cron job hitting
// a dedicated endpoint in production instead of relying on process uptime.
setInterval(() => {
    (0, subscriptions_1.expireOverdueSubscriptions)()
        .then((count) => {
        if (count > 0)
            logger_1.logger.info(`⏱️  Expired ${count} overdue subscription(s).`);
    })
        .catch((err) => logger_1.logger.error({ err }, "failed to expire subscriptions"));
}, 15 * 60 * 1000);
//# sourceMappingURL=index.js.map