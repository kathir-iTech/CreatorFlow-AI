import rateLimit from "express-rate-limit";
import { env } from "@/config/env.js";

export const globalRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    data: null,
    error: { code: "RATE_LIMITED", message: "Too many requests, slow down." },
  },
});

export const downloadRateLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    data: null,
    error: { code: "RATE_LIMITED", message: "Too many download requests." },
  },
});