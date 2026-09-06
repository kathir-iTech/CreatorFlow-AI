import pino from "pino";
import { env, isDev } from "@/config/env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "creatorflow-api" },
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "*.cookies",
      "*.cookie",
      "headers.cookie",
    ],
    censor: "[redacted]",
  },
  transport: isDev
    ? {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:HH:MM:ss.l", ignore: "pid,hostname" },
      }
    : undefined,
});

export type Logger = typeof logger;
