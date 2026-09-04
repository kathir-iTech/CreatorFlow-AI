export interface CaptionSegment {
  start: number;
  end: number;
  text: string;
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
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

export function toSrt(segments: CaptionSegment[]): string {
  return (
    segments
      .map(
        (s, i) =>
          `${i + 1}\n${formatSrtTime(s.start)} --> ${formatSrtTime(s.end)}\n${s.text.trim()}\n`,
      )
      .join("\n") + "\n"
  );
}

export function toVtt(segments: CaptionSegment[]): string {
  return (
    "WEBVTT\n\n" +
    segments
      .map((s) => `${formatVttTime(s.start)} --> ${formatVttTime(s.end)}\n${s.text.trim()}\n`)
      .join("\n") +
    "\n"
  );
}

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ");
}

export function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

/** Parse YouTube timedtext XML: <transcript><text start="0" dur="2.5">Hello</text>... */
export function parseTimedtextXml(xml: string): CaptionSegment[] {
  const out: CaptionSegment[] = [];
  const re = /<text[^>]*start="([\d.]+)"[^>]*dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const start = parseFloat(m[1] ?? "0");
    const dur = parseFloat(m[2] ?? "0");
    const text = stripTags(decodeHtmlEntities((m[3] ?? "").replace(/\n/g, " ").trim()));
    if (!text) continue;
    out.push({ start, end: start + dur, text });
  }
  // Some feeds use <p t=".." d=".."> (timedtext v1)
  if (out.length === 0) {
    const re2 =
      /<(?:p|span)[^>]*(?:t|start)="([\d.]+)"[^>]*(?:d|dur)="([\d.]+)"[^>]*>([\s\S]*?)<\/(?:p|span)>/g;
    while ((m = re2.exec(xml)) !== null) {
      // t/d are in milliseconds for v1
      const startMs = parseFloat(m[1] ?? "0");
      const durMs = parseFloat(m[2] ?? "0");
      const start = startMs > 1000 ? startMs / 1000 : startMs;
      const dur = durMs > 1000 ? durMs / 1000 : durMs;
      const text = stripTags(decodeHtmlEntities((m[3] ?? "").replace(/\n/g, " ").trim()));
      if (!text) continue;
      out.push({ start, end: start + dur, text });
    }
  }
  return out;
}

/** Parse YouTube json3 format: { events: [{ tStartMs, dDurationMs, segs: [{utf8}] }] } */
export function parseJson3(json: unknown): CaptionSegment[] {
  const out: CaptionSegment[] = [];
  if (!json || typeof json !== "object") return out;
  const events = (json as { events?: Array<Record<string, unknown>> }).events;
  if (!Array.isArray(events)) return out;
  for (const ev of events) {
    const tStartMs = typeof ev["tStartMs"] === "number" ? (ev["tStartMs"] as number) : 0;
    const dDurationMs = typeof ev["dDurationMs"] === "number" ? (ev["dDurationMs"] as number) : 0;
    const segs = ev["segs"] as Array<{ utf8?: string }> | undefined;
    if (!Array.isArray(segs)) continue;
    const text = segs
      .map((s) => s?.utf8 ?? "")
      .join("")
      .replace(/\n/g, " ")
      .trim();
    if (!text) continue;
    const start = tStartMs / 1000;
    const end = (tStartMs + dDurationMs) / 1000;
    out.push({ start, end, text: stripTags(decodeHtmlEntities(text)) });
  }
  return out;
}

/** Parse a VTT file (from yt-dlp --sub-format vtt) into segments. */
export function parseVtt(vtt: string): CaptionSegment[] {
  const out: CaptionSegment[] = [];
  const timeRe = /(\d{2,}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2,}:\d{2}:\d{2}[.,]\d{3})/;
  const lines = vtt.split(/\r?\n/);
  let i = 0;
  const toSec = (t: string): number => {
    const norm = t.replace(",", ".");
    const parts = norm.split(":");
    const secParts = parts.pop()?.split(".") ?? ["0", "0"];
    const secs = parseFloat(`${secParts[0]}.${secParts[1] ?? "0"}`);
    let total = secs;
    let mult = 60;
    while (parts.length > 0) {
      total += parseInt(parts.pop() ?? "0", 10) * mult;
      mult *= 60;
    }
    return total;
  };
  while (i < lines.length) {
    const line = lines[i]?.trim() ?? "";
    const m = line.match(timeRe);
    if (m) {
      const start = toSec(m[1] ?? "00:00:00.000");
      const end = toSec(m[2] ?? "00:00:00.000");
      i++;
      const textLines: string[] = [];
      while (i < lines.length && (lines[i]?.trim() ?? "") !== "") {
        const t = stripTags(lines[i] ?? "").trim();
        if (t && !/^\d+$/.test(t) && !timeRe.test(t)) textLines.push(t);
        i++;
      }
      const text = decodeHtmlEntities(textLines.join(" ").trim());
      if (text) out.push({ start, end, text });
    } else {
      i++;
    }
  }
  // De-dupe consecutive identical lines (auto-subs often repeat)
  return out.filter(
    (s, idx) =>
      idx === 0 || s.text !== out[idx - 1]?.text || s.start - (out[idx - 1]?.start ?? 0) > 0.5,
  );
}

export function sanitizeSegments(segments: CaptionSegment[]): CaptionSegment[] {
  return segments
    .filter(
      (s) =>
        s.text.trim().length > 0 &&
        Number.isFinite(s.start) &&
        Number.isFinite(s.end) &&
        s.end > s.start,
    )
    .map((s) => ({
      start: Math.max(0, s.start),
      end: Math.max(s.start + 0.1, s.end),
      text: s.text.trim().slice(0, 500),
    }))
    .slice(0, 5000);
}
