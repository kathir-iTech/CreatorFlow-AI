import { Router } from "express";
import { getSystemReport } from "@/runtime/SystemReport.js";
import { resolveBinaries } from "@/runtime/BinaryResolver.js";
import { runCanary } from "@/runtime/CookieCanary.js";
import { resetCookiesDetection, detectCookiesPath } from "@/security/CookiesDetector.js";

export const healthRouter = Router();

// Render keep-alive endpoint — pinged by cron-job.org every 10 min to prevent free-tier spindown
healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "creatorflow-ai", uptime: process.uptime() });
});

healthRouter.get("/healthz", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

healthRouter.get("/readyz", async (_req, res) => {
  try {
    await resolveBinaries();
    res.json({ status: "ready" });
  } catch (err) {
    res.status(503).json({
      status: "not_ready",
      error: (err as Error).message,
    });
  }
});

healthRouter.get("/version", (_req, res) => {
  res.json({
    name: "mediahub-pro-api",
    version: process.env.npm_package_version ?? "0.0.0",
    node: process.version,
  });
});

healthRouter.get("/system", async (_req, res, next) => {
  try {
    res.json({ data: await getSystemReport() });
  } catch (err) {
    next(err);
  }
});

// Manually trigger the cookie freshness canary. Useful right after updating
// COOKIES_TXT_BASE64 on Railway to confirm the new session works.
healthRouter.post("/system/cookies/recheck", async (_req, res, next) => {
  try {
    // Force re-detection so a freshly-updated COOKIES_TXT_BASE64 env var is
    // picked up immediately (otherwise the boot-time result is cached).
    resetCookiesDetection();
    detectCookiesPath();
    const result = await runCanary();
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});