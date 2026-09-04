import os from "node:os";
import { resolveBinaries, getCachedBinaries } from "./BinaryResolver.js";
import { getCookiesPath, getCookiesDiagnostics } from "@/security/CookiesDetector.js";
import { getCanaryResult } from "./CookieCanary.js";
import { env } from "@/config/env.js";
import { getYtDlpProxyUrl } from "@/config/env.js";

export async function getSystemReport() {
  let binaries;
  let binariesError: string | null = null;
  try {
    binaries = await resolveBinaries();
  } catch (err) {
    binariesError = (err as Error).message;
    binaries = getCachedBinaries();
  }
  return {
    status: binariesError ? "degraded" : "ok",
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    cpus: os.cpus().length,
    memory: { total: os.totalmem(), free: os.freemem() },
    uptime: process.uptime(),
    youtubeHardening: !!(env.YOUTUBE_USER_AGENT && env.YOUTUBE_VISITOR_DATA && env.YOUTUBE_PO_TOKEN),
    proxyConfigured: !!getYtDlpProxyUrl(),
    binaries: binaries
      ? {
          ytDlp: { path: binaries.ytDlp.path, version: binaries.ytDlp.version },
          ffmpeg: { path: binaries.ffmpeg.path, version: binaries.ffmpeg.version },
          ffprobe: { path: binaries.ffprobe.path, version: binaries.ffprobe.version },
        }
      : null,
    binariesError,
    cookies: {
      detected: !!getCookiesPath(),
      path: getCookiesPath() ?? null,
      canary: getCanaryResult(),
      diagnostics: getCookiesDiagnostics(),
    },
  };
}