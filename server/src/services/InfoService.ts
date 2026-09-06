import { LRUCache } from "lru-cache";
import { env } from "@/config/env.js";
import { cacheKey } from "@/utils/hash.js";
import { providerRegistry } from "@/providers/ProviderRegistry.js";
import type { MediaMetadata } from "@/providers/types.js";
import { extractYoutubeVideoId } from "@/engines/downloader/BotCheckDetector.js";
import { logger } from "@/logging/logger.js";

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
    if (hit) return { metadata: hit, cached: true, providerId: provider.id };

    // Data API first for YouTube — zero IP block, sanctioned, instant, and covers
    // title/description/thumbnail/duration/viewCount needed for Fetch/SEO/Thumbnail.
    // Only falls back to yt-dlp (which needs cookies/PO/IP) if Data API misses or no key.
    if (provider.id === "youtube" && env.YOUTUBE_DATA_API_KEY) {
      const vid = extractYoutubeVideoId(url);
      if (vid) {
        const viaApi = await fetchYoutubeDataApi(vid, signal);
        if (viaApi) {
          cache.set(key, viaApi);
          return { metadata: viaApi, cached: false, providerId: provider.id };
        }
      }
    }

    const metadata = await provider.fetchMetadata(url, signal);
    cache.set(key, metadata);
    return { metadata, cached: false, providerId: provider.id };
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