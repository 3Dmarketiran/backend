import pino from "pino";
import { isProduction } from "../config/env";

export const logger = pino({
  level: isProduction ? "info" : "debug",
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:standard" },
      },
  redact: {
    // Defense in depth: never let a stray log line leak secrets even if a
    // caller accidentally passes a token/password object.
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "password",
      "passwordHash",
      "*.password",
      "*.passwordHash",
      "*.githubToken",
      "*.GITHUB_TOKEN",
    ],
    censor: "[REDACTED]",
  },
});
