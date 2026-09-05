import { Router } from "express";
import { getSystemReport } from "@/runtime/SystemReport.js";
import { resolveBinaries } from "@/runtime/BinaryResolver.js";
import { runCanary } from "@/runtime/CookieCanary.js";
import { resetCookiesDetection, detectCookiesPath } from "@/security/CookiesDetector.js";
import { getMetricsSnapshot } from "@/middleware/metrics.js";

export const healthRouter = Router();

// Render injects RENDER_GIT_COMMIT at build time; Docker passes it through.
// Lets us confirm EXACTLY which commit is live during testing.
const GIT_COMMIT = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "unknown";
const BOOT_TIME = new Date().toISOString();

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
    gitCommit: GIT_COMMIT,
    bootTime: BOOT_TIME,
    uptimeSec: Math.round(process.uptime()),
    node: process.version,
  });
});

// In-memory request/error/latency counters since boot (Part 12). Not linked
// from the UI — for the operator during the demo period.
healthRouter.get("/metrics", (_req, res) => {
  res.json({ data: getMetricsSnapshot(), requestId: _req.id });
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