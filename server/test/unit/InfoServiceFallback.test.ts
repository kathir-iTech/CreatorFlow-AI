import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AppError } from "@/errors/AppError.js";

// Mock logger to avoid noise and capture path field
vi.mock("@/logging/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { infoService } from "@/services/InfoService.js";
import { providerRegistry } from "@/providers/ProviderRegistry.js";
import * as envModule from "@/config/env.js";
import { logger } from "@/logging/logger.js";

const VID = "dQw4w9WgXcQ";
const URL = `https://www.youtube.com/watch?v=${VID}`;

function mockProvider(impl: { fetchMetadata: ReturnType<typeof vi.fn> }) {
  return {
    id: "youtube",
    displayName: "YouTube",
    domains: ["youtube.com"],
    requiresCookies: false,
    supports: () => true,
    fetchMetadata: impl.fetchMetadata,
    buildDownloadPlan: vi.fn(),
  } as unknown as import("@/providers/types.js").MediaProvider;
}

describe("InfoService fallback chain", () => {
  const originalFetch = global.fetch;
  const originalKey = envModule.env.YOUTUBE_DATA_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear LRU cache
    infoService.invalidate();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    (envModule.env as { YOUTUBE_DATA_API_KEY?: string }).YOUTUBE_DATA_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it("Data API succeeds → returns Data API result, yt-dlp never invoked", async () => {
    (envModule.env as { YOUTUBE_DATA_API_KEY?: string }).YOUTUBE_DATA_API_KEY = "fake-key";
    const dataApiPayload = {
      items: [
        {
          id: VID,
          snippet: { title: "Data API Title", description: "Desc", channelTitle: "Chan", thumbnails: { high: { url: "https://img.youtube.com/vi/abc/hqdefault.jpg" } } },
          contentDetails: { duration: "PT1M30S" },
        },
      ],
    };
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify(dataApiPayload), { status: 200, headers: { "Content-Type": "application/json" } }),
    ) as never;

    const ytMock = vi.fn(async () => {
      throw new Error("should not be called");
    });
    vi.spyOn(providerRegistry, "resolveFromUrl").mockReturnValue(mockProvider({ fetchMetadata: ytMock }));

    const res = await infoService.getMetadata(URL);
    expect(res.metadata.title).toBe("Data API Title");
    expect(res.metadata.id).toBe(VID);
    expect(ytMock).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ path: "data_api" }), expect.any(String));
  });

  it("Data API absent, yt-dlp succeeds → returns yt-dlp result", async () => {
    (envModule.env as { YOUTUBE_DATA_API_KEY?: string }).YOUTUBE_DATA_API_KEY = undefined;
    const ytMeta = { providerId: "youtube", id: VID, title: "yt-dlp Title", webpageUrl: URL, formats: [] } as import("@/providers/types.js").MediaMetadata;
    const ytMock = vi.fn(async () => ytMeta);
    vi.spyOn(providerRegistry, "resolveFromUrl").mockReturnValue(mockProvider({ fetchMetadata: ytMock }));
    global.fetch = vi.fn(async () => new Response("{}", { status: 404 })) as never;

    const res = await infoService.getMetadata(URL);
    expect(res.metadata.title).toBe("yt-dlp Title");
    expect(ytMock).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ path: "yt_dlp" }), expect.any(String));
  });

  it("yt-dlp BOT_CHECK, Piped succeeds → returns Piped result with path piped", async () => {
    (envModule.env as { YOUTUBE_DATA_API_KEY?: string }).YOUTUBE_DATA_API_KEY = undefined;
    const ytMock = vi.fn(async () => {
      throw new AppError("BOT_CHECK", "bot", 422, { provider: "youtube" });
    });
    vi.spyOn(providerRegistry, "resolveFromUrl").mockReturnValue(mockProvider({ fetchMetadata: ytMock }));

    // Mock Piped /streams
    global.fetch = vi.fn(async (input: string | URL) => {
      const u = String(input);
      if (u.includes("/streams/")) {
        return new Response(
          JSON.stringify({ title: "Piped Title", description: "Piped Desc", uploader: "PipedChan", duration: 123, thumbnailUrl: "https://pics/piped.jpg" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("{}", { status: 404 });
    }) as never;

    const res = await infoService.getMetadata(URL);
    expect(res.metadata.title).toBe("Piped Title");
    expect(res.metadata.id).toBe(VID);
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ path: "piped" }), expect.stringMatching(/Piped/));
  });

  it("yt-dlp BOT_CHECK, Piped fails, Cobalt succeeds → returns Cobalt result", async () => {
    (envModule.env as { YOUTUBE_DATA_API_KEY?: string }).YOUTUBE_DATA_API_KEY = undefined;
    const ytMock = vi.fn(async () => {
      throw new AppError("BOT_CHECK", "bot", 422, { provider: "youtube" });
    });
    vi.spyOn(providerRegistry, "resolveFromUrl").mockReturnValue(mockProvider({ fetchMetadata: ytMock }));

    global.fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const u = String(input);
      if (u.includes("/streams/")) {
        return new Response("{}", { status: 404 });
      }
      if (u === "https://co.wuk.sh/" || u === "https://api.cobalt.tools/") {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        // Only first cobalt instance succeeds
        if (u.includes("co.wuk.sh")) {
          return new Response(JSON.stringify({ status: "tunnel", filename: "Cobalt Video Title.mp4", url: "https://example.com/video.mp4" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("{}", { status: 500 });
      }
      return new Response("{}", { status: 404 });
    }) as never;

    const res = await infoService.getMetadata(URL);
    expect(res.metadata.title).toContain("Cobalt Video Title");
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ path: "cobalt" }), expect.any(String));
  });

  it("all paths fail → throws original BOT_CHECK (not generic 500)", async () => {
    (envModule.env as { YOUTUBE_DATA_API_KEY?: string }).YOUTUBE_DATA_API_KEY = undefined;
    const botErr = new AppError("BOT_CHECK", "bot", 422, { provider: "youtube" });
    const ytMock = vi.fn(async () => {
      throw botErr;
    });
    vi.spyOn(providerRegistry, "resolveFromUrl").mockReturnValue(mockProvider({ fetchMetadata: ytMock }));
    global.fetch = vi.fn(async () => new Response("{}", { status: 404 })) as never;

    await expect(infoService.getMetadata(URL)).rejects.toMatchObject({ code: "BOT_CHECK", status: 422 });
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ path: "all_failed" }), expect.any(String));
  });
});
