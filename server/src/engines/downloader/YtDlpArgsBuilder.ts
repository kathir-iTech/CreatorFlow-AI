import type { DownloadPlan } from "@/providers/types.js";
import { env, getYtDlpProxyUrl } from "@/config/env.js";
import { DEFAULT_BROWSER_HEADERS, DEFAULT_USER_AGENT } from "@/config/constants.js";

export interface BuildArgsInput {
  plan: DownloadPlan;
  outputTemplate: string;
  cookiesPath?: string | null;
}

// Put `android` FIRST: the web client is now SABR-restricted and many of
// its https formats are skipped ("YouTube is forcing SABR streaming"),
// collapsing the format ladder. `tv_simply` is the next-best non-SABR
// fallback, and `web` stays last as a final resort. Added `ios`/`web_creator`
// as explicit fallbacks (prompt Part 4) — ios often passes when android is blocked.
export const YOUTUBE_PLAYER_CLIENTS = "android,tv_simply,web";
export const YOUTUBE_FALLBACK_CLIENTS = ["android", "ios", "web_creator", "tv", "mediaconnect"] as const;

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
    // IMPORTANT: do NOT add `dash_manifest` to the skip list. The DASH
    // manifest is the only source of per-resolution video-only (bv*)
    // formats on YouTube; skipping it collapses every quality choice to
    // the same muxed 360p/720p file. We still skip HLS because it's
    // duplicative for YouTube and slower to probe.
    "skip=hls",
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
  args.push("--user-agent", userAgent);
  // Let yt-dlp download its JS signature-challenge solver bundle on first run.
  // "ejs:github" selects the Embeddable JavaScript runtime served from GitHub.
  args.push("--remote-components", "ejs:github");
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