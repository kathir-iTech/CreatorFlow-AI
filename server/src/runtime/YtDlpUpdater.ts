import { mkdir, chmod, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execa } from "execa";
import which from "which";
import { env } from "@/config/env.js";
import { logger } from "@/logging/logger.js";

const NIGHTLY_URL =
  "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp";

/**
 * Wipes any stale yt-dlp binary in ./bin/ and downloads the latest nightly
 * build from the yt-dlp/yt-dlp-nightly-builds GitHub release. The fresh
 * binary is dropped at ./bin/yt-dlp so BinaryResolver picks it up before
 * the OS-packaged version on PATH.
 *
 * Controlled by YTDLP_AUTO_UPDATE (default: enabled). Failure to update
 * is logged but non-fatal — the resolver will fall back to PATH.
 */
export async function ensureLatestYtDlp(): Promise<void> {
  if (process.env.YTDLP_AUTO_UPDATE === "false") {
    logger.info("yt-dlp auto-update disabled via YTDLP_AUTO_UPDATE=false");
    return;
  }
  if (process.platform === "win32") {
    logger.info("Skipping yt-dlp auto-update on win32 (use installer)");
    return;
  }

  const binDir = path.resolve("./bin");
  const target = path.join(binDir, "yt-dlp");

  try {
    await mkdir(binDir, { recursive: true });

    // Wipe legacy/stale binary so we never accidentally execute it.
    if (existsSync(target)) {
      await rm(target, { force: true });
      logger.info({ target }, "Removed legacy yt-dlp binary before refresh");
    }

    // Prefer the Python package + bgutil PO-token provider plugin so the
    // bgutil sidecar HTTP server is automatically consulted for tokens.
    // NOTE: --pre tracks the NIGHTLY channel (same policy as the Dockerfile).
    // Without it, every reboot would DOWNGRADE a nightly binary back to the
    // older stable release — exactly the staleness this updater exists to fix.
    try {
      logger.info("Upgrading yt-dlp + bgutil-ytdlp-pot-provider via pip (nightly channel)");
      await execa("python3", [
        "-m",
        "pip",
        "install",
        "--break-system-packages",
        "-U",
        "--pre",
        "yt-dlp",
        "bgutil-ytdlp-pot-provider",
      ], { timeout: 180_000 });
      const pipYtDlp = await which("yt-dlp", { nothrow: true });
      if (pipYtDlp) {
        const { stdout } = await execa(pipYtDlp, ["--version"], { timeout: 15_000 });
        process.env.YTDLP_PATH = pipYtDlp;
        (env as { YTDLP_PATH?: string }).YTDLP_PATH = process.env.YTDLP_PATH;
        logger.info({ target: pipYtDlp, version: stdout.trim() }, "yt-dlp pip package installed with bgutil PO-token plugin");
        return;
      }
    } catch (pipErr) {
      logger.warn(
        { err: (pipErr as Error).message },
        "pip yt-dlp/plugin upgrade failed; falling back to standalone nightly",
      );
    }

    logger.info({ url: NIGHTLY_URL, target }, "Downloading latest yt-dlp nightly");
    const started = Date.now();
    const res = await fetch(NIGHTLY_URL, { redirect: "follow" });
    if (!res.ok || !res.body) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100_000) {
      throw new Error(`Downloaded yt-dlp is suspiciously small (${buf.length} bytes)`);
    }
    await writeFile(target, buf);
    await chmod(target, 0o755);
    const size = (await stat(target)).size;

    // Probe the new binary so we know it actually runs in this runtime.
    const { stdout } = await execa(target, ["--version"], { timeout: 15_000 });
    const version = stdout.trim();

    // Force resolver/PATH consumers to use our refreshed copy.
    process.env.YTDLP_PATH = target;

    logger.info(
      { target, version, sizeBytes: size, durationMs: Date.now() - started },
      "yt-dlp nightly installed",
    );
  } catch (err) {
    logger.error(
      { err: (err as Error).message },
      "yt-dlp nightly auto-update failed — falling back to system binary",
    );
  }

  // env was parsed before this ran; keep the typed copy in sync.
  if (process.env.YTDLP_PATH) {
    (env as { YTDLP_PATH?: string }).YTDLP_PATH = process.env.YTDLP_PATH;
  }
}