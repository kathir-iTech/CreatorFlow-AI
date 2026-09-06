import { describe, it, expect } from "vitest";
import {
  demoStats,
  suggestSlots,
  viewsByPublishWeek,
  type ChannelStatsVideo,
} from "@/services/ChannelStatsService.js";

const vids: ChannelStatsVideo[] = [
  { title: "A", views: 1000, likes: 10, comments: 1, publishedAt: "2026-08-04" }, // Tue
  { title: "B", views: 5000, likes: 50, comments: 5, publishedAt: "2026-08-06" }, // Thu
  { title: "C", views: 3000, likes: 30, comments: 3, publishedAt: "2026-08-06" }, // Thu
  { title: "D", views: 200, likes: 2, comments: 0, publishedAt: "not-a-date" },
];

describe("suggestSlots", () => {
  it("ranks weekday slots by summed views", () => {
    const slots = suggestSlots(vids);
    expect(slots[0]?.day).toBe("Thu");
    expect(slots[0]?.score).toBe(8000);
    expect(slots.length).toBeLessThanOrEqual(3);
  });

  it("skips unparseable dates", () => {
    expect(suggestSlots(vids).every((s) => s.day && Number.isFinite(s.hour))).toBe(true);
  });

  it("returns empty for no videos", () => {
    expect(suggestSlots([])).toEqual([]);
  });
});

describe("viewsByPublishWeek", () => {
  it("buckets by Monday-start week, sorted", () => {
    const weeks = viewsByPublishWeek(vids);
    // 2026-08-04 (Tue) and 2026-08-06 (Thu) share the Mon 2026-08-03 week.
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toEqual({ date: "2026-08-03", views: 9000 });
  });
});

describe("demoStats", () => {
  it("is honestly labeled demo with a fresh timestamp", () => {
    const d = demoStats();
    expect(d.demo).toBe(true);
    expect(d.recentVideos.length).toBeGreaterThan(0);
    expect(typeof d.fetchedAt).toBe("string");
  });
});
