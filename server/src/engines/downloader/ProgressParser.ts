/**
 * Parses yt-dlp stderr/stdout lines to extract progress.
 * yt-dlp `--newline` mode prints lines like:
 *   [download]   3.4% of   12.34MiB at  500.00KiB/s ETA 00:24
 */
export interface ProgressEvent {
  type: "progress" | "info" | "stage";
  percent?: number;
  speed?: string;
  eta?: string;
  stage?: string;
  raw: string;
}

const PERCENT_RE = /\b(\d{1,3}(?:\.\d+)?)%/;
const SPEED_RE = /at\s+([\d.]+\s*[KMG]?i?B\/s)/i;
const ETA_RE = /ETA\s+([\d:]+)/i;

export function parseProgressLine(line: string): ProgressEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("[download]")) {
    const percent = PERCENT_RE.exec(trimmed)?.[1];
    const speed = SPEED_RE.exec(trimmed)?.[1];
    const eta = ETA_RE.exec(trimmed)?.[1];
    if (percent) {
      return {
        type: "progress",
        percent: Math.min(100, Number(percent)),
        speed,
        eta,
        raw: trimmed,
      };
    }
  }

  if (trimmed.startsWith("[Merger]") || trimmed.startsWith("[ExtractAudio]") || trimmed.startsWith("[ffmpeg]")) {
    return { type: "stage", stage: trimmed.split("]")[0]?.slice(1), raw: trimmed };
  }

  return { type: "info", raw: trimmed };
}