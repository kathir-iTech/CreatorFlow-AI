import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { env } from "@/config/env.js";
import { API_PREFIX } from "@/config/constants.js";
import { requestId } from "@/middleware/requestId.js";
import { httpLogger } from "@/logging/httpLogger.js";
import { errorHandler, notFoundHandler } from "@/middleware/error.js";
import { globalRateLimit } from "@/middleware/rateLimit.js";
import { healthRouter } from "@/routes/health.routes.js";
import { infoRouter } from "@/routes/info.routes.js";
import { downloadRouter } from "@/routes/download.routes.js";
import { streamRouter } from "@/routes/stream.routes.js";
import { providersRouter } from "@/routes/providers.routes.js";
import { debugRouter } from "@/routes/debug.routes.js";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(requestId);
  app.use(httpLogger);
  app.use(helmet({ crossOriginResourcePolicy: false }));
  // Render: FRONTEND_ORIGIN takes precedence over CORS_ORIGINS for production.
  // If FRONTEND_ORIGIN is set (e.g. https://creatorflow-ai.vercel.app), only that origin is allowed.
  // Otherwise fallback to CORS_ORIGINS (default "*" for local dev).
  const allowedOrigins = env.FRONTEND_ORIGIN?.trim()
    ? [env.FRONTEND_ORIGIN.trim()]
    : env.CORS_ORIGINS === "*"
      ? true
      : env.CORS_ORIGINS.split(",").map((s) => s.trim());
  app.use(
    cors({
      origin: allowedOrigins as any,
      credentials: false,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: "256kb" }));
  app.use(globalRateLimit);

  // Ops endpoints (unprefixed)
  app.use("/", healthRouter);

  // Versioned API
  app.use(`${API_PREFIX}/info`, infoRouter);
  app.use(`${API_PREFIX}/downloads`, downloadRouter);
  app.use(`${API_PREFIX}/stream`, streamRouter);
  app.use(`${API_PREFIX}/providers`, providersRouter);
  app.use(`${API_PREFIX}/debug`, debugRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}