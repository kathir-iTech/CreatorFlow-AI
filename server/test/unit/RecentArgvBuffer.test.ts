import { describe, it, expect, beforeEach } from "vitest";
import { recordArgv, listRecentArgv, clearRecentArgv, redactArgv } from "../../src/runtime/RecentArgvBuffer.js";

describe("RecentArgvBuffer", () => {
  beforeEach(() => clearRecentArgv());

  it("redacts proxy credentials, po_token, and visitor_data in extractor-args", () => {
    const redacted = redactArgv([
      "--proxy", "http://user:pw@gate.example.com:8080",
      "--extractor-args", "youtube:player_client=web;po_token=SECRET123;visitor_data=ALSO_SECRET",
      "https://u:p@youtube.com/watch?v=abc",
    ]);
    expect(redacted[1]).toBe("http://***:***@gate.example.com:8080/");
    expect(redacted[3]).toContain("po_token=***");
    expect(redacted[3]).toContain("visitor_data=***");
    expect(redacted[3]).toContain("player_client=web");
    expect(redacted[4]).toContain("***:***@youtube.com");
    expect(redacted[3]).not.toContain("SECRET123");
    expect(redacted[3]).not.toContain("ALSO_SECRET");
  });

  it("records most-recent-first up to capacity 5", () => {
    for (let i = 0; i < 7; i++) {
      recordArgv({
        kind: "info",
        attempt: "primary",
        providerId: "youtube",
        url: `https://youtube.com/watch?v=v${i}`,
        argv: ["-f", "bv*+ba", `https://youtube.com/watch?v=v${i}`],
        result: "ok",
      });
    }
    const list = listRecentArgv();
    expect(list).toHaveLength(5);
    expect(list[0].formatArg).toBe("bv*+ba");
  });
});
