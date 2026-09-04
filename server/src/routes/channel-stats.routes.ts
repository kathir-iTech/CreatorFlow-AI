import { Router } from "express";

export const channelStatsRouter = Router();

// Demo dataset — clearly labeled as mock data.
// Drop in a real YouTube Data API key later without restructuring.
const DEMO_STATS = {
  channelName: "CreatorFlow Demo Channel",
  subscribers: 12_480,
  totalViews: 1_847_220,
  totalVideos: 64,
  avgViewsPerVideo: 28_863,
  recentVideos: [
    {
      title: "How I Grew to 10K Subs in 6 Months",
      views: 45_200,
      likes: 2_310,
      comments: 187,
      publishedAt: "2026-08-15",
    },
    {
      title: "5 Tools Every Creator Needs in 2026",
      views: 38_900,
      likes: 1_890,
      comments: 142,
      publishedAt: "2026-08-22",
    },
    {
      title: "Behind the Scenes: My Content Workflow",
      views: 22_400,
      likes: 1_200,
      comments: 89,
      publishedAt: "2026-08-29",
    },
    {
      title: "SEO Secrets That Tripled My Views",
      views: 31_100,
      likes: 1_640,
      comments: 123,
      publishedAt: "2026-09-01",
    },
    {
      title: "AI Tools for Thumbnails — Worth It?",
      views: 19_800,
      likes: 980,
      comments: 67,
      publishedAt: "2026-09-03",
    },
  ],
  viewsOverTime: [
    { date: "2026-07-01", views: 12_400 },
    { date: "2026-07-08", views: 14_200 },
    { date: "2026-07-15", views: 16_800 },
    { date: "2026-07-22", views: 19_100 },
    { date: "2026-07-29", views: 21_500 },
    { date: "2026-08-05", views: 24_800 },
    { date: "2026-08-12", views: 28_400 },
    { date: "2026-08-19", views: 32_100 },
    { date: "2026-08-26", views: 35_900 },
    { date: "2026-09-02", views: 38_600 },
  ],
};

channelStatsRouter.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=600");
  res.json({ data: DEMO_STATS, requestId: _req.id });
});
