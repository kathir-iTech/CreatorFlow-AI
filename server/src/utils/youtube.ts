import { extractYoutubeVideoId } from "@/engines/downloader/BotCheckDetector.js";
import { sanitizeMediaUrl } from "@/utils/sanitize.js";

export interface NormalizedYoutubeUrl {
  videoId: string;
  /** Canonical watch URL with all tracking params stripped. */
  canonicalUrl: string;
}

export function canonicalYoutubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Single shared YouTube URL normalizer (Part 2 — ?si= bug class).
 *
 * Accepts every shape the YouTube share button / address bar produces and
 * returns the same canonical video ID + watch URL for all of them:
 * - youtube.com/watch?v=ID (+ arbitrary tracking params)
 * - youtu.be/ID, youtu.be/ID?si=TRACKING
 * - youtube.com/shorts/ID, /embed/ID, /live/ID
 * - m.youtube.com / music.youtube.com variants
 *
 * Returns null for non-YouTube input so callers can fall back to
 * sanitizeMediaUrl() (other providers) or a validation error.
 */
export function normalizeYoutubeUrl(input: string): NormalizedYoutubeUrl | null {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return null;
  const videoId = extractYoutubeVideoId(trimmed);
  if (!videoId) return null;
  // Confirm the host is actually YouTube (extractYoutubeVideoId only matches
  // YouTube hosts, but belt-and-braces against future callers).
  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const isYoutube =
      host === "youtu.be" || host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com");
    if (!isYoutube) return null;
  } catch {
    return null;
  }
  return { videoId, canonicalUrl: canonicalYoutubeWatchUrl(videoId) };
}

/**
 * Canonicalize any media URL before it reaches yt-dlp / provider logic:
 * YouTube links collapse to the canonical watch URL, everything else gets
 * tracking-param sanitization. Never throws — falls back to the trimmed input.
 */
export function canonicalizeMediaUrl(input: string): string {
  const normalized = normalizeYoutubeUrl(input);
  if (normalized) return normalized.canonicalUrl;
  try {
    return sanitizeMediaUrl(input);
  } catch {
    return (input ?? "").trim();
  }
}
