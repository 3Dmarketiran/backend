import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "../utils/logger";
import { isProduction } from "../config/env";
import { AuthError } from "../services/authService";

export class HttpError extends Error {
  constructor(public statusCode: number, message: string, public details?: unknown) {
    super(message);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // Log full detail server-side always.
  logger.error({ err, path: req.path, method: req.method }, "request error");

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "ورودی نامعتبر است.",
      details: err.flatten().fieldErrors,
    });
  }

  if (err instanceof AuthError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({ error: err.message, details: err.details });
  }

  // Unknown error: never leak stack traces or internals to the client,
  // especially in production.
  const message = "خطای داخلی سرور رخ داد.";
  res.status(500).json({
    error: message,
    ...(isProduction ? {} : { debug: err instanceof Error ? err.message : String(err) }),
  });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: "مسیر یافت نشد." });
}
