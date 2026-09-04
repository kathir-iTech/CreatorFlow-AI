import { parseAndValidateUrl } from "@/security/UrlValidator.js";
import { UnsupportedUrlError } from "@/errors/AppError.js";
import type { MediaProvider, ProviderId } from "./types.js";
import { youtubeProvider } from "./youtube/YoutubeProvider.js";
import { instagramProvider } from "./instagram/InstagramProvider.js";
import { facebookProvider } from "./facebook/FacebookProvider.js";

/**
 * Central registry of all media providers. Adding a new platform is a single
 * line below — no other file in the codebase needs to change.
 */
export class ProviderRegistry {
  private readonly providers = new Map<ProviderId, MediaProvider>();

  register(provider: MediaProvider): void {
    this.providers.set(provider.id, provider);
  }

  list(): MediaProvider[] {
    return [...this.providers.values()];
  }

  get(id: ProviderId): MediaProvider | undefined {
    return this.providers.get(id);
  }

  resolveFromUrl(rawUrl: string): MediaProvider {
    const url = parseAndValidateUrl(rawUrl);
    for (const provider of this.providers.values()) {
      if (provider.supports(url)) return provider;
    }
    throw UnsupportedUrlError(rawUrl);
  }
}

export const providerRegistry = new ProviderRegistry();
providerRegistry.register(youtubeProvider);
providerRegistry.register(instagramProvider);
providerRegistry.register(facebookProvider);
// To add TikTok/X/Threads later: import and call providerRegistry.register(...)