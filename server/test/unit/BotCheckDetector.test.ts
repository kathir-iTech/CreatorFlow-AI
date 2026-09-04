import { describe, it, expect } from "vitest";
import {
  detectYoutubeBotCheck,
  extractYoutubeVideoId,
} from "@/engines/downloader/BotCheckDetector.js";

describe("detectYoutubeBotCheck", () => {
  it("matches the canonical YouTube anti-bot stderr line", () => {
    const stderr =
      "ERROR: [youtube] dQw4w9WgXcQ: Sign in to confirm you're not a bot. " +
      "Use --cookies-from-browser or --cookies for the authentication.";
    const r = detectYoutubeBotCheck(stderr, "youtube");
    expect(r.isBotCheck).toBe(true);
    expect(r.matchedPattern).toBeTruthy();
  });

  it("matches the 'that you are not a bot' wording variant", () => {
    const stderr =
      "ERROR: [youtube:tab] Sign in to confirm that you are not a bot";
    expect(detectYoutubeBotCheck(stderr, "youtube").isBotCheck).toBe(true);
  });

  it("matches 'confirm you're not a bot' standalone", () => {
    const stderr = "Please confirm you're not a bot to continue.";
    expect(detectYoutubeBotCheck(stderr, "youtube").isBotCheck).toBe(true);
  });

  it("matches 'verify you're not a bot'", () => {
    const stderr = "verify you're not a bot before continuing";
    expect(detectYoutubeBotCheck(stderr, "youtube").isBotCheck).toBe(true);
  });

  it("matches the [youtube]-tagged 'please sign in' variant", () => {
    const stderr = "ERROR: [youtube] abc12345678: Please sign in";
    expect(detectYoutubeBotCheck(stderr, "youtube").isBotCheck).toBe(true);
  });

  it("does NOT match 'please sign in' from a non-YouTube extractor", () => {
    const stderr = "ERROR: [instagram] abc: Please sign in to view this post";
    expect(detectYoutubeBotCheck(stderr, "instagram").isBotCheck).toBe(false);
  });

  it("does NOT misclassify Instagram login walls as BOT_CHECK", () => {
    const stderr =
      "ERROR: [Instagram] xyz: Instagram sent an empty media response. " +
      "Check if this post is accessible without being logged-in.";
    expect(detectYoutubeBotCheck(stderr, "instagram").isBotCheck).toBe(false);
  });

  it("does NOT misclassify Facebook errors as BOT_CHECK", () => {
    const stderr = "ERROR: [facebook] 123: Login required";
    expect(detectYoutubeBotCheck(stderr, "facebook").isBotCheck).toBe(false);
  });

  it("does NOT match an unrelated YouTube error (HTTP 404)", () => {
    const stderr = "ERROR: [youtube] xyz: HTTP Error 404: Not Found";
    expect(detectYoutubeBotCheck(stderr, "youtube").isBotCheck).toBe(false);
  });

  it("returns false for empty stderr", () => {
    expect(detectYoutubeBotCheck("", "youtube").isBotCheck).toBe(false);
  });

  it("returns false when providerId is not youtube even on matching text", () => {
    const stderr = "Sign in to confirm you're not a bot";
    expect(detectYoutubeBotCheck(stderr, "instagram").isBotCheck).toBe(false);
  });

  it("still matches when providerId is omitted (defensive default)", () => {
    // Engine sometimes lacks provider context (e.g. raw probe). Match anyway.
    const stderr = "Sign in to confirm you're not a bot";
    expect(detectYoutubeBotCheck(stderr).isBotCheck).toBe(true);
  });
});

describe("extractYoutubeVideoId", () => {
  it("extracts id from watch?v= URLs", () => {
    expect(extractYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });
  it("extracts id from youtu.be short URLs", () => {
    expect(extractYoutubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe(
      "dQw4w9WgXcQ",
    );
  });
  it("extracts id from /shorts/ URLs", () => {
    expect(extractYoutubeVideoId("https://www.youtube.com/shorts/abc123XYZ_-")).toBe(
      "abc123XYZ_-",
    );
  });
  it("returns undefined for non-YouTube URLs", () => {
    expect(extractYoutubeVideoId("https://instagram.com/reel/xyz")).toBeUndefined();
  });
  it("returns undefined for malformed input", () => {
    expect(extractYoutubeVideoId("not a url")).toBeUndefined();
  });
});