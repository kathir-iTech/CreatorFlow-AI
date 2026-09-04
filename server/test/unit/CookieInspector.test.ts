import { describe, it, expect } from "vitest";
import { parseNetscapeCookies } from "../../src/runtime/CookieInspector.js";

describe("CookieInspector.parseNetscapeCookies", () => {
  it("parses expiry, flags session cookies, and never returns cookie values", () => {
    const future = Math.floor(Date.now() / 1000) + 7 * 86400;
    const past = Math.floor(Date.now() / 1000) - 86400;
    const content = [
      "# Netscape HTTP Cookie File",
      `.youtube.com\tTRUE\t/\tTRUE\t${future}\t__Secure-3PSID\tVALUE_NOT_LEAKED`,
      `.youtube.com\tTRUE\t/\tTRUE\t${past}\tSID\tOLD`,
      `.youtube.com\tTRUE\t/\tFALSE\t0\tSESSION_ONLY\tX`,
    ].join("\n");
    const parsed = parseNetscapeCookies(content);
    expect(parsed).toHaveLength(3);
    const psid = parsed.find((c) => c.name === "__Secure-3PSID")!;
    expect(psid.expired).toBe(false);
    expect(psid.daysUntilExpiry!).toBeGreaterThan(5);
    expect(parsed.find((c) => c.name === "SID")!.expired).toBe(true);
    expect(parsed.find((c) => c.name === "SESSION_ONLY")!.sessionOnly).toBe(true);
    expect(JSON.stringify(parsed)).not.toContain("VALUE_NOT_LEAKED");
  });
});
