import { execa } from "execa";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import which from "which";
import { env } from "@/config/env.js";
import { logger } from "@/logging/logger.js";
import { AppError } from "@/errors/AppError.js";
import { getCookiesPathFor } from "@/security/CookiesDetector.js";
import { ytDlpEngine } from "@/engines/downloader/YtDlpEngine.js";
import { createJobDir, safeRemove } from "@/utils/tmp.js";

const MAX_SECONDS = 120; // cap to 2 minutes for very long videos
const FRAME_COUNT = 6;

async function resolveFfmpegOnly(): Promise<string | null> {
  if (env.FFMPEG_PATH) return env.FFMPEG_PATH;
  return which("ffmpeg", { nothrow: true });
}

async function resolveFfprobeOnly(): Promise<string | null> {
  if (env.FFPROBE_PATH) return env.FFPROBE_PATH;
  return which("ffprobe", { nothrow: true });
}

async function getDurationSec(filePath: string): Promise<number> {
  const ffprobePath = await resolveFfprobeOnly();
  if (!ffprobePath) {
    // Fallback: assume 60 seconds if ffprobe unavailable
    return 60;
  }
  try {
    const res = await execa(
      ffprobePath,
      ["-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", filePath],
      { timeout: 15_000, reject: false },
    );
    const val = parseFloat((res.stdout ?? "").trim());
    return Number.isFinite(val) && val > 0 ? val : 60;
  } catch {
    return 60;
  }
}

export interface ThumbnailFrame {
  index: number;
  timeSec: number;
  base64: string;
  mime: string;
}

export interface ThumbnailsResult {
  videoId: string;
  frames: ThumbnailFrame[];
  capped: boolean;
  durationSec: number;
}

export async function extractThumbnails(videoUrl: string): Promise<ThumbnailsResult> {
  const workDir = await createJobDir(`thumbs-`);
  try {
    // 1. Download the video via yt-dlp (use existing engine for cookies/auth)
    const cookiesPath = await getCookiesPathFor("youtube");
    const downloadRes = await ytDlpEngine.download({
      url: videoUrl,
      kind: "video",
      maxHeight: 720, // small-ish for speed
      workDir,
      cookiesPath,
      timeoutMs: 120_000,
    });

    if (!downloadRes.filePath) {
      throw new AppError("DOWNLOAD_FAILED", "Could not locate downloaded video file", 502);
    }

    const filePath = downloadRes.filePath;
    const rawDuration = await getDurationSec(filePath);
    const capped = rawDuration > MAX_SECONDS;
    const duration = capped ? MAX_SECONDS : rawDuration;

    // 2. Extract 6 evenly-spaced keyframes
    const ffmpegPath = await resolveFfmpegOnly();
    if (!ffmpegPath) {
      throw new AppError(
        "BINARY_MISSING",
        "ffmpeg is required for thumbnail extraction but was not found",
        503,
      );
    }

    const interval = duration / FRAME_COUNT;
    const frames: ThumbnailFrame[] = [];

    for (let i = 0; i < FRAME_COUNT; i++) {
      const timeSec = Math.round(interval * i * 100) / 100;
      const outName = `frame_${i}.jpg`;
      const outPath = path.join(workDir, outName);

      await execa(
        ffmpegPath,
        ["-y", "-ss", String(timeSec), "-i", filePath, "-frames:v", "1", "-q:v", "3", outPath],
        { timeout: 30_000, reject: false },
      );

      try {
        const buf = await readFile(outPath);
        frames.push({
          index: i,
          timeSec,
          base64: buf.toString("base64"),
          mime: "image/jpeg",
        });
      } catch {
        // Frame extraction failed for this position — skip
        logger.warn({ timeSec, outPath }, "Failed to read extracted frame");
      }
    }

    if (frames.length === 0) {
      throw new AppError("DOWNLOAD_FAILED", "Failed to extract any frames from the video", 502);
    }

    // Extract video ID from URL
    const videoIdMatch = videoUrl.match(/[?&]v=([^&]+)/);
    const videoId = videoIdMatch?.[1] ?? "unknown";

    return { videoId, frames, capped, durationSec: rawDuration };
  } finally {
    await safeRemove(workDir);
  }
}
