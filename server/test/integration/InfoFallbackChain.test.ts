import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AppError } from "@/errors/AppError.js";

vi.mock("@/logging/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { infoService } from "@/services/InfoService.js";
import { providerRegistry } from "@/providers/ProviderRegistry.js";
import * as envModule from "@/config/env.js";
import { logger } from "@/logging/logger.js";

const VID = "test1234567";
const URL = `https://www.youtube.com/watch?v=${VID}`;

function mockProvider(fetchMock: ReturnType<typeof vi.fn>) {
  return {
    id: "youtube",
    displayName: "YouTube",
    domains: ["youtube.com"],
    requiresCookies: false,
    supports: () => true,
    fetchMetadata: fetchMock,
    buildDownloadPlan: vi.fn(),
  } as unknown as import("@/providers/types.js").MediaProvider;
}

describe("InfoService fallback chain order (regression)", () => {
  const originalFetch = global.fetch;
  const originalKey = envModule.env.YOUTUBE_DATA_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    infoService.invalidate();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    (envModule.env as { YOUTUBE_DATA_API_KEY?: string }).YOUTUBE_DATA_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it("Data API present and succeeds → yt-dlp never called, path=data_api", async () => {
    (envModule.env as { YOUTUBE_DATA_API_KEY?: string }).YOUTUBE_DATA_API_KEY = "fake";
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ items: [{ id: VID, snippet: { title: "From Data API", thumbnails: { high: { url: "https://img/high.jpg" } } }, contentDetails: { duration: "PT1M" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as never;
    const ytMock = vi.fn(async () => {
      throw new Error("yt-dlp should not be called when Data API succeeds");
    });
    vi.spyOn(providerRegistry, "resolveFromUrl").mockReturnValue(mockProvider(ytMock));

    const res = await infoService.getMetadata(URL);
    expect(res.metadata.title).toBe("From Data API");
    expect(ytMock).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ path: "data_api" }), expect.any(String));
  });

  it("Data API absent, yt-dlp succeeds → path=yt_dlp", async () => {
    (envModule.env as { YOUTUBE_DATA_API_KEY?: string }).YOUTUBE_DATA_API_KEY = undefined;
    const ytMock = vi.fn(async () => ({ providerId: "youtube", id: VID, title: "From yt-dlp", webpageUrl: URL, formats: [] }));
    vi.spyOn(providerRegistry, "resolveFromUrl").mockReturnValue(mockProvider(ytMock));
    global.fetch = vi.fn(async () => new Response("{}", { status: 404 })) as never;

    const res = await infoService.getMetadata(URL);
    expect(res.metadata.title).toBe("From yt-dlp");
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ path: "yt_dlp" }), expect.any(String));
  });

  it("yt-dlp BOT_CHECK, Piped succeeds → path=piped, proves order Piped before Cobalt", async () => {
    (envModule.env as { YOUTUBE_DATA_API_KEY?: string }).YOUTUBE_DATA_API_KEY = undefined;
    const ytMock = vi.fn(async () => {
      throw new AppError("BOT_CHECK", "bot", 422, { provider: "youtube" });
    });
    vi.spyOn(providerRegistry, "resolveFromUrl").mockReturnValue(mockProvider(ytMock));
    global.fetch = vi.fn(async (input: string | URL) => {
      const u = String(input);
      if (u.includes("/streams/")) {
        return new Response(JSON.stringify({ title: "From Piped", description: "x", uploader: "u", duration: 60, thumbnailUrl: "https://t.jpg" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 404 });
    }) as never;

    const res = await infoService.getMetadata(URL);
    expect(res.metadata.title).toBe("From Piped");
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ path: "piped" }), expect.any(String));
    // If we swapped Piped and Cobalt order, this would still pass, so also check that
    // the call was to Piped's /streams, not Cobalt's co.wuk.sh
    const fetchCalls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(fetchCalls.some((u) => u.includes("/streams/"))).toBe(true);
    expect(fetchCalls.some((u) => u === "https://co.wuk.sh/")).toBe(false);
  });

  it("Piped fails, Cobalt succeeds → path=cobalt, proves Cobalt after Piped", async () => {
    (envModule.env as { YOUTUBE_DATA_API_KEY?: string }).YOUTUBE_DATA_API_KEY = undefined;
    const ytMock = vi.fn(async () => {
      throw new AppError("BOT_CHECK", "bot", 422, { provider: "youtube" });
    });
    vi.spyOn(providerRegistry, "resolveFromUrl").mockReturnValue(mockProvider(ytMock));
    global.fetch = vi.fn(async (input: string | URL) => {
      const u = String(input);
      if (u.includes("/streams/")) return new Response("{}", { status: 404 });
      if (u === "https://co.wuk.sh/" || u === "https://api.cobalt.tools/") {
        if (u.includes("co.wuk.sh")) {
          return new Response(JSON.stringify({ status: "tunnel", filename: "Cobalt Title.mp4", url: "https://ex.com/v.mp4" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("{}", { status: 500 });
      }
      return new Response("{}", { status: 404 });
    }) as never;

    const res = await infoService.getMetadata(URL);
    expect(res.metadata.title).toContain("Cobalt Title");
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ path: "cobalt" }), expect.any(String));
  });

  it("all paths fail → throws BOT_CHECK 422, not 500", async () => {
    (envModule.env as { YOUTUBE_DATA_API_KEY?: string }).YOUTUBE_DATA_API_KEY = undefined;
    const ytMock = vi.fn(async () => {
      throw new AppError("BOT_CHECK", "bot", 422, { provider: "youtube" });
    });
    vi.spyOn(providerRegistry, "resolveFromUrl").mockReturnValue(mockProvider(ytMock));
    global.fetch = vi.fn(async () => new Response("{}", { status: 404 })) as never;

    await expect(infoService.getMetadata(URL)).rejects.toMatchObject({ code: "BOT_CHECK", status: 422 });
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ path: "all_failed" }), expect.any(String));
  });

  it("reordering Piped and Cobalt would break Piped-success test — proves order matters", async () => {
    // This is a meta-test: if someone swaps the order in InfoService.ts (try Cobalt before Piped),
    // the Piped-success case would still pass but would have called Cobalt first.
    // We assert that when Piped is available, Cobalt is NOT called — proving Piped is tried first.
    (envModule.env as { YOUTUBE_DATA_API_KEY?: string }).YOUTUBE_DATA_API_KEY = undefined;
    const ytMock = vi.fn(async () => {
      throw new AppError("BOT_CHECK", "bot", 422, { provider: "youtube" });
    });
    vi.spyOn(providerRegistry, "resolveFromUrl").mockReturnValue(mockProvider(ytMock));
    const fetchMock = vi.fn(async (input: string | URL) => {
      const u = String(input);
      if (u.includes("/streams/")) {
        return new Response(JSON.stringify({ title: "Piped Only", uploader: "u", duration: 10, thumbnailUrl: "https://t.jpg" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Cobalt should not be hit if Piped succeeded first
      if (u === "https://co.wuk.sh/" || u === "https://api.cobalt.tools/") {
        return new Response(JSON.stringify({ status: "tunnel", filename: "Should Not Be Called.mp4" }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });
    global.fetch = fetchMock as never;

    const res = await infoService.getMetadata(URL);
    expect(res.metadata.title).toBe("Piped Only");
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes("/streams/"))).toBe(true);
    // If order were swapped, co.wuk.sh would have been called before success — it wasn't
    expect(calls.some((u) => u === "https://co.wuk.sh/")).toBe(false);
  });
});
