import { BaseProvider } from "../BaseProvider.js";
import { DEFAULT_BROWSER_HEADERS, DEFAULT_USER_AGENT } from "@/config/constants.js";
import { env } from "@/config/env.js";
import { buildYoutubeExtractorArgs, buildBgutilPotExtractorArgs } from "@/engines/downloader/YtDlpArgsBuilder.js";
import type { DownloadPlan, DownloadRequest, MediaMetadata } from "../types.js";

export class YoutubeProvider extends BaseProvider {
  readonly id = "youtube";
  readonly displayName = "YouTube";
  readonly domains = ["youtube.com", "youtu.be", "music.youtube.com", "m.youtube.com"];
  readonly requiresCookies = false; // cookies optional; needed only for age-gated / member content

  protected override customizePlan(
    plan: DownloadPlan,
    _metadata: MediaMetadata,
    request: DownloadRequest,
  ): DownloadPlan {
    // Keep format selectors untouched; only update the extractor clients / PO
    // token helper. Avoid TV clients because they have separate PO-token requirements.
    const extractorArg = buildYoutubeExtractorArgs();
    const potArg = buildBgutilPotExtractorArgs();

    const youtubePlan: DownloadPlan = {
      ...plan,
      userAgent: env.YOUTUBE_USER_AGENT ?? DEFAULT_USER_AGENT,
      referer: "https://www.youtube.com/",
      // Cookies are optional but, if present, use them — helps with age-gated and bot challenges.
      useCookies: true,
      extraHeaders: {
        ...DEFAULT_BROWSER_HEADERS,
        ...(plan.extraHeaders ?? {}),
      },
      extraArgs: [
        ...(plan.extraArgs ?? []),
        "--extractor-args",
        extractorArg,
        ...(potArg ? ["--extractor-args", potArg] : []),
        // NOTE: intentionally NO `-S` sort flag. Empirically `-S res,...`
        // was overriding the explicit `-f` cascade and collapsing picks
        // to format 18 (360p) even when 1080p was available. Let the
        // `-f` selector alone decide the format.
        // Throttle slightly so the request pattern looks like a browser,
        // not a scraper hammering the Innertube API.
        "--sleep-requests",
        "1",
        "--sleep-interval",
        "1",
        "--max-sleep-interval",
        "3",
        // Retry transient 403/429s instead of failing the whole job.
        "--retries",
        "5",
        "--fragment-retries",
        "10",
      ],
    };

    if (request.kind === "video" && !request.formatId) {
      if (request.maxHeight) {
        const h = request.maxHeight;
        // Prioritize DASH (separate video+audio) over legacy progressive muxed
        // formats like format 18 (360p). Try MP4/M4A first, then any DASH,
        // then only fall back to a muxed stream or best available.
        youtubePlan.format = [
          `bv*[height<=${h}][ext=mp4]+ba[ext=m4a]`,
          `bv*[height<=${h}]+ba`,
          `bv*+ba`,
          `b[height<=${h}]`,
          `best`,
        ].join("/");
      } else {
        youtubePlan.format = "bv*+ba/best";
      }
    }

    return youtubePlan;
  }
}

export const youtubeProvider = new YoutubeProvider();