import { LRUCache } from "lru-cache";
import { env } from "@/config/env.js";
import { cacheKey } from "@/utils/hash.js";
import { providerRegistry } from "@/providers/ProviderRegistry.js";
import type { MediaMetadata } from "@/providers/types.js";
import { extractYoutubeVideoId } from "@/engines/downloader/BotCheckDetector.js";
import { logger } from "@/logging/logger.js";
import { AppError } from "@/errors/AppError.js";

async function fetchPipedMetadata(videoId: string): Promise<MediaMetadata | null> {
  const bases = ["https://pipedapi.kavin.rocks", "https://pipedapi.adminforge.de"];
  const tryOne = async (base: string): Promise<MediaMetadata | null> => {
    try {
      const r = await fetch(`${base}/streams/${videoId}`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return null;
      const j = (await r.json()) as {
        title?: string;
        description?: string;
        shortDescription?: string;
        uploader?: string;
        uploaderName?: string;
        duration?: number;
        thumbnailUrl?: string;
        uploadDate?: string;
        views?: number;
      };
      if (!j.title) return null;
      logger.warn({ videoId, providerId: "youtube", path: "piped" }, "Piped metadata hit");
      return {
        providerId: "youtube",
        id: videoId,
        title: j.title,
        description: j.description ?? j.shortDescription,
        uploader: j.uploader ?? j.uploaderName,
        durationSec: typeof j.duration === "number" ? j.duration : undefined,
        thumbnail: j.thumbnailUrl,
        webpageUrl: `https://www.youtube.com/watch?v=${videoId}`,
        formats: [],
      };
    } catch {
      return null;
    }
  };
  const results = await Promise.all(bases.map((b) => tryOne(b)));
  const hit = results.find((r) => r !== null);
  if (hit) {
    logger.warn({ videoId, providerId: "youtube", path: "piped" }, "Piped metadata served");
    return hit;
  }
  logger.warn({ videoId, providerId: "youtube", path: "piped" }, "Piped metadata miss");
  return null;
}

async function fetchCobaltMetadata(videoId: string): Promise<MediaMetadata | null> {
  // Reuse CobaltService's underlying fetch but extract title if available.
  // Cobalt's / response sometimes includes filename with title, sometimes just url.
  // If not enough fields, return null and let caller throw original error.
  const bases = ["https://co.wuk.sh", "https://api.cobalt.tools"];
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  for (const base of bases) {
    try {
      const r = await fetch(`${base}/`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ url, videoQuality: "8", downloadMode: "auto", filenameStyle: "basic" }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) continue;
      const j = (await r.json()) as { status?: string; url?: string; picker?: Array<{ url?: string }>; filename?: string; text?: string };
      const filename = j.filename ?? j.text;
      if (!filename && !j.url && !j.picker?.[0]?.url) continue;
      // Use filename as title if present, else generic
      const title = filename ? filename.replace(/\.[^/.]+$/, "").replace(/_/g, " ") : `YouTube Video ${videoId}`;
      logger.warn({ videoId, providerId: "youtube", path: "cobalt" }, "Cobalt metadata hit");
      return {
        providerId: "youtube",
        id: videoId,
        title,
        webpageUrl: url,
        formats: [],
      };
    } catch {
      continue;
    }
  }
  logger.warn({ videoId, providerId: "youtube", path: "cobalt" }, "Cobalt metadata miss");
  return null;
}

const cache = new LRUCache<string, MediaMetadata>({
  max: env.METADATA_CACHE_MAX,
  ttl: env.METADATA_CACHE_TTL_MS,
});

async function fetchYoutubeDataApi(videoId: string, signal?: AbortSignal): Promise<MediaMetadata | null> {
  const key = env.YOUTUBE_DATA_API_KEY?.trim();
  if (!key || !videoId) return null;
  try {
    const u = new URL("https://www.googleapis.com/youtube/v3/videos");
    u.searchParams.set("part", "snippet,contentDetails,statistics");
    u.searchParams.set("id", videoId);
    u.searchParams.set("key", key);
    const r = await fetch(u, { signal: signal ?? AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      items?: Array<{
        id?: string;
        snippet?: { title?: string; description?: string; channelTitle?: string; thumbnails?: Record<string, { url?: string }>; publishedAt?: string };
        contentDetails?: { duration?: string };
        statistics?: { viewCount?: string };
      }>;
    };
    const item = j.items?.[0];
    if (!item?.id) return null;
    const thumb = item.snippet?.thumbnails?.maxres?.url ?? item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url;
    // ISO 8601 duration PT1H2M10S → seconds
    const iso = item.contentDetails?.duration ?? "";
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const dur = m ? (Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) : undefined;
    logger.info({ videoId, title: item.snippet?.title?.slice(0, 60) }, "Data API metadata hit (no yt-dlp)");
    return {
      providerId: "youtube",
      id: item.id,
      title: item.snippet?.title ?? "Untitled",
      description: item.snippet?.description,
      uploader: item.snippet?.channelTitle,
      durationSec: dur,
      thumbnail: thumb,
      webpageUrl: `https://www.youtube.com/watch?v=${videoId}`,
      formats: [],
    };
  } catch {
    return null;
  }
}

export class InfoService {
  async getMetadata(url: string, signal?: AbortSignal): Promise<{ metadata: MediaMetadata; cached: boolean; providerId: string }> {
    const provider = providerRegistry.resolveFromUrl(url);
    const key = cacheKey([provider.id, url]);
    const hit = cache.get(key);
    if (hit) {
      logger.warn({ providerId: provider.id, path: "cache" }, "InfoService cache hit");
      return { metadata: hit, cached: true, providerId: provider.id };
    }

    // b. YouTube Data API, if key set
    if (provider.id === "youtube" && env.YOUTUBE_DATA_API_KEY) {
      const vid = extractYoutubeVideoId(url);
      if (vid) {
        const viaApi = await fetchYoutubeDataApi(vid, signal);
        if (viaApi) {
          logger.warn({ videoId: vid, providerId: provider.id, path: "data_api" }, "Data API metadata served");
          cache.set(key, viaApi);
          return { metadata: viaApi, cached: false, providerId: provider.id };
        }
        logger.warn({ videoId: vid, providerId: provider.id, path: "data_api" }, "Data API miss, falling through to yt-dlp");
      }
    }

    // c. Direct yt-dlp
    try {
      const metadata = await provider.fetchMetadata(url, signal);
      logger.warn({ providerId: provider.id, path: "yt_dlp" }, "yt-dlp metadata served");
      cache.set(key, metadata);
      return { metadata, cached: false, providerId: provider.id };
    } catch (err) {
      // d. Piped fallback on BOT_CHECK
      const isBotCheck = err instanceof AppError && err.code === "BOT_CHECK";
      const vid = provider.id === "youtube" ? extractYoutubeVideoId(url) : null;
      if (isBotCheck && vid) {
        logger.warn({ videoId: vid, providerId: provider.id, path: "piped" }, "yt-dlp BOT_CHECK, trying Piped");
        const piped = await fetchPipedMetadata(vid);
        if (piped) {
          cache.set(key, piped);
          return { metadata: piped, cached: false, providerId: provider.id };
        }
        // e. Cobalt fallback
        logger.warn({ videoId: vid, providerId: provider.id, path: "cobalt" }, "Piped miss, trying Cobalt");
        const cobalt = await fetchCobaltMetadata(vid);
        if (cobalt) {
          cache.set(key, cobalt);
          return { metadata: cobalt, cached: false, providerId: provider.id };
        }
      }
      // f. All paths failed
      logger.warn({ providerId: provider.id, path: "all_failed", code: err instanceof AppError ? err.code : "UNKNOWN" }, "All metadata paths failed");
      throw err;
    }
  }

  invalidate(url?: string): void {
    if (!url) {
      cache.clear();
      return;
    }
    for (const key of cache.keys()) {
      if (key.includes(url)) cache.delete(key);
    }
  }
}

export const infoService = new InfoService();