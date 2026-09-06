/**
 * CaptionService — resolves transcript TEXT only, via three ordered paths:
 * native timedtext (free, instant) → yt-dlp subtitle dump (free, slower) →
 * Groq Whisper (paid/limited, slowest). It does NOT handle video download
 * itself (YtDlpEngine does, via transcribeWithWhisper's audio plan) and does
 * NOT generate SEO — it hands plain text to the frontend, which calls /seo.
 */
import { execa } from "execa";
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { openAsBlob } from "node:fs";
import path from "node:path";
import which from "which";
import { env } from "@/config/env.js";
import { logger } from "@/logging/logger.js";
import { AppError } from "@/errors/AppError.js";
import { extractYoutubeVideoId } from "@/engines/downloader/BotCheckDetector.js";
import { getCookiesPathFor } from "@/security/CookiesDetector.js";
import { providerRegistry } from "@/providers/ProviderRegistry.js";
import { infoService } from "./InfoService.js";
import { ytDlpEngine } from "@/engines/downloader/YtDlpEngine.js";
import { canonicalizeMediaUrl, normalizeYoutubeUrl } from "@/utils/youtube.js";
import { createJobDir, safeRemove } from "@/utils/tmp.js";
import { logMemory } from "@/utils/memory.js";
import { ytdlpLimiter } from "@/utils/concurrency.js";
import {
  parseJson3,
  parseTimedtextXml,
  parseVtt,
  sanitizeSegments,
  toSrt,
  toVtt,
  type CaptionSegment,
} from "@/utils/captions.js";

export type CaptionSource = "native" | "whisper";

export interface CaptionsResult {
  videoId?: string;
  providerId: string;
  source: CaptionSource;
  language?: string;
  isAuto?: boolean;
  captions: CaptionSegment[];
  srt: string;
  vtt: string;
}

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

async function fetchWithTimeout(url: string, ms = 15000, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "User-Agent": DESKTOP_UA,
        "Accept-Language": "en-US,en;q=0.9",
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(t);
  }
}

interface CaptionTrack {
  baseUrl: string;
  languageCode?: string;
  kind?: string;
  name?: string;
}

/** Extract captionTracks from a YouTube watch page without extra deps. */
function extractCaptionTracks(html: string): CaptionTrack[] {
  // captionTracks JSON is embedded in ytInitialPlayerResponse — grab the array directly.
  const m = html.match(/"captionTracks"\s*:\s*(\[.+?\])\s*,\s*"audioTracks"/s);
  const raw = m?.[1];
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as Array<Record<string, unknown>>;
    return arr
      .filter((t) => typeof t["baseUrl"] === "string")
      .map((t) => ({
        baseUrl: String(t["baseUrl"]),
        languageCode:
          typeof t["languageCode"] === "string" ? (t["languageCode"] as string) : undefined,
        kind: typeof t["kind"] === "string" ? (t["kind"] as string) : undefined,
        name: undefined,
      }));
  } catch {
    return [];
  }
}

function pickTrack(tracks: CaptionTrack[], preferred = "en"): CaptionTrack | null {
  if (tracks.length === 0) return null;
  const norm = (s?: string) => (s ?? "").toLowerCase().split("-")[0];
  // 1. manual (no kind=asr) in preferred lang
  const manual = tracks.find((t) => norm(t.languageCode) === preferred && t.kind !== "asr");
  if (manual) return manual;
  // 2. auto in preferred lang
  const auto = tracks.find((t) => norm(t.languageCode) === preferred);
  if (auto) return auto;
  // 3. any manual english
  const anyManualEn = tracks.find((t) => norm(t.languageCode) === "en" && t.kind !== "asr");
  if (anyManualEn) return anyManualEn;
  // 4. any english
  const anyEn = tracks.find((t) => norm(t.languageCode) === "en");
  if (anyEn) return anyEn;
  // 5. first manual, else first
  return tracks.find((t) => t.kind !== "asr") ?? tracks[0] ?? null;
}

async function fetchTrackSegments(track: CaptionTrack): Promise<CaptionSegment[]> {
  // Try json3 first (clean timestamps), then XML fallback.
  const jsonUrl = track.baseUrl.includes("&fmt=")
    ? track.baseUrl.replace(/&fmt=[^&]*/, "&fmt=json3")
    : `${track.baseUrl}&fmt=json3`;
  try {
    const r = await fetchWithTimeout(jsonUrl, 15000);
    if (r.ok) {
      const text = await r.text();
      try {
        const parsed = parseJson3(JSON.parse(text));
        if (parsed.length > 0) return parsed;
      } catch {
        // fall through to XML
      }
    }
  } catch {
    // fall through
  }
  const r2 = await fetchWithTimeout(track.baseUrl, 15000);
  if (!r2.ok) return [];
  const xml = await r2.text();
  if (!xml.includes("<transcript") && !xml.includes("<timedtext") && !xml.includes("<text"))
    return [];
  return parseTimedtextXml(xml);
}

/** Path 1 — YouTube native captions/timedtext. Free, zero AI cost. Returns null when none exist. */
async function fetchNativeCaptions(
  videoId: string,
  preferredLang = "en",
): Promise<CaptionsResult | null> {
  // 1a. Legacy timedtext endpoints (no page parse needed — fastest).
  const legacyUrls = [
    `https://video.google.com/timedtext?lang=${preferredLang}&v=${videoId}`,
    `https://video.google.com/timedtext?lang=${preferredLang}&kind=asr&v=${videoId}`,
    `https://www.youtube.com/api/timedtext/v1/captions?lang=${preferredLang}&v=${videoId}&fmt=json3`,
  ];
  for (const u of legacyUrls) {
    try {
      const r = await fetchWithTimeout(u, 12000);
      if (!r.ok) continue;
      const text = await r.text();
      if (!text || text.trim().length < 20) continue;
      let segs: CaptionSegment[] = [];
      const trimmed = text.trim();
      if (trimmed.startsWith("{")) {
        try {
          segs = parseJson3(JSON.parse(trimmed));
        } catch {
          segs = [];
        }
      } else if (trimmed.includes("<transcript") || trimmed.includes("<text")) {
        segs = parseTimedtextXml(trimmed);
      }
      segs = sanitizeSegments(segs);
      if (segs.length > 0) {
        logger.info(
          { videoId, count: segs.length, via: "legacy-timedtext" },
          "native captions hit",
        );
        return {
          videoId,
          providerId: "youtube",
          source: "native",
          language: preferredLang,
          isAuto: u.includes("kind=asr"),
          captions: segs,
          srt: toSrt(segs),
          vtt: toVtt(segs),
        };
      }
    } catch {
      continue;
    }
  }

  // 1b. Watch-page captionTracks (handles non-English + auto-generated tracks).
  try {
    const page = await fetchWithTimeout(`https://www.youtube.com/watch?v=${videoId}&hl=en`, 15000);
    if (!page.ok) return null;
    const html = await page.text();
    const tracks = extractCaptionTracks(html);
    if (tracks.length === 0) return null;
    const picked = pickTrack(tracks, preferredLang);
    if (!picked) return null;
    const segs = sanitizeSegments(await fetchTrackSegments(picked));
    if (segs.length === 0) return null;
    logger.info(
      { videoId, count: segs.length, lang: picked.languageCode, kind: picked.kind ?? "manual" },
      "native captions hit via watch page",
    );
    return {
      videoId,
      providerId: "youtube",
      source: "native",
      language: picked.languageCode,
      isAuto: picked.kind === "asr",
      captions: segs,
      srt: toSrt(segs),
      vtt: toVtt(segs),
    };
  } catch (err) {
    logger.debug({ err, videoId }, "watch-page caption parse failed");
    return null;
  }
}

/**
 * Resolve ONLY the yt-dlp binary (not ffmpeg/ffprobe — subtitles don't need them).
 * Deliberately independent of resolveBinaries() so captions keep working on
 * minimal installs where ffprobe is absent.
 */
async function resolveYtDlpOnly(): Promise<string | null> {
  if (env.YTDLP_PATH && existsSync(path.resolve(env.YTDLP_PATH)))
    return path.resolve(env.YTDLP_PATH);
  const local = path.resolve("./bin", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
  if (existsSync(local)) return local;
  const fromPath = await which("yt-dlp", { nothrow: true });
  return fromPath ?? null;
}

/** Path 1c — yt-dlp subtitle dump (still free, still native). Catches cases where direct fetch is blocked. */
async function fetchNativeViaYtDlp(url: string, videoId?: string): Promise<CaptionsResult | null> {
  const ytDlpPath = await resolveYtDlpOnly();
  if (!ytDlpPath) {
    logger.debug("yt-dlp not found — skipping yt-dlp subtitle dump");
    return null;
  }
  return ytdlpLimiter.run(async () => {
    logMemory("caption:yt-dlp-subs:start", { videoId });
    const workDir = await createJobDir(`caps-${Date.now()}`);
    try {
      const cookies = getCookiesPathFor("youtube");
      const args = [
        "--skip-download",
        "--write-sub",
        "--write-auto-sub",
        "--sub-langs",
        "en.*",
        "--sub-format",
        "vtt",
        "--no-playlist",
        "--no-warnings",
        "--no-call-home",
        "-o",
        "cap.%(ext)s",
      ];
      if (cookies) args.push("--cookies", cookies);
      args.push(url);
      const res = await execa(ytDlpPath, args, { cwd: workDir, timeout: 90_000, reject: false });
    const files = (await readdir(workDir)).filter((f) => f.endsWith(".vtt"));
    if (files.length === 0) {
      // No subs at all — this video genuinely has none (or all fetches failed).
      logger.debug(
        { exitCode: res.exitCode, stderr: res.stderr?.slice(0, 500), videoId },
        "yt-dlp subs dump found no subtitles",
      );
      return null;
    }
    if (res.exitCode !== 0) {
      // Non-zero exit with files present is normal (e.g. one regional variant 429'd) — proceed.
      logger.debug(
        { exitCode: res.exitCode, files: files.length, videoId },
        "yt-dlp subs dump partial success",
      );
    }
    // Prefer manual over auto (*.en.vtt beats *.en-orig / auto-generated names)
    files.sort((a, b) => {
      const score = (f: string) => (f.includes("auto") || f.includes(".a.") ? 1 : 0);
      return score(a) - score(b);
    });
    const first = files[0];
    if (!first) return null;
    const content = await readFile(path.join(workDir, first), "utf8");
    const segs = sanitizeSegments(parseVtt(content));
    if (segs.length === 0) return null;
    logger.info({ videoId, count: segs.length, file: first }, "native captions hit via yt-dlp");
    return {
      videoId,
      providerId: "youtube",
      source: "native",
      language: "en",
      isAuto: first.toLowerCase().includes("auto"),
      captions: segs,
      srt: toSrt(segs),
      vtt: toVtt(segs),
    };
  } catch {
    return null;
  } finally {
    await safeRemove(workDir);
    logMemory("caption:yt-dlp-subs:exit", { videoId });
  }
  });
}

/** Path 2 — Groq Whisper fallback. Downloads audio via existing engine, transcribes free-tier. */
async function transcribeWithWhisper(rawUrl: string, providerId: string): Promise<CaptionsResult> {
  const apiKey = env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    // Granular: native path already came up empty AND transcription isn't configured.
    throw new AppError(
      "WHISPER_UNAVAILABLE",
      "This video has no captions, and AI transcription isn't configured (GROQ_API_KEY is missing on the server).",
      503,
    );
  }
  // Canonicalize first so ?si= / shorts / embed variants all hit the same path.
  const url = canonicalizeMediaUrl(rawUrl);
  const provider = providerRegistry.resolveFromUrl(url);
  let plan: Awaited<ReturnType<typeof provider.buildDownloadPlan>>;
  // Part 3 hardening: entire Whisper metadata + android-fallback retry previously ran
  // 13-17s (logs show 8.4s primary+fallback, plus 6s subs dump = 14-15s total seen in 20:22 IST runs)
  // before failing, keeping the request window open for proxy/container restarts to interfere.
  // Cap total budget to 8s for both metadata attempts combined — fail fast with clean
  // AUDIO_DOWNLOAD_FAILED rather than lingering. Observed metadata alone was 8.4s,
  // so 8s cuts ~6-7s off total (measured via logMemory below). 10s example in prompt
  // would not have triggered for this video (8.4 <10), so use 8s. AbortSignal ensures
  // underlying yt-dlp Python processes are actually killed, not just orphaned.
  let ac: AbortController | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutMs = 8000;
    ac = new AbortController();
    timeoutId = setTimeout(() => ac!.abort(new Error(`Whisper metadata timeout after ${timeoutMs}ms (bot-check retry budget exceeded)`)), timeoutMs);
    const startMeta = Date.now();
    let metadata: import("@/providers/types.js").MediaMetadata;
    try {
      const res = await infoService.getMetadata(url, ac.signal);
      metadata = res.metadata;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
    logMemory("whisper:metadata:race-won", { durationMs: Date.now() - startMeta });
    plan = provider.buildDownloadPlan(metadata, { url, kind: "audio", audioFormat: "mp3" });
  } catch (err) {
    // Granular: failure is upstream of transcription — audio was never downloadable.
    // Includes timeout case above: err.message contains "Whisper metadata timeout" or AbortError
    // Part 2 trace: preserve original BOT_CHECK 422 instead of wrapping to 502 — the 422→502
    // gap was because BOT_CHECK (422, correct per AppError) was re-thrown as AUDIO_DOWNLOAD_FAILED (502).
    // That made pino-http log 502 while the constructed AppError log showed 422.
    if (err instanceof AppError && err.code === "BOT_CHECK") {
      logger.warn({ err, providerId, url, preserved: true }, "whisper fallback: preserving BOT_CHECK 422 (not wrapping to 502)");
      throw err;
    }
    const detail = err instanceof Error ? err.message : String(err);
    const isTimeout = detail.includes("Whisper metadata timeout") || (ac?.signal.aborted ?? false) || (err as { name?: string })?.name === "AbortError" || (err as { code?: string })?.code === "ABORT_ERR";
    logger.warn({ err, providerId, url, isTimeout }, "whisper fallback: audio metadata/download setup failed");
    if (isTimeout) {
      logMemory("whisper:metadata:timeout", { providerId });
      // Timeout due to bot-check retry budget — treat as BOT_CHECK 422, not generic 502, so client gets 422
      throw new AppError(
        "BOT_CHECK",
        `YouTube bot-check timeout after 8s — retry budget exceeded (${detail})`,
        422,
        { error: "bot_block", provider: providerId, retryable: true },
      );
    }
    throw new AppError(
      "AUDIO_DOWNLOAD_FAILED",
      `Couldn't download this video's audio for transcription (${detail}). It may be private, age-restricted, region-locked, or a live stream.`,
      502,
    );
  }
  // Keep Whisper input small: best audio is fine, engine already picks mp3.
  const workDir = await createJobDir(`whisper-${Date.now()}`);
  try {
    let filePath: string;
    try {
      const result = await ytDlpEngine.download({ plan, workDir, jobId: `caps-${Date.now()}` });
      filePath = result.filePath;
    } catch (err) {
      if (err instanceof AppError && err.code === "BOT_CHECK") {
        logger.warn({ err, providerId, url, preserved: true }, "whisper audio download: preserving BOT_CHECK 422");
        throw err;
      }
      const detail = err instanceof Error ? err.message : String(err);
      logger.warn({ err, providerId, url }, "whisper fallback: audio download failed");
      throw new AppError(
        "AUDIO_DOWNLOAD_FAILED",
        `Couldn't download this video's audio for transcription (${detail}). It may be private, age-restricted, region-locked, or a live stream.`,
        502,
      );
    }
    const size = (await stat(filePath)).size;
    const MAX_BYTES = 25 * 1024 * 1024;
    if (size > MAX_BYTES) {
      throw new AppError(
        "DOWNLOAD_FAILED",
        `Audio too large for Whisper free tier (${(size / 1048576).toFixed(1)} MB > 25 MB). Try a shorter video.`,
        422,
      );
    }
    logMemory("whisper:pre-upload", { sizeMB: (size / 1048576).toFixed(1) });
    // FIX (Step 3): Stream from disk via openAsBlob instead of readFile → Buffer → Blob.
    // Before: readFile(file) held entire audio (up to 25 MB) as Buffer + Blob copy (~50 MB heap spike)
    // After: openAsBlob creates a lazily-read Blob backed by file handle, streamed by fetch.
    let fileBlob: Blob;
    try {
      fileBlob = await openAsBlob(filePath);
    } catch {
      // Fallback for older Node without openAsBlob — still avoid double-copy
      const buf = await readFile(filePath);
      fileBlob = new Blob([buf], { type: "audio/mpeg" });
    }
    const form = new FormData();
    // openAsBlob's Blob already has correct type/size, but ensure filename via File
    // Using File with known name ensures Groq receives correct multipart filename.
    const audioFile = new File([fileBlob], "audio.mp3", { type: "audio/mpeg" });
    form.append("file", audioFile);
    form.append("model", "whisper-large-v3-turbo");
    form.append("response_format", "verbose_json");
    form.append("temperature", "0");
    logMemory("whisper:post-blob", { sizeMB: (size / 1048576).toFixed(1) });
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5 * 60_000);
    let groqRes: Response;
    try {
      groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(t);
    }
    if (!groqRes.ok) {
      const body = await groqRes.text().catch(() => "");
      logger.warn({ status: groqRes.status, body: body.slice(0, 500) }, "Groq Whisper failed");
      // Granular: key IS configured but the API call itself failed — surface why.
      const hint =
        groqRes.status === 401
          ? " The API key looks invalid — check GROQ_API_KEY on the server."
          : groqRes.status === 429
            ? " Rate limit hit — wait a minute and retry."
            : "";
      throw new AppError(
        "WHISPER_FAILED",
        `AI transcription failed (Groq API ${groqRes.status}: ${body.slice(0, 200) || "no detail"}).${hint}`,
        502,
      );
    }
    const data = (await groqRes.json()) as {
      segments?: Array<{ start?: number; end?: number; text?: string }>;
      text?: string;
    };
    let segs: CaptionSegment[] = [];
    if (Array.isArray(data.segments)) {
      segs = sanitizeSegments(
        data.segments.map((s) => ({
          start: Number(s.start ?? 0),
          end: Number(s.end ?? 0),
          text: String(s.text ?? "").trim(),
        })),
      );
    }
    if (segs.length === 0 && typeof data.text === "string" && data.text.trim()) {
      // No timestamps — chunk plain text into ~6s blocks so UI/export still works.
      const words = data.text.trim().split(/\s+/);
      const perLine = 14;
      let t = 0;
      for (let i = 0; i < words.length; i += perLine) {
        const text = words.slice(i, i + perLine).join(" ");
        segs.push({ start: t, end: t + 6, text });
        t += 6;
      }
    }
    if (segs.length === 0)
      // Not a failure — the video likely has no speech (music/instrumental).
      throw new AppError(
        "NO_SPEECH",
        "No spoken words detected in this video — the audio may be music-only or silent.",
        422,
      );
    logger.info({ count: segs.length, providerId }, "whisper captions done");
    return {
      videoId: extractYoutubeVideoId(url),
      providerId,
      source: "whisper",
      language: "en",
      captions: segs,
      srt: toSrt(segs),
      vtt: toVtt(segs),
    };
  } finally {
    await safeRemove(workDir);
  }
}

export class CaptionService {
  async getCaptions(rawUrl: string, lang = "en"): Promise<CaptionsResult> {
    const trimmed = rawUrl.trim();
    if (!trimmed) throw new AppError("VALIDATION_ERROR", "url is required", 400);
    // Canonicalize once: ?si=, shorts, embed, music/m.youtube variants all
    // collapse to one watch URL before any provider logic sees them.
    const url = canonicalizeMediaUrl(trimmed);
    let providerId: string;
    try {
      providerId = providerRegistry.resolveFromUrl(url).id as string;
    } catch {
      providerId = "youtube";
    }
    const videoId = normalizeYoutubeUrl(url)?.videoId ?? extractYoutubeVideoId(url);

    // Native path only makes sense for YouTube; other providers go straight to Whisper.
    if (providerId === "youtube" && videoId) {
      const native = await fetchNativeCaptions(videoId, lang);
      if (native) return native;
      const viaYtDlp = await fetchNativeViaYtDlp(url, videoId);
      if (viaYtDlp) return viaYtDlp;
    }

    // Fallback: Whisper (needs audio download + GROQ_API_KEY).
    return transcribeWithWhisper(url, providerId);
  }
}

export const captionService = new CaptionService();
