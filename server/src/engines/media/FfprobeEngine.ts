import { execa } from "execa";
import { resolveBinaries } from "@/runtime/BinaryResolver.js";

export interface ProbeResult {
  durationSec?: number;
  width?: number;
  height?: number;
  bitrate?: number;
  format?: string;
  raw: unknown;
}

export class FfprobeEngine {
  async probe(file: string): Promise<ProbeResult> {
    const { ffprobe } = await resolveBinaries();
    const { stdout } = await execa(
      ffprobe.path,
      [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        file,
      ],
      { timeout: 30_000 },
    );
    const json = JSON.parse(stdout) as {
      format?: { duration?: string; bit_rate?: string; format_name?: string };
      streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
    };
    const video = json.streams?.find((s) => s.codec_type === "video");
    return {
      durationSec: json.format?.duration ? Number(json.format.duration) : undefined,
      width: video?.width,
      height: video?.height,
      bitrate: json.format?.bit_rate ? Number(json.format.bit_rate) : undefined,
      format: json.format?.format_name,
      raw: json,
    };
  }
}

export const ffprobeEngine = new FfprobeEngine();