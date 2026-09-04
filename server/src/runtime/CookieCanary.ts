import { execa } from "execa";
import { resolveBinaries } from "./BinaryResolver.js";
import { getCookiesPath } from "@/security/CookiesDetector.js";
import { detectYoutubeBotCheck } from "@/engines/downloader/BotCheckDetector.js";
import { logger } from "@/logging/logger.js";
import { env } from "@/config/env.js";

// Short, evergreen video used purely as an auth/bot canary.
// Metadata-only probe — no media bytes are downloaded.
const CANARY_URL =
  env.COOKIE_CANARY_URL?.trim() || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

export type CanaryStatus = "ok" | "bot_check" | "stale" | "no_cookies" | "error" | "unknown";

export interface CanaryResult {
  status: CanaryStatus;
  checkedAt: string | null;
  nextCheckAt: string | null;
  message: string;
  durationMs: number | null;
  url: string;
}

let last: CanaryResult = {
  status: "unknown",
  checkedAt: null,
  nextCheckAt: null,
  message: "Canary has not run yet.",
  durationMs: null,
  url: CANARY_URL,
};

let running = false;
let timer: NodeJS.Timeout | null = null;

const INTERVAL_MS = Math.max(
  15 * 60_000,
  Number(env.COOKIE_CANARY_INTERVAL_MS) || 6 * 60 * 60_000, // default 6h
);

export function getCanaryResult(): CanaryResult {
  return last;
}

export async function runCanary(): Promise<CanaryResult> {
  if (running) return last;
  running = true;
  const startedAt = Date.now();
  const cookies = getCookiesPath();
  try {
    const bins = await resolveBinaries();
    const args = [
      "--simulate",
      "--skip-download",
      "--no-warnings",
      "--dump-single-json",
      "--socket-timeout",
      "15",
      "--retries",
      "1",
    ];
    if (cookies) args.push("--cookies", cookies);
    args.push(CANARY_URL);

    const proc = await execa(bins.ytDlp.path, args, {
      timeout: 30_000,
      reject: false,
      all: true,
    });
    const out = `${proc.stdout ?? ""}\n${proc.stderr ?? ""}`;

    let status: CanaryStatus;
    let message: string;
    if (proc.exitCode === 0) {
      // Only treat as truly healthy when an authenticated probe succeeded.
      // An anonymous probe says nothing about whether restricted downloads
      // will work — surface that as `no_cookies` so the UI flags a warning
      // instead of a misleading green pill.
      if (cookies) {
        status = "ok";
        message = "Authenticated probe succeeded — cookies are valid.";
      } else {
        status = "no_cookies";
        message =
          "Anonymous probe succeeded, but no cookies.txt is configured. Restricted videos will fail with BOT_CHECK. Add COOKIES_TXT_BASE64 in Railway.";
      }
    } else if (detectYoutubeBotCheck(out, "youtube").isBotCheck) {
      status = cookies ? "stale" : "bot_check";
      message = cookies
        ? "YouTube rejected the cookies — session is stale. Re-export cookies.txt and update COOKIES_TXT_BASE64."
        : "YouTube is requiring verification. Add cookies.txt via COOKIES_TXT_BASE64 to bypass.";
    } else if (!cookies) {
      status = "no_cookies";
      message = "Probe failed and no cookies are configured.";
    } else {
      status = "error";
      message = (out.split(/\r?\n/).find((l) => /ERROR/i.test(l)) || "yt-dlp exited with a non-zero status.").trim();
    }

    last = {
      status,
      checkedAt: new Date().toISOString(),
      nextCheckAt: new Date(Date.now() + INTERVAL_MS).toISOString(),
      message,
      durationMs: Date.now() - startedAt,
      url: CANARY_URL,
    };
    logger.info({ canary: last }, "cookie canary completed");
  } catch (err) {
    last = {
      status: "error",
      checkedAt: new Date().toISOString(),
      nextCheckAt: new Date(Date.now() + INTERVAL_MS).toISOString(),
      message: (err as Error).message || "Canary probe failed.",
      durationMs: Date.now() - startedAt,
      url: CANARY_URL,
    };
    logger.warn({ err }, "cookie canary failed");
  } finally {
    running = false;
  }
  return last;
}

export function startCookieCanary(): void {
  if (timer) return;
  // Defer first run so boot stays fast.
  setTimeout(() => {
    void runCanary();
  }, 20_000).unref?.();
  timer = setInterval(() => {
    void runCanary();
  }, INTERVAL_MS);
  timer.unref?.();
  logger.info({ intervalMs: INTERVAL_MS, url: CANARY_URL }, "cookie canary scheduled");
}