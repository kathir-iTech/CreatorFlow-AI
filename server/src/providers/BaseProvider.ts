import { ytDlpEngine } from "@/engines/downloader/YtDlpEngine.js";
import { DEFAULT_USER_AGENT } from "@/config/constants.js";
import type {
  DownloadPlan,
  DownloadRequest,
  MediaFormat,
  MediaMetadata,
  MediaProvider,
  ProviderId,
  RawMetadata,
} from "./types.js";

export abstract class BaseProvider implements MediaProvider {
  abstract readonly id: ProviderId;
  abstract readonly displayName: string;
  abstract readonly domains: readonly string[];
  readonly requiresCookies: boolean = false;

  supports(url: URL): boolean {
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return this.domains.some((d) => host === d || host.endsWith(`.${d}`));
  }

  async fetchMetadata(url: string): Promise<MediaMetadata> {
    // YouTube has `requiresCookies=false` (cookies are optional) but the
    // subclass sets `useCookies=true` in the download plan; for metadata
    // we follow the same rule so cookies.txt — if present — is also used
    // for /info calls. Other providers fall back to `requiresCookies`.
    const useCookies = this.id === "youtube" ? true : this.requiresCookies;
    const raw = await ytDlpEngine.fetchMetadata(url, useCookies, this.id);
    return this.normalizeMetadata(url, raw);
  }

  protected normalizeMetadata(url: string, raw: RawMetadata): MediaMetadata {
    const formats: MediaFormat[] = (raw.formats ?? [])
      .filter((f) => typeof f.format_id === "string")
      .map((f) => ({
        formatId: String(f.format_id),
        ext: String(f.ext ?? ""),
        quality: f.format_note ?? (f.height ? `${f.height}p` : undefined),
        resolution: f.resolution ?? (f.width && f.height ? `${f.width}x${f.height}` : undefined),
        vcodec: f.vcodec,
        acodec: f.acodec,
        filesize: f.filesize ?? f.filesize_approx,
        fps: f.fps,
        abr: f.abr,
        hasVideo: !!f.vcodec && f.vcodec !== "none",
        hasAudio: !!f.acodec && f.acodec !== "none",
      }));

    return {
      providerId: this.id,
      id: String(raw.id ?? ""),
      title: String(raw.title ?? "Untitled"),
      description: raw.description ? String(raw.description) : undefined,
      uploader: raw.uploader ? String(raw.uploader) : undefined,
      durationSec: typeof raw.duration === "number" ? raw.duration : undefined,
      thumbnail: raw.thumbnail ? String(raw.thumbnail) : undefined,
      webpageUrl: String(raw.webpage_url ?? url),
      formats,
    };
  }

  buildDownloadPlan(metadata: MediaMetadata, request: DownloadRequest): DownloadPlan {
    const plan: DownloadPlan = {
      providerId: this.id,
      url: metadata.webpageUrl,
      userAgent: DEFAULT_USER_AGENT,
      useCookies: this.requiresCookies,
      requestedMaxHeight: request.maxHeight,
    };

    if (request.kind === "audio") {
      plan.format = "bestaudio/best";
      plan.extractAudio = true;
      plan.audioFormat = request.audioFormat ?? "mp3";
      plan.audioQuality = "0"; // best
      return this.customizePlan(plan, metadata, request);
    }

    if (request.formatId) {
      plan.format = request.formatId;
    } else if (request.maxHeight) {
      // Cascading format string — every branch is bounded by [height<=H]
      // so the selector cannot silently collapse to an unbounded "best"
      // (which is what produced the 360p HLS fallback when cookies were
      // attached). Prefer MP4/M4A so the merge is a fast remux, then any
      // codec, then any muxed <=H. No global `best` escape hatch.
      const h = request.maxHeight;
      plan.format = [
        `bv*[height<=${h}][ext=mp4]+ba[ext=m4a]`,
        `bv*[height<=${h}]+ba`,
        `bv[height<=${h}]+ba`,
        `b[height<=${h}][ext=mp4]`,
        `b[height<=${h}]`,
      ].join("/");
    } else {
      plan.format = "bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b";
    }
    plan.mergeOutputFormat = "mp4";
    return this.customizePlan(plan, metadata, request);
  }

  /** Subclasses can tweak the plan (headers, referer, cookies, extra args). */
  protected customizePlan(plan: DownloadPlan, _metadata: MediaMetadata, _request: DownloadRequest): DownloadPlan {
    return plan;
  }
}