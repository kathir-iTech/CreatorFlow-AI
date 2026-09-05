import { describe, it, expect } from "vitest";
import { mapYtDlpError } from "@/engines/downloader/YtDlpEngine.js";

describe("mapYtDlpError no-detail guard", () => {
  it("never surfaces 'yt-dlp failed: null' for empty output", () => {
    const err = mapYtDlpError("", { providerId: "youtube", url: "https://www.youtube.com/watch?v=abc123" });
    expect(err.message).not.toContain("null");
    expect(err.message).toContain("abc123");
    expect(err.code).toBe("DOWNLOAD_FAILED");
  });

  it("treats output containing only a literal 'null' as no-detail", () => {
    const err = mapYtDlpError("null", { providerId: "youtube" });
    expect(err.message).not.toMatch(/failed: null/);
    expect(err.message).toContain("no usable detail");
  });

  it("prefers a real line over a trailing 'null'", () => {
    const err = mapYtDlpError("ERROR: private video\nnull", { providerId: "youtube" });
    expect(err.code).toBe("PRIVATE_CONTENT");
  });

  it("still surfaces a real last line", () => {
    const err = mapYtDlpError("ERROR: [youtube] xyz: Private video", { providerId: "youtube" });
    expect(err.code).toBe("PRIVATE_CONTENT");
  });
});
