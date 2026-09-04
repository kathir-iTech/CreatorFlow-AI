import { describe, it, expect } from "vitest";
import { buildYtDlpArgs, buildMetadataArgs } from "../../src/engines/downloader/YtDlpArgsBuilder.js";
import { youtubeProvider } from "../../src/providers/youtube/YoutubeProvider.js";
import type { MediaMetadata } from "../../src/providers/types.js";

describe("YtDlpArgsBuilder", () => {
  it("builds basic video plan", () => {
    const args = buildYtDlpArgs({
      plan: { providerId: "youtube", url: "https://x", format: "bv+ba", mergeOutputFormat: "mp4" },
      outputTemplate: "/tmp/out.%(ext)s",
    });
    expect(args).toContain("-f");
    expect(args).toContain("bv+ba");
    expect(args).toContain("--merge-output-format");
    expect(args).toContain("mp4");
    expect(args[args.length - 1]).toBe("https://x");
  });

  it("adds cookies only when useCookies and path set", () => {
    const a = buildYtDlpArgs({
      plan: { providerId: "youtube", url: "u", useCookies: true },
      outputTemplate: "o",
      cookiesPath: "/tmp/c.txt",
    });
    expect(a).toContain("--cookies");

    const b = buildYtDlpArgs({
      plan: { providerId: "youtube", url: "u", useCookies: false },
      outputTemplate: "o",
      cookiesPath: "/tmp/c.txt",
    });
    expect(b).not.toContain("--cookies");
  });

  it("builds audio extraction args", () => {
    const a = buildYtDlpArgs({
      plan: { providerId: "y", url: "u", extractAudio: true, audioFormat: "mp3", audioQuality: "0" },
      outputTemplate: "o",
    });
    expect(a).toContain("-x");
    expect(a).toContain("--audio-format");
    expect(a).toContain("mp3");
  });

  it("metadata args include --dump-single-json", () => {
    expect(buildMetadataArgs("u")).toContain("--dump-single-json");
  });

  it("metadata args pass YouTube cookies and hardening flags", () => {
    const args = buildMetadataArgs("https://www.youtube.com/watch?v=x", "/tmp/cookies.txt", true, "youtube");
    expect(args).toContain("--cookies");
    expect(args[args.indexOf("--cookies") + 1]).toBe("/tmp/cookies.txt");
    expect(args).toContain("--no-check-certificates");
    expect(args).toContain("--add-headers");
    expect(args).toContain("Accept-Language:en-US,en;q=0.9");
    expect(args).toContain("--remote-components");
    expect(args[args.indexOf("--remote-components") + 1]).toBe("ejs:github");
    expect(args).toContain("--extractor-args");
    expect(args).toContain("youtube:player_client=android,tv_simply,web;skip=hls");
  });

  it("builds different YouTube -f selectors for different requested heights", () => {
    const metadata: MediaMetadata = {
      providerId: "youtube",
      id: "video-id",
      title: "Video",
      webpageUrl: "https://www.youtube.com/watch?v=video-id",
      formats: [],
    };

    const plan144 = youtubeProvider.buildDownloadPlan(metadata, {
      url: metadata.webpageUrl,
      kind: "video",
      maxHeight: 144,
    });
    const plan1080 = youtubeProvider.buildDownloadPlan(metadata, {
      url: metadata.webpageUrl,
      kind: "video",
      maxHeight: 1080,
    });

    const args144 = buildYtDlpArgs({ plan: plan144, outputTemplate: "/tmp/out.%(ext)s", cookiesPath: "/tmp/cookies.txt" });
    const args1080 = buildYtDlpArgs({ plan: plan1080, outputTemplate: "/tmp/out.%(ext)s", cookiesPath: "/tmp/cookies.txt" });
    const format144 = args144[args144.indexOf("-f") + 1];
    const format1080 = args1080[args1080.indexOf("-f") + 1];

    expect(format144).toContain("height=144");
    expect(format144).toContain("height<=144");
    expect(format1080).toContain("height=1080");
    expect(format1080).toContain("height<=1080");
    expect(format144).not.toBe(format1080);
    expect(format144).not.toContain("b[height<=144]");
    expect(format1080).not.toContain("b[height<=1080]");
    expect(args144).toContain("--cookies");
    expect(args1080).toContain("--cookies");
    expect(args144).toContain("--no-check-certificates");
    expect(args144).toContain("Accept-Language:en-US,en;q=0.9");
    expect(args144).toContain("--remote-components");
    expect(args144[args144.indexOf("--remote-components") + 1]).toBe("ejs:github");
    expect(args144).toContain("youtube:player_client=android,tv_simply,web;skip=hls");
  });
});