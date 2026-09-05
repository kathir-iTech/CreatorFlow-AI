import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { getYtDlpProxyUrl } from "./config/env.js";
import { logger } from "./logging/logger.js";
import { resolveBinaries } from "./runtime/BinaryResolver.js";
import { ensureLatestYtDlp } from "./runtime/YtDlpUpdater.js";
import { detectCookiesPath } from "./security/CookiesDetector.js";
import { ensureTmpRoot } from "./utils/tmp.js";
import { cleanupService } from "./services/CleanupService.js";
import { startCookieCanary } from "./runtime/CookieCanary.js";
import { probePotProvider } from "./runtime/PotProviderProbe.js";

function getProxyStatus(url?: string) {
  if (!url) return { configured: false as const };
  try {
    const u = new URL(url);
    return { configured: true as const, protocol: u.protocol, hostname: u.hostname, port: u.port ? Number(u.port) : undefined };
  } catch {
    return { configured: true as const, protocol: "invalid", hostname: "invalid" };
  }
}

async function main(): Promise<void> {
  // The literal "BUILD MARKER" string below is load-bearing: server/Dockerfile
  // greps dist/server.js for it as a build gate. Keep the literal intact
  // (a plain logger call, not console.log) or Render builds will fail.
  logger.info(
    {
      buildMarker: "BUILD MARKER",
      node: process.version,
      platform: process.platform,
      env: env.NODE_ENV,
      gitCommit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "unknown",
    },
    "Booting MediaHub Pro API",
  );

  await ensureTmpRoot();
  detectCookiesPath();

  await ensureLatestYtDlp();

  try {
    await resolveBinaries();
  } catch (err) {
    logger.error(
      { err },
      "Required binaries are missing. The server will start but /readyz will fail until they are installed.",
    );
  }

  cleanupService.start();
  startCookieCanary();

  const youtubeHardening = !!(env.YOUTUBE_USER_AGENT && env.YOUTUBE_VISITOR_DATA && env.YOUTUBE_PO_TOKEN);
  const missingHardening = [
    !env.YOUTUBE_USER_AGENT && "YOUTUBE_USER_AGENT",
    !env.YOUTUBE_VISITOR_DATA && "YOUTUBE_VISITOR_DATA",
    !env.YOUTUBE_PO_TOKEN && "YOUTUBE_PO_TOKEN",
  ].filter(Boolean);
  logger.info(
    { youtubeHardening, missingHardening },
    `YouTube hardening ${youtubeHardening ? "enabled" : "disabled"}`,
  );

  const proxyStatus = getProxyStatus(getYtDlpProxyUrl());
  logger.info(
    { proxyConfigured: proxyStatus.configured, proxyProtocol: proxyStatus.protocol, proxyHostname: proxyStatus.hostname, proxyPort: proxyStatus.port },
    `Download proxy ${proxyStatus.configured ? "configured" : "not configured"}`,
  );

  // PO-token sidecar check — LOUD by design. A missing/unreachable sidecar
  // used to fail silently (yt-dlp fell back to no-token extraction and died
  // with generic 403s). This line tells every deploy's story in the logs.
  try {
    const pot = await probePotProvider();
    if (pot.reachable) {
      logger.info(
        { url: pot.url, status: pot.status, body: pot.bodyPreview },
        "PO token sidecar reachable — YouTube extraction has token support",
      );
    } else {
      logger.warn(
        { url: pot.url, error: pot.errorMessage },
        "PO token sidecar NOT reachable — YouTube extraction will likely fail with 403s",
      );
    }
  } catch (err) {
    logger.warn({ err }, "PO token sidecar probe crashed");
  }

  // Part 2 — runtime verification WITHOUT printing the key itself. A missing
  // key used to surface only when a user hit captions/SEO; now it's visible
  // in the Render logs immediately on every deploy/boot.
  const groqConfigured = !!env.GROQ_API_KEY?.trim();
  if (groqConfigured) {
    logger.info("GROQ_API_KEY is set — Whisper caption fallback and SEO generation enabled.");
  } else {
    logger.warn("GROQ_API_KEY not set — Whisper caption fallback and SEO generation will fail.");
  }

  const app = createApp();
  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info({ host: env.HOST, port: env.PORT }, "HTTP server listening");
  });

  const shutdown = (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Shutting down...");
    cleanupService.stop();
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
    setTimeout(() => {
      logger.warn("Force exit after 10s");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  process.on("uncaughtException", (err) => logger.fatal({ err }, "uncaughtException"));
  process.on("unhandledRejection", (err) => logger.fatal({ err }, "unhandledRejection"));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal boot error:", err);
  process.exit(1);
});