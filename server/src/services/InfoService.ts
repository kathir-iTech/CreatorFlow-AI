import { LRUCache } from "lru-cache";
import { env } from "@/config/env.js";
import { cacheKey } from "@/utils/hash.js";
import { providerRegistry } from "@/providers/ProviderRegistry.js";
import type { MediaMetadata } from "@/providers/types.js";

const cache = new LRUCache<string, MediaMetadata>({
  max: env.METADATA_CACHE_MAX,
  ttl: env.METADATA_CACHE_TTL_MS,
});

export class InfoService {
  async getMetadata(url: string): Promise<{ metadata: MediaMetadata; cached: boolean; providerId: string }> {
    const provider = providerRegistry.resolveFromUrl(url);
    const key = cacheKey([provider.id, url]);
    const hit = cache.get(key);
    if (hit) return { metadata: hit, cached: true, providerId: provider.id };

    const metadata = await provider.fetchMetadata(url);
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