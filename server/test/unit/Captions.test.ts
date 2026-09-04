import { describe, it, expect } from "vitest";
import {
  parseJson3,
  parseTimedtextXml,
  parseVtt,
  sanitizeSegments,
  toSrt,
  toVtt,
} from "../../src/utils/captions.js";

const SAMPLE_XML = `<?xml version="1.0" encoding="utf-8" ?>
<transcript>
<text start="1.36" dur="1.68">We&#39;re no strangers to love</text>
<text start="18.64" dur="3.24">You know the rules</text>
</transcript>`;

const SAMPLE_JSON3 = {
  events: [
    { tStartMs: 1360, dDurationMs: 1680, segs: [{ utf8: "We're no " }, { utf8: "strangers\n" }] },
    { tStartMs: 18640, dDurationMs: 3240, segs: [{ utf8: "You know the rules" }] },
    { tStartMs: 22000, dDurationMs: 1000 },
  ],
};

const SAMPLE_VTT = `WEBVTT
Kind: captions
Language: en

00:00:01.360 --> 00:00:03.040
We're no strangers to love

00:00:18.640 --> 00:00:21.880
You know the rules
`;

describe("caption parsers", () => {
  it("parses timedtext XML with entity decoding", () => {
    const segs = parseTimedtextXml(SAMPLE_XML);
    expect(segs).toHaveLength(2);
    expect(segs[0]?.text).toBe("We're no strangers to love");
    expect(segs[0]?.start).toBeCloseTo(1.36);
    expect(segs[0]?.end).toBeCloseTo(3.04);
  });

  it("parses json3 events and skips seg-less events", () => {
    const segs = parseJson3(SAMPLE_JSON3);
    expect(segs).toHaveLength(2);
    expect(segs[0]?.text).toBe("We're no strangers");
    expect(segs[1]?.start).toBeCloseTo(18.64);
  });

  it("parses VTT cue blocks", () => {
    const segs = parseVtt(SAMPLE_VTT);
    expect(segs).toHaveLength(2);
    expect(segs[1]?.text).toBe("You know the rules");
    expect(segs[1]?.end).toBeCloseTo(21.88);
  });

  it("sanitizeSegments drops empties and caps length", () => {
    const segs = sanitizeSegments([
      { start: 0, end: 1, text: "  hi  " },
      { start: 2, end: 1, text: "bad range" },
      { start: 3, end: 4, text: "   " },
    ]);
    expect(segs).toHaveLength(1);
    expect(segs[0]?.text).toBe("hi");
  });

  it("toSrt/toVtt round-trip segments", () => {
    const segs = [
      { start: 1.36, end: 3.04, text: "Hello" },
      { start: 18.64, end: 21.88, text: "World" },
    ];
    const srt = toSrt(segs);
    expect(srt).toContain("1\n00:00:01,360 --> 00:00:03,040\nHello");
    expect(srt).toContain("2\n00:00:18,640 --> 00:00:21,880\nWorld");
    const vtt = toVtt(segs);
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("00:00:01.360 --> 00:00:03.040");
  });
});
