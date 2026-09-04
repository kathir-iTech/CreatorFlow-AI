import type { ProviderId } from "@/providers/types.js";

/**
 * YouTube anti-bot challenge fingerprints.
 *
 * yt-dlp surfaces these as stderr lines such as:
 *   ERROR: [youtube] dQw4w9WgXcQ: Sign in to confirm you're not a bot.
 *     Use --cookies-from-browser or --cookies for the authentication.
 *
 * We match defensively — YouTube has rotated the exact wording several
 * times — and only trigger for the YouTube provider so Instagram /
 * Facebook login walls are NOT misclassified as BOT_CHECK.
 */
const YOUTUBE_BOT_PATTERNS: RegExp[] = [
  /http error 422/i,
  /unprocessable content/i,
  /sign in to confirm[^.\n]{0,80}not a bot/i,
  /\bsign in\b/i,
  /confirm you'?re not a bot/i,
  /verify you'?re not a bot/i,
  /not a bot/i, // last-resort catch-all (YouTube-scoped via providerId guard)
  /this video is unavailable/i,
  /this video may be inappropriate for some users/i, // age-gate variant that requires the same cookie fix
  /please sign in/i, // YouTube-only when combined with the [youtube] tag below
];

const YOUTUBE_TAG = /\[youtube[^\]]*\]/i;

export interface BotCheckDetection {
  isBotCheck: boolean;
  matchedPattern?: string;
}

/**
 * Inspect combined yt-dlp stderr/stdout output and decide whether the failure
 * was a YouTube anti-bot challenge. Returns false for any non-YouTube
 * provider so the caller can keep using the existing error mapping.
 */
export function detectYoutubeBotCheck(
  output: string,
  providerId?: ProviderId,
): BotCheckDetection {
  if (!output) return { isBotCheck: false };
  if (providerId && providerId !== "youtube") return { isBotCheck: false };

  // Normalize smart quotes (U+2018/U+2019) yt-dlp sometimes emits so the
  // patterns below match regardless of the apostrophe style.
  output = output.replace(/[\u2018\u2019]/g, "'");

  // For the "please sign in" pattern we also require the [youtube] tag to
  // avoid false positives from other extractors that legitimately need a login.
  for (const pattern of YOUTUBE_BOT_PATTERNS) {
    if (!pattern.test(output)) continue;
    if ((pattern.source.includes("please sign in") || pattern.source.includes("\\bsign in\\b")) && !YOUTUBE_TAG.test(output)) {
      continue;
    }
    return { isBotCheck: true, matchedPattern: pattern.source };
  }
  return { isBotCheck: false };
}

/**
 * Extract a YouTube video id from a URL when possible.
 * Supports watch?v=, youtu.be/, /shorts/, /embed/ forms.
 */
export function extractYoutubeVideoId(url: string): string | undefined {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || undefined;
    if (host.endsWith("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const m = u.pathname.match(/\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{6,})/);
      if (m) return m[1];
    }
  } catch {
    // ignore
  }
  return undefined;
}