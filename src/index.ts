import "dotenv/config";

import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { rateLimit } from "express-rate-limit";

import { env, isProduction } from "./config/env";
import { prisma } from "./config/prisma";
import { attachUser } from "./middleware/auth";
import { apiRateLimiter } from "./middleware/rateLimit";

import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { productsRouter } from "./routes/products";
import { sellersRouter } from "./routes/sellers";
import { subscriptionsRouter } from "./routes/subscriptions";
import { categoriesRouter } from "./routes/categories";
import { analyticsRouter } from "./routes/analytics";
import { adminSettingsRouter } from "./routes/adminSettings";
import { publishingRouter, mountPublishingOnProducts } from "./routes/publishing";

import { expireOverdueSubscriptions } from "./routes/subscriptions";

const app = express();

const PORT = env.PORT;

app.disable("x-powered-by");

if (isProduction) {
  app.set("trust proxy", 1);
} else {
  app.set("trust proxy", 1);
}

/* -------------------------------------------------------------------------- */
/* CORS                                                                       */
/* -------------------------------------------------------------------------- */

const allowedOrigins = env.CORS_ORIGIN
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin?: string) {
  if (!origin) return true;

  return allowedOrigins.includes(origin);
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin is not allowed by CORS."));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
    ],
    exposedHeaders: ["Content-Length", "Content-Range"],
    maxAge: 86400,
  }),
);

/* -------------------------------------------------------------------------- */
/* Security headers                                                           */
/* -------------------------------------------------------------------------- */

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
    referrerPolicy: {
      policy: "strict-origin-when-cross-origin",
    },
    frameguard: {
      action: "deny",
    },
    hidePoweredBy: true,
    noSniff: true,
    xssFilter: false,
  }),
);

/* -------------------------------------------------------------------------- */
/* Compression                                                                */
/* -------------------------------------------------------------------------- */

app.use(
  compression({
    threshold: 1024,
  }),
);

/* -------------------------------------------------------------------------- */
/* Logging                                                                    */
/* -------------------------------------------------------------------------- */

app.use(
  pinoHttp({
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers['set-cookie']",
      ],
      censor: "[REDACTED]",
    },
    customLogLevel(_req, res, err) {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
  }),
);

/* -------------------------------------------------------------------------- */
/* Parsers                                                                    */
/* -------------------------------------------------------------------------- */

app.use(cookieParser());

app.use(
  express.json({
    limit: "2mb",
    strict: true,
  }),
);

app.use(
  express.urlencoded({
    extended: false,
    limit: "1mb",
  }),
);

/* -------------------------------------------------------------------------- */
/* General API rate limiting                                                  */
/* -------------------------------------------------------------------------- */

app.use("/api", apiRateLimiter);

/* -------------------------------------------------------------------------- */
/* Additional lightweight protection for sensitive API surfaces               */
/* -------------------------------------------------------------------------- */

const sensitiveApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isProduction ? 300 : 1000,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.",
  },
  skip: () => !isProduction,
});

app.use(
  [
    "/api/products",
    "/api/sellers",
    "/api/subscriptions",
    "/api/categories",
    "/api/publishing",
    "/api/admin",
  ],
  sensitiveApiLimiter,
);

/* -------------------------------------------------------------------------- */
/* Authentication                                                             */
/* -------------------------------------------------------------------------- */

app.use("/api", attachUser);

/* -------------------------------------------------------------------------- */
/* Public/local storage                                                       */
/* -------------------------------------------------------------------------- */

if (env.STORAGE_PROVIDER === "local") {
  app.use(
    "/files",
    express.static("uploads", {
      maxAge: isProduction ? "365d" : 0,
      immutable: isProduction,
      fallthrough: false,
      dotfiles: "deny",
      index: false,
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Health                                                                     */
/* -------------------------------------------------------------------------- */

app.use("/api/health", healthRouter);

/* -------------------------------------------------------------------------- */
/* API routes                                                                 */
/* -------------------------------------------------------------------------- */

app.use("/api/auth", authRouter);
mountPublishingOnProducts(productsRouter);
app.use("/api/products", productsRouter);
app.use("/api/sellers", sellersRouter);
app.use("/api/subscriptions", subscriptionsRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/admin", adminSettingsRouter);
app.use("/api/publishing", publishingRouter);

/* -------------------------------------------------------------------------- */
/* API 404                                                                    */
/* -------------------------------------------------------------------------- */

app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({
    error: "مسیر API پیدا نشد.",
  });
});

/* -------------------------------------------------------------------------- */
/* Global error handler                                                       */
/* -------------------------------------------------------------------------- */

app.use(
  (
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    const logger = req.log;

    if (err instanceof Error) {
      logger.error(
        {
          err,
          method: req.method,
          url: req.originalUrl,
        },
        "Unhandled request error",
      );
    } else {
      logger.error(
        {
          error: err,
          method: req.method,
          url: req.originalUrl,
        },
        "Unhandled request error",
      );
    }

    if (res.headersSent) {
      return;
    }

    const message =
      isProduction
        ? "خطای داخلی سرور رخ داد."
        : err instanceof Error
          ? err.message
          : "خطای داخلی سرور رخ داد.";

    res.status(500).json({
      error: message,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* HTTP server                                                                */
/* -------------------------------------------------------------------------- */

const server = app.listen(PORT, () => {
  console.log(
    `[server] API listening on http://localhost:${PORT}`,
  );

  console.log(
    `[server] environment=${env.NODE_ENV} storage=${env.STORAGE_PROVIDER}`,
  );
});

/* -------------------------------------------------------------------------- */
/* Subscription expiration                                                    */
/* -------------------------------------------------------------------------- */

let subscriptionInterval: NodeJS.Timeout | undefined;

async function runSubscriptionExpiration() {
  try {
    const result = await expireOverdueSubscriptions();

    if (result > 0) {
      console.log(
        `[subscriptions] expired ${result} overdue subscription(s)`,
      );
    }
  } catch (error) {
    console.error(
      "[subscriptions] failed to expire overdue subscriptions",
      error,
    );
  }
}

/*
 * Run once shortly after startup and then periodically.
 *
 * This is intentionally kept as a lightweight safety mechanism.
 * In production, an external scheduler/cron can also call the same
 * lifecycle operation if the deployment platform supports it.
 */
void runSubscriptionExpiration();

subscriptionInterval = setInterval(
  () => {
    void runSubscriptionExpiration();
  },
  15 * 60 * 1000,
);

/* -------------------------------------------------------------------------- */
/* Graceful shutdown                                                          */
/* -------------------------------------------------------------------------- */

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;

  shuttingDown = true;

  console.log(`[server] received ${signal}; shutting down...`);

  if (subscriptionInterval) {
    clearInterval(subscriptionInterval);
    subscriptionInterval = undefined;
  }

  server.close(async (serverError) => {
    if (serverError) {
      console.error(
        "[server] failed to close HTTP server cleanly",
        serverError,
      );
    }

    try {
      await prisma.$disconnect();
      console.log("[server] database connection closed");
    } catch (error) {
      console.error(
        "[server] failed to close database connection",
        error,
      );
    }

    process.exit(serverError ? 1 : 0);
  });

  /*
   * Do not keep the process hanging forever if an external connection
   * or long-running request prevents the server from closing.
   */
  setTimeout(() => {
    console.error(
      "[server] graceful shutdown timed out; forcing exit",
    );

    process.exit(1);
  }, 15_000).unref();
}

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

/* -------------------------------------------------------------------------- */
/* Process-level error handling                                               */
/* -------------------------------------------------------------------------- */

process.on("unhandledRejection", (reason) => {
  console.error(
    "[process] unhandled promise rejection",
    reason,
  );
});

process.on("uncaughtException", (error) => {
  console.error("[process] uncaught exception", error);

  /*
   * An uncaught exception can leave the application in an unknown state.
   * Shut down cleanly and let the process manager restart it.
   */
  void shutdown("uncaughtException");
});

export default app;
