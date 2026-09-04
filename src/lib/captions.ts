import type { CaptionSegment } from "./api";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatTime(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${pad(m)}:${pad(secs)}`;
}

function splitTime(sec: number): { h: number; m: number; s: number; ms: number } {
  // Round via total milliseconds to avoid float drift (e.g. 18.64 -> 18,639).
  const totalMs = Math.round(Math.max(0, sec) * 1000);
  const h = Math.floor(totalMs / 3_600_000);
  const m = Math.floor((totalMs % 3_600_000) / 60_000);
  const s = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return { h, m, s, ms };
}

export function formatSrtTime(sec: number): string {
  const { h, m, s, ms } = splitTime(sec);
  return `${pad(h)}:${pad(m)}:${pad(s)},${String(ms).padStart(3, "0")}`;
}

export function formatVttTime(sec: number): string {
  const { h, m, s, ms } = splitTime(sec);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${String(ms).padStart(3, "0")}`;
}

/** Client-side export helpers — mirror the backend so edited lines can be re-exported without a round-trip. */
export function captionsToSrt(segments: CaptionSegment[]): string {
  return (
    segments
      .map(
        (s, i) =>
          `${i + 1}\n${formatSrtTime(s.start)} --> ${formatSrtTime(s.end)}\n${s.text.trim()}\n`,
      )
      .join("\n") + "\n"
  );
}

export function captionsToVtt(segments: CaptionSegment[]): string {
  return (
    "WEBVTT\n\n" +
    segments
      .map((s) => `${formatVttTime(s.start)} --> ${formatVttTime(s.end)}\n${s.text.trim()}\n`)
      .join("\n") +
    "\n"
  );
}

export function captionsToPlainText(segments: CaptionSegment[]): string {
  return segments.map((s) => s.text.trim()).join(" ");
}

export function downloadTextFile(filename: string, content: string, mime = "text/plain"): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
