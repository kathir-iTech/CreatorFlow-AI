import { describe, it, expect } from "vitest";
import {
  canonicalizeMediaUrl,
  canonicalYoutubeWatchUrl,
  normalizeYoutubeUrl,
} from "@/utils/youtube.js";

// Part 2 — every shape a judge could paste from the YouTube share button or
// address bar must collapse to the same canonical video ID + URL.
describe("normalizeYoutubeUrl", () => {
  const ID = "5Qk6Xc2ZVkI";
  const CANONICAL = `https://www.youtube.com/watch?v=${ID}`;

  const shapes = [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&list=PL123&index=2`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=TtUAiLIGsv3TgJBY`, // exact failing case from prod
    `https://www.youtube.com/shorts/${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `https://youtu.be/${ID}?t=42&si=abc123`,
  ];

  for (const shape of shapes) {
    it(`normalizes ${shape}`, () => {
      const n = normalizeYoutubeUrl(shape);
      expect(n).not.toBeNull();
      expect(n?.videoId).toBe(ID);
      expect(n?.canonicalUrl).toBe(CANONICAL);
    });
  }

  it("returns null for non-YouTube URLs", () => {
    expect(normalizeYoutubeUrl("https://instagram.com/reel/xyz")).toBeNull();
    expect(normalizeYoutubeUrl("not a url")).toBeNull();
    expect(normalizeYoutubeUrl("")).toBeNull();
  });

  it("builds canonical watch URLs", () => {
    expect(canonicalYoutubeWatchUrl(ID)).toBe(CANONICAL);
  });
});

describe("canonicalizeMediaUrl", () => {
  it("collapses ?si= short links to the canonical watch URL", () => {
    expect(canonicalizeMediaUrl("https://youtu.be/5Qk6Xc2ZVkI?si=TtUAiLIGsv3TgJBY")).toBe(
      "https://www.youtube.com/watch?v=5Qk6Xc2ZVkI",
    );
  });

  it("sanitizes non-YouTube URLs instead of dropping them", () => {
    expect(canonicalizeMediaUrl("https://www.instagram.com/reel/ABC123/?utm_source=ig_web")).toBe(
      "https://www.instagram.com/reel/ABC123/",
    );
  });

  it("never throws on garbage input", () => {
    expect(canonicalizeMediaUrl("  not a url  ")).toBe("not a url");
  });
});
