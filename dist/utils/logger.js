"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const pino_1 = __importDefault(require("pino"));
const env_1 = require("../config/env");
exports.logger = (0, pino_1.default)({
    level: env_1.isProduction ? "info" : "debug",
    transport: env_1.isProduction
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
//# sourceMappingURL=logger.js.map