export const API_PREFIX = "/api/v1";
export const SSE_HEARTBEAT_MS = 15_000;
// Current desktop Chrome on Windows. yt-dlp forwards this to the YouTube
// Innertube web client; pairing it with player_client=web/web_safari keeps
// the request looking like a real browser session so HD adaptive streams
// aren't gated behind the "Sign in to confirm" bot challenge.
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// Sent as extra HTTP headers on yt-dlp requests so the upstream sees a
// realistic browser fingerprint, not just a UA string.
export const DEFAULT_BROWSER_HEADERS: Record<string, string> = {
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-Dest": "document",
  "Upgrade-Insecure-Requests": "1",
};