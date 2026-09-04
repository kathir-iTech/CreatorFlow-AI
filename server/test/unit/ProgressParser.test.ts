import { describe, it, expect } from "vitest";
import { parseProgressLine } from "../../src/engines/downloader/ProgressParser.js";

describe("ProgressParser", () => {
  it("parses standard download line", () => {
    const ev = parseProgressLine("[download]  37.5% of   12.34MiB at  500.00KiB/s ETA 00:24");
    expect(ev?.type).toBe("progress");
    expect(ev?.percent).toBe(37.5);
    expect(ev?.speed).toContain("KiB/s");
    expect(ev?.eta).toBe("00:24");
  });

  it("recognizes stage lines", () => {
    expect(parseProgressLine("[Merger] Merging formats")?.type).toBe("stage");
    expect(parseProgressLine("[ExtractAudio] Destination: x.mp3")?.type).toBe("stage");
  });

  it("returns info for unrecognized output", () => {
    expect(parseProgressLine("Some misc line")?.type).toBe("info");
  });

  it("returns null for empty input", () => {
    expect(parseProgressLine("")).toBeNull();
  });
});
