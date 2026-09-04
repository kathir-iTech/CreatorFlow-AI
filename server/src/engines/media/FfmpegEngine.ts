import { execa } from "execa";
import path from "node:path";
import { resolveBinaries } from "@/runtime/BinaryResolver.js";
import { logger } from "@/logging/logger.js";
import { AppError } from "@/errors/AppError.js";

export interface ConvertOptions {
  input: string;
  output: string;
  videoCodec?: string;
  audioCodec?: string;
  format?: string;
  extraArgs?: string[];
}

export class FfmpegEngine {
  async convert(opts: ConvertOptions): Promise<void> {
    const { ffmpeg } = await resolveBinaries();
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      opts.input,
      ...(opts.videoCodec ? ["-c:v", opts.videoCodec] : []),
      ...(opts.audioCodec ? ["-c:a", opts.audioCodec] : []),
      ...(opts.format ? ["-f", opts.format] : []),
      ...(opts.extraArgs ?? []),
      opts.output,
    ];
    const start = Date.now();
    logger.info({ ffmpegPath: ffmpeg.path, command: ["ffmpeg", ...args] }, "ffmpeg convert start");
    const res = await execa(ffmpeg.path, args, { reject: false, timeout: 5 * 60_000 });
    if (res.exitCode !== 0) {
      throw new AppError("INTERNAL_ERROR", `ffmpeg convert failed: ${res.stderr?.slice(0, 500)}`, 500);
    }
    logger.info({ durationMs: Date.now() - start, output: opts.output }, "ffmpeg convert done");
  }

  async extractAudio(input: string, output: string, format = "mp3", bitrate = "192k"): Promise<void> {
    const { ffmpeg } = await resolveBinaries();
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      input,
      "-vn",
      "-acodec",
      format === "mp3" ? "libmp3lame" : format,
      "-b:a",
      bitrate,
      output,
    ];
    const start = Date.now();
    logger.info({ ffmpegPath: ffmpeg.path, command: ["ffmpeg", ...args] }, "ffmpeg extractAudio start");
    const res = await execa(ffmpeg.path, args, { reject: false, timeout: 5 * 60_000 });
    if (res.exitCode !== 0) {
      throw new AppError("INTERNAL_ERROR", `ffmpeg extractAudio failed: ${res.stderr?.slice(0, 500)}`, 500);
    }
    logger.info({ durationMs: Date.now() - start, output }, "ffmpeg extractAudio done");
  }

  async thumbnail(input: string, output: string, atSeconds = 1): Promise<void> {
    const { ffmpeg } = await resolveBinaries();
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(atSeconds),
      "-i",
      input,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      output,
    ];
    await execa(ffmpeg.path, args, { reject: true, timeout: 60_000 });
  }

  async merge(videoPath: string, audioPath: string, output: string): Promise<void> {
    const { ffmpeg } = await resolveBinaries();
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      videoPath,
      "-i",
      audioPath,
      "-c",
      "copy",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      output,
    ];
    const res = await execa(ffmpeg.path, args, { reject: false, timeout: 5 * 60_000 });
    if (res.exitCode !== 0) {
      throw new AppError("INTERNAL_ERROR", `ffmpeg merge failed: ${res.stderr?.slice(0, 500)}`, 500);
    }
    void path; // keep path import if unused elsewhere
    void output;
  }
}

export const ffmpegEngine = new FfmpegEngine();