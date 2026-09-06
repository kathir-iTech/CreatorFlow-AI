import type { DownloadPlan } from "@/providers/types.js";
import { env, getYtDlpProxyUrl } from "@/config/env.js";
import { DEFAULT_BROWSER_HEADERS, DEFAULT_USER_AGENT } from "@/config/constants.js";

export interface BuildArgsInput {
  plan: DownloadPlan;
  outputTemplate: string;
  cookiesPath?: string | null;
}

// Primary clients: web_safari is the 8K-capable client that commercial downloaders
// use for 4320p — it bypasses SABR and returns the full DASH manifest with
// 8K vp9/av1 + opus. Put ios first (most residential-like, rarely blocked),
// then android, web_safari, tv. This matches what y2mate/loader.to use for 8K.
export const YOUTUBE_PLAYER_CLIENTS = "ios,android,web_safari,tv,web";
export const YOUTUBE_FALLBACK_CLIENTS = ["ios", "android", "web_safari", "web_creator", "tv", "mediaconnect", "mweb"] as const;

/**
 * Build the `youtube:` extractor-args clause (player_client, skip, optional
 * po_token/visitor_data). The bgutil PO-token provider is configured
 * SEPARATELY via its own extractor-args entry — see
 * `buildBgutilPotExtractorArgs`. Per plugin README:
 *   --extractor-args "youtubepot-bgutilhttp:base_url=http://host:port"
 * The legacy `getpot_bgutil_baseurl=...` key is NOT recognised by the
 * plugin and causes `Requested format is not available` because the
 * extractor falls back to a no-PO-token path.
 */
export function buildYoutubeExtractorArgs(): string {
  const clauses = [
    `player_client=${YOUTUBE_PLAYER_CLIENTS}`,
    // 8K needs the DASH manifest — skipping it collapses to 360p muxed.
    // Keep HLS skipped (duplicate, slower) but explicitly allow DASH.
    "skip=hls",
    "player_skip=webpage,configs",
  ];
  if (env.YOUTUBE_VISITOR_DATA && env.YOUTUBE_PO_TOKEN) {
    clauses.push(`visitor_data=${env.YOUTUBE_VISITOR_DATA}`);
    clauses.push(`po_token=${env.YOUTUBE_PO_TOKEN}`);
  }
  return `youtube:${clauses.join(";")}`;
}

function buildYoutubeBotFallbackExtractorArgs(client: string = "android"): string {
  return `youtube:player_client=${client}`;
}

/**
 * Returns the bgutil-ytdlp-pot-provider HTTP-server extractor-args entry,
 * or null when no base URL is configured. Syntax verified against
 * https://github.com/Brainicism/bgutil-ytdlp-pot-provider#usage
 */
export function buildBgutilPotExtractorArgs(): string | null {
  const base = env.YOUTUBE_GETPOT_BASE_URL?.trim();
  if (!base) return null;
  return `youtubepot-bgutilhttp:base_url=${base.replace(/\/$/, "")}`;
}

/** Push every YouTube-related --extractor-args entry as separate flags. */
export function pushYoutubeExtractorArgs(args: string[], youtubeClause: string): void {
  args.push("--extractor-args", youtubeClause);
  const pot = buildBgutilPotExtractorArgs();
  if (pot) args.push("--extractor-args", pot);
}

function pushCommonNetworkArgs(args: string[], userAgent = DEFAULT_USER_AGENT): void {
  args.push("--no-check-certificates");
  args.push("--add-headers", `Accept-Language:${DEFAULT_BROWSER_HEADERS["Accept-Language"]}`);
  args.push("--add-headers", "Accept:*/*");
  args.push("--add-headers", "Sec-Fetch-Mode:navigate");
  args.push("--user-agent", userAgent);
  // 8K downloader apps all use EJS + PO-token + JS runtime for SABR/n-sig bypass
  args.push("--remote-components", "ejs:github");
  args.push("--extractor-args", "youtube:player_skip=webpage");
}

export function addYoutubeBotFallbackArgs(args: string[], client: string = "android"): string[] {
  const out = [...args, "--extractor-args", buildYoutubeBotFallbackExtractorArgs(client)];
  const pot = buildBgutilPotExtractorArgs();
  if (pot) out.push("--extractor-args", pot);
  out.push("--sleep-interval", "2");
  return out;
}

export function getNextFallbackClient(last: string): string | null {
  const idx = YOUTUBE_FALLBACK_CLIENTS.indexOf(last as never);
  if (idx === -1 || idx + 1 >= YOUTUBE_FALLBACK_CLIENTS.length) return null;
  return YOUTUBE_FALLBACK_CLIENTS[idx + 1]!;
}

/**
 * Translate a DownloadPlan + output paths into a safe yt-dlp argv array.
 * All args are explicit — no shell interpolation.
 */
export function buildYtDlpArgs({ plan, outputTemplate, cookiesPath }: BuildArgsInput): string[] {
  const args: string[] = [
    "--no-colors",
    "--newline",
    "--no-playlist",
    "--no-warnings",
    "--no-call-home",
    "--restrict-filenames",
    "-o",
    outputTemplate,
  ];

  pushCommonNetworkArgs(args, plan.userAgent ?? DEFAULT_USER_AGENT);

  const proxyUrl = getYtDlpProxyUrl();
  if (proxyUrl) {
    args.push("--proxy", proxyUrl);
  }

  if (plan.format) {
    args.push("-f", plan.format);
  }

  if (plan.mergeOutputFormat) {
    args.push("--merge-output-format", plan.mergeOutputFormat);
  }

  if (plan.extractAudio) {
    args.push("-x");
    if (plan.audioFormat) args.push("--audio-format", plan.audioFormat);
    if (plan.audioQuality) args.push("--audio-quality", plan.audioQuality);
  }

  if (plan.referer) {
    args.push("--referer", plan.referer);
  }

  if (cookiesPath && plan.useCookies) {
    args.push("--cookies", cookiesPath);
  }

  for (const [k, v] of Object.entries(plan.extraHeaders ?? {})) {
    if (k.toLowerCase() === "accept-language") continue;
    args.push("--add-headers", `${k}:${v}`);
  }

  for (const extra of plan.extraArgs ?? []) {
    args.push(extra);
  }

  args.push(plan.url);
  return args;
}

export function buildMetadataArgs(
  url: string,
  cookiesPath?: string | null,
  useCookies = false,
  providerId?: string,
): string[] {
  const args = [
    "--dump-single-json",
    "--no-playlist",
    "--no-warnings",
    "--no-call-home",
    "--skip-download",
  ];
  pushCommonNetworkArgs(args, env.YOUTUBE_USER_AGENT ?? DEFAULT_USER_AGENT);
  if (providerId === "youtube") {
    pushYoutubeExtractorArgs(args, buildYoutubeExtractorArgs());
  }
  const proxyUrl = getYtDlpProxyUrl();
  if (proxyUrl) args.push("--proxy", proxyUrl);
  if (cookiesPath && useCookies) args.push("--cookies", cookiesPath);
  args.push(url);
  return args;
}