/**
 * Frontend URL pre-validation — immediate inline feedback WITHOUT a network
 * request (Part 7/8 rows 4-5). Mirrors the backend ProviderRegistry domains
 * so obviously-bad input never leaves the browser.
 */

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "youtu.be",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
]);

const SUPPORTED_HOSTS = new Set([
  ...YOUTUBE_HOSTS,
  "instagram.com",
  "instagr.am",
  "facebook.com",
  "fb.watch",
  "fb.com",
  "m.facebook.com",
]);

export type UrlCheck =
  | { ok: true }
  | { ok: false; reason: "empty" | "not-a-url" | "unsupported" | "playlist" };

function hostMatches(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  for (const d of SUPPORTED_HOSTS) {
    if (h === d || h.endsWith(`.${d}`)) return true;
  }
  return false;
}

function isYoutubeHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  for (const d of YOUTUBE_HOSTS) {
    if (h === d || h.endsWith(`.${d}`)) return true;
  }
  return false;
}

function youtubeHasVideoId(u: URL): boolean {
  if (u.hostname.toLowerCase().replace(/^www\./, "") === "youtu.be") {
    return u.pathname.split("/").filter(Boolean).length > 0;
  }
  if (u.searchParams.get("v")) return true;
  return /\/(shorts|embed|live)\/[A-Za-z0-9_-]{6,}/.test(u.pathname);
}

export function checkMediaUrl(input: string): UrlCheck {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    // Bare video IDs / pasted text without a scheme are not URLs.
    return { ok: false, reason: "not-a-url" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: "not-a-url" };
  }
  if (!hostMatches(u.hostname)) return { ok: false, reason: "unsupported" };
  // A playlist link with no single video selected can't run the pipeline.
  if (isYoutubeHost(u.hostname) && !youtubeHasVideoId(u)) {
    return { ok: false, reason: "playlist" };
  }
  return { ok: true };
}

export function urlCheckMessage(check: Extract<UrlCheck, { ok: false }>): string {
  switch (check.reason) {
    case "empty":
      return "Paste a link first — then hit Fetch.";
    case "not-a-url":
      return "That doesn't look like a link. Paste a full YouTube, Instagram, or Facebook URL.";
    case "unsupported":
      return "We don't support that website yet — YouTube, Instagram, and Facebook work.";
    case "playlist":
      return "That's a playlist, not a single video — open a video and paste its link instead.";
  }
}
