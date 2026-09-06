import { describe, it, expect } from "vitest";
import { computeTimingFit, computeTopicFit, getPublishReadiness } from "@/services/PublishReadinessService.js";
import type { ChannelStatsVideo } from "@/services/ChannelStatsService.js";

const vids: ChannelStatsVideo[] = [
  { title: "How to Cook Perfect Pasta Carbonara", views: 50000, likes: 1000, comments: 100, publishedAt: "2026-08-04" }, // Tue
  { title: "Pasta Carbonara Secrets Revealed", views: 40000, likes: 900, comments: 90, publishedAt: "2026-08-11" }, // Tue
  { title: "Vlog: My Morning Routine", views: 5000, likes: 100, comments: 10, publishedAt: "2026-08-06" }, // Thu
  { title: "Vlog: Trip to Kyoto", views: 6000, likes: 120, comments: 12, publishedAt: "2026-08-07" }, // Fri
];

const CHANNEL_AVG = Math.round((50000 + 40000 + 5000 + 6000) / 4); // 25250

describe("computeTopicFit", () => {
  it("finds above-average fit when transcript overlaps high-view pasta videos", () => {
    const { fit, supporting, detail } = computeTopicFit(
      "In this pasta carbonara tutorial we cook perfect pasta with eggs and cheese",
      "Perfect Pasta Carbonara",
      ["pasta", "carbonara", "cooking"],
      vids,
      CHANNEL_AVG,
    );
    expect(fit).toBe("above-average");
    expect(supporting.length).toBeGreaterThan(0);
    expect(supporting[0]?.title.toLowerCase()).toContain("pasta");
    expect(detail?.matchedAvg).toBeGreaterThan(CHANNEL_AVG);
  });

  it("finds below-average fit when transcript overlaps low-view vlog videos", () => {
    const { fit, supporting } = computeTopicFit(
      "My morning routine vlog trip to Kyoto",
      "Morning Vlog Kyoto Trip",
      ["vlog", "morning", "kyoto"],
      vids,
      CHANNEL_AVG,
    );
    expect(fit).toBe("below-average");
    expect(supporting.length).toBeGreaterThan(0);
    expect(supporting[0]?.title.toLowerCase()).toContain("vlog");
  });

  it("returns insufficient-data when no overlap", () => {
    const { fit, supporting } = computeTopicFit(
      "Quantum physics explained with string theory and black holes",
      "Quantum Mechanics Deep Dive",
      ["physics", "quantum", "science"],
      vids,
      CHANNEL_AVG,
    );
    expect(fit).toBe("insufficient-data");
    expect(supporting).toEqual([]);
  });

  it("returns insufficient-data for empty transcript and sparse overlap", () => {
    const { fit } = computeTopicFit("", "", [], vids, CHANNEL_AVG);
    expect(fit).toBe("insufficient-data");
  });
});

describe("computeTimingFit", () => {
  it("reports match when scheduled day equals best-performing day", () => {
    // Best slot is Tue (pasta videos dominate). Scheduling on a Tue should match.
    const { fit, bestSlot, scheduledDay } = computeTimingFit("2026-08-18", vids); // 2026-08-18 is Tue
    expect(bestSlot?.day).toBe("Tue");
    expect(scheduledDay).toBe("Tue");
    expect(fit).toBe("match");
  });

  it("reports mismatch when scheduled day differs", () => {
    const { fit } = computeTimingFit("2026-08-20", vids); // Thu
    expect(fit).toBe("mismatch");
  });

  it("reports no-schedule-set when no date", () => {
    const { fit } = computeTimingFit(undefined, vids);
    expect(fit).toBe("no-schedule-set");
  });

  it("reports insufficient-data for empty history", () => {
    const { fit } = computeTimingFit("2026-08-18", []);
    expect(fit).toBe("insufficient-data");
  });
});

describe("getPublishReadiness demo guard", () => {
  it("returns insufficient-data when channel stats are demo (no API key or failure)", async () => {
    // No transcript/channel → underlying getChannelStats returns demo → readiness is demo
    const result = await getPublishReadiness({
      transcript: "some transcript about pasta",
      title: "Pasta Video",
      tags: ["pasta"],
      channel: "", // empty → demo fallback
    });
    expect(result.demo).toBe(true);
    expect(result.topicFit).toBe("insufficient-data");
    expect(result.timingFit).toBe("insufficient-data");
    expect(result.explanation).toMatch(/Not enough live channel data/i);
  });
});
