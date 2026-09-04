export function sanitizeFilename(name: string, fallback = "media"): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return cleaned || fallback;
}

export function contentDispositionFilename(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(name);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Strip noisy/playlist query params that derail yt-dlp's video extraction
 * (e.g. `list=`, `start_radio=`, tracking junk). Always returns a trimmed
 * string; falls back to the trimmed input if URL parsing fails.
 */
const STRIP_QUERY_KEYS = new Set([
  "list",
  "start_radio",
  "index",
  "pp",
  "feature",
  "ab_channel",
  "si",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
]);

export function sanitizeMediaUrl(input: string): string {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return trimmed;
  try {
    const u = new URL(trimmed);
    for (const key of [...u.searchParams.keys()]) {
      if (STRIP_QUERY_KEYS.has(key.toLowerCase())) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return trimmed;
  }
}