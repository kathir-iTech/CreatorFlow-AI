import which from "which";
import { execa } from "execa";
import path from "node:path";
import { existsSync } from "node:fs";
import { env } from "@/config/env.js";
import { logger } from "@/logging/logger.js";
import { BinaryMissingError } from "@/errors/AppError.js";

export interface ResolvedBinary {
  name: string;
  path: string;
  version: string;
}

const LOCAL_BIN_DIR = path.resolve("./bin");

const COMMON_PATHS: Record<NodeJS.Platform, string[]> = {
  linux: ["/usr/bin", "/usr/local/bin", "/snap/bin", "/root/.local/bin", "/home/runner/.local/bin"],
  darwin: ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"],
  win32: [
    "C:\\ProgramData\\chocolatey\\bin",
    "C:\\Program Files\\ffmpeg\\bin",
    "C:\\Program Files (x86)\\ffmpeg\\bin",
  ],
  aix: [],
  android: [],
  freebsd: [],
  haiku: [],
  openbsd: [],
  sunos: [],
  cygwin: [],
  netbsd: [],
};

const INSTALL_HINTS: Record<string, string> = {
  "yt-dlp":
    "Install via: pip install -U yt-dlp  |  brew install yt-dlp  |  choco install yt-dlp  |  or drop the standalone binary into ./bin/",
  ffmpeg:
    "Install via: apt install ffmpeg  |  brew install ffmpeg  |  choco install ffmpeg  |  or drop a static build into ./bin/",
  ffprobe:
    "ffprobe ships with ffmpeg. Install ffmpeg or drop ffprobe into ./bin/",
};

function exe(name: string): string {
  return process.platform === "win32" && !name.endsWith(".exe") ? `${name}.exe` : name;
}

async function tryPath(p: string): Promise<string | null> {
  return existsSync(p) ? p : null;
}

async function probeVersion(binPath: string, name: string): Promise<string> {
  // ffmpeg/ffprobe use `-version` (single dash); yt-dlp uses `--version`.
  const flags = name === "yt-dlp" ? ["--version"] : ["-version", "--version"];
  let lastErr: unknown;
  for (const flag of flags) {
    try {
      const { stdout } = await execa(binPath, [flag], { timeout: 10_000, reject: false });
      const first = (stdout || "").split(/\r?\n/)[0] ?? "";
      if (first.trim()) return first.trim();
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `Failed to probe ${name} at ${binPath}: ${(lastErr as Error)?.message ?? "no output"}`,
  );
}

async function resolveOne(name: string, override?: string): Promise<ResolvedBinary> {
  const binName = exe(name);

  // 1. Explicit env override
  if (override) {
    const abs = path.resolve(override);
    const found = await tryPath(abs);
    if (!found) throw BinaryMissingError(name, `Override path does not exist: ${override}`);
    return { name, path: abs, version: await probeVersion(abs, name) };
  }

  // 2. Project-local ./bin
  const localBin = path.join(LOCAL_BIN_DIR, binName);
  const local = await tryPath(localBin);
  if (local) {
    const abs = path.resolve(local);
    return { name, path: abs, version: await probeVersion(abs, name) };
  }

  // 3. PATH lookup
  const fromPath = await which(name, { nothrow: true });
  if (fromPath) return { name, path: fromPath, version: await probeVersion(fromPath, name) };

  // 4. Common platform paths
  const candidates = COMMON_PATHS[process.platform] ?? [];
  for (const dir of candidates) {
    const candidate = path.join(dir, binName);
    const found = await tryPath(candidate);
    if (found) return { name, path: found, version: await probeVersion(found, name) };
  }

  throw BinaryMissingError(name, INSTALL_HINTS[name] ?? "Please install it and restart.");
}

export interface RuntimeBinaries {
  ytDlp: ResolvedBinary;
  ffmpeg: ResolvedBinary;
  ffprobe: ResolvedBinary;
}

let cached: RuntimeBinaries | null = null;
let cachedError: Error | null = null;

export async function resolveBinaries(force = false): Promise<RuntimeBinaries> {
  if (!force && cached) return cached;
  if (!force && cachedError) throw cachedError;
  try {
    const [ytDlp, ffmpeg, ffprobe] = await Promise.all([
      resolveOne("yt-dlp", env.YTDLP_PATH),
      resolveOne("ffmpeg", env.FFMPEG_PATH),
      resolveOne("ffprobe", env.FFPROBE_PATH),
    ]);
    cached = { ytDlp, ffmpeg, ffprobe };
    cachedError = null;
    logger.info(
      {
        ytDlp: ytDlp.path,
        ytDlpVersion: ytDlp.version,
        ffmpeg: ffmpeg.path,
        ffmpegVersion: ffmpeg.version,
        ffprobe: ffprobe.path,
      },
      "Runtime binaries resolved",
    );
    return cached;
  } catch (err) {
    cachedError = err as Error;
    logger.error({ err }, "Failed to resolve runtime binaries");
    throw err;
  }
}

export function getCachedBinaries(): RuntimeBinaries | null {
  return cached;
}