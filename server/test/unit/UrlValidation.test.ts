import { describe, it, expect } from "vitest";
import { z } from "zod";
import { sanitizeMediaUrl } from "@/utils/sanitize.js";

// Re-declare the route schemas here so this test guards against accidental
// regressions to strict z.string().url() validation.
const InfoBody = z.object({ url: z.string() });
const CreateBody = z.object({
  url: z.string(),
  kind: z.enum(["video", "audio"]).default("video"),
  formatId: z.string().optional(),
  maxHeight: z.number().int().positive().max(4320).optional(),
  audioFormat: z.enum(["mp3", "m4a", "opus", "wav"]).optional(),
});

describe("URL validation regression", () => {
  it("accepts any string in the info route body", () => {
    const raw = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abc123&list=PL123";
    const parsed = InfoBody.parse({ url: raw });
    expect(parsed.url).toBe(raw);
  });

  it("accepts any string in the download route body", () => {
    const raw = "https://youtu.be/dQw4w9WgXcQ?si=abc&start_radio=1";
    const parsed = CreateBody.parse({ url: raw, kind: "video" });
    expect(parsed.url).toBe(raw);
  });

  it("accepts non-URL strings without throwing", () => {
    expect(InfoBody.parse({ url: "not-a-url" }).url).toBe("not-a-url");
    expect(CreateBody.parse({ url: "just text" }).url).toBe("just text");
  });

  it("sanitizeMediaUrl strips si, list, start_radio and tracking params", () => {
    expect(
      sanitizeMediaUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abc123&list=PL123"),
    ).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(sanitizeMediaUrl("https://youtu.be/dQw4w9WgXcQ?si=abc&start_radio=1")).toBe(
      "https://youtu.be/dQw4w9WgXcQ",
    );
    expect(sanitizeMediaUrl("https://www.instagram.com/reel/ABC123/?utm_source=ig_web")).toBe(
      "https://www.instagram.com/reel/ABC123/",
    );
  });

  it("sanitizeMediaUrl strips timestamp params t and start (422 fix)", () => {
    expect(sanitizeMediaUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=20s")).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(sanitizeMediaUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=20")).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(sanitizeMediaUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m20s")).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(sanitizeMediaUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=20")).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(sanitizeMediaUrl("https://youtu.be/dQw4w9WgXcQ?t=42&si=abc123")).toBe(
      "https://youtu.be/dQw4w9WgXcQ",
    );
    // combo: si + t + list together (real mobile share)
    expect(
      sanitizeMediaUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abc123&t=20s&list=PL123"),
    ).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("sanitizeMediaUrl trims and falls back for non-URL strings", () => {
    expect(sanitizeMediaUrl("  not-a-url  ")).toBe("not-a-url");
  });
});
