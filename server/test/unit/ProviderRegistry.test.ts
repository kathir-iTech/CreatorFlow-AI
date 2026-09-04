import { describe, it, expect } from "vitest";
import { providerRegistry } from "../../src/providers/ProviderRegistry.js";

describe("ProviderRegistry", () => {
  it("resolves YouTube URLs", () => {
    expect(providerRegistry.resolveFromUrl("https://www.youtube.com/watch?v=abc").id).toBe("youtube");
    expect(providerRegistry.resolveFromUrl("https://youtu.be/abc").id).toBe("youtube");
  });

  it("resolves Instagram URLs", () => {
    expect(providerRegistry.resolveFromUrl("https://www.instagram.com/reel/xyz/").id).toBe("instagram");
  });

  it("resolves Facebook URLs", () => {
    expect(providerRegistry.resolveFromUrl("https://www.facebook.com/watch?v=1").id).toBe("facebook");
    expect(providerRegistry.resolveFromUrl("https://fb.watch/abc").id).toBe("facebook");
  });

  it("throws on unsupported URLs", () => {
    expect(() => providerRegistry.resolveFromUrl("https://example.com/x")).toThrow();
  });

  it("rejects non-http(s) URLs", () => {
    expect(() => providerRegistry.resolveFromUrl("ftp://x.com")).toThrow();
  });
});