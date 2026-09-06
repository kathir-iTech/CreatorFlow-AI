import { env } from "@/config/env.js";
import { logger } from "@/logging/logger.js";

/**
 * ChannelStatsService — Schedule-tab data. LIVE YouTube Data API v3 when
 * YOUTUBE_DATA_API_KEY is set (and a channel given), otherwise the bundled
 * example dataset. It NEVER throws for API problems: any failure degrades
 * to example data with demo:true so the UI keeps working with an honest
 * label. It does NOT touch yt-dlp, jobs, or the filesystem.
 */

export interface ChannelStatsVideo {
  title: string;
  views: number;
  likes: number;
  comments: number;
  publishedAt: string; // YYYY-MM-DD
}

export interface SuggestedSlot {
  day: string; // Mon..Sun
  hour: number; // 0-23 UTC
  score: number; // summed views behind this slot
}

export interface ChannelStatsResult {
  channelName: string;
  subscribers: number | null; // null when hiddenSubscriberCount is true
  subscribersHidden: boolean;
  totalViews: number;
  totalVideos: number;
  avgViewsPerVideo: number;
  recentVideos: ChannelStatsVideo[];
  viewsOverTime: { date: string; views: number }[];
  suggestedSlots: SuggestedSlot[];
  demo: boolean;
  channelId?: string;
  fetchedAt: string;
}

const DEMO: Omit<ChannelStatsResult, "fetchedAt"> = {
  channelName: "CreatorFlow Demo Channel",
  subscribers: 12_480,
  subscribersHidden: false,
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
  suggestedSlots: [],
  demo: true,
};

export function demoStats(): ChannelStatsResult {
  return { ...DEMO, fetchedAt: new Date().toISOString() };
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Rank (weekday, UTC hour) slots by summed views of videos published in them. */
export function suggestSlots(videos: ChannelStatsVideo[], take = 3): SuggestedSlot[] {
  const scores = new Map<string, number>();
  for (const v of videos) {
    const d = new Date(`${v.publishedAt}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${DAY_NAMES[d.getUTCDay()]}|${d.getUTCHours()}`;
    scores.set(key, (scores.get(key) ?? 0) + v.views);
  }
  return [...scores.entries()]
    .map(([key, score]) => {
      const [day, hour] = key.split("|") as [string, string];
      return { day, hour: Number(hour), score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, take);
}

/**
 * Weekly buckets of recent-video views by PUBLISH week. This is output
 * cadence aggregation, not historical Analytics API data (which needs
 * OAuth) — documented here so nobody mistakes it for watch-time history.
 */
export function viewsByPublishWeek(videos: ChannelStatsVideo[]): { date: string; views: number }[] {
  const buckets = new Map<string, number>();
  for (const v of videos) {
    const d = new Date(`${v.publishedAt}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) continue;
    // Monday-start week key.
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + v.views);
  }
  return [...buckets.entries()]
    .map(([date, views]) => ({ date, views }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const CACHE_TTL_MS = 20 * 60_000; // 20 min — quota is 10k units/day; don't burn it on refreshes
const cache = new Map<string, { at: number; data: ChannelStatsResult }>();

async function apiGet(path: string, params: Record<string, string>, key: string): Promise<unknown> {
  const u = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("key", key);
  const res = await fetch(u, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube Data API ${res.status}: ${body.slice(0, 200) || "no detail"}`);
  }
  return res.json() as Promise<unknown>;
}

interface ChannelsResponse {
  items?: Array<{
    id?: string;
    snippet?: { title?: string };
    statistics?: {
      subscriberCount?: string;
      hiddenSubscriberCount?: boolean;
      viewCount?: string;
      videoCount?: string;
    };
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }>;
}

async function fetchLive(channel: string, key: string): Promise<ChannelStatsResult> {
  const trimmed = channel.trim().replace(/^@/, "");
  // channels.list: 1 quota unit. Prefer direct ID, else resolve handle.
  const channelParams: Record<string, string> =
    /^UC[A-Za-z0-9_-]{22}$/.test(trimmed)
      ? { id: trimmed }
      : { forHandle: trimmed.startsWith("@") ? trimmed : `@${trimmed}` };
  const ch = (await apiGet(
    "channels",
    { part: "snippet,statistics,contentDetails", maxResults: "1", ...channelParams },
    key,
  )) as ChannelsResponse;
  const item = ch.items?.[0];
  // Part 0 live proof: log the unmodified API response for this handle
  // (channelId + title + raw statistics) before any transformation, so a
  // round 5,000,000 can be traced to its true source.
  logger.info(
    {
      requestedHandle: trimmed,
      resolvedChannelId: item?.id ?? null,
      resolvedTitle: item?.snippet?.title ?? null,
      rawStatistics: item?.statistics ?? null,
    },
    "channel-stats raw YouTube API response",
  );
  const uploads = item?.contentDetails?.relatedPlaylists?.uploads;
  if (!item?.id || !uploads) throw new Error("Channel not found");

  const num = (s?: string) => {
    const n = Number(s ?? 0);
    return Number.isFinite(n) ? Math.round(n) : 0;
  };
  // playlistItems.list: 1 unit. Uploads playlist = newest first, no search cost.
  const pl = (await apiGet(
    "playlistItems",
    { part: "contentDetails", playlistId: uploads, maxResults: "10" },
    key,
  )) as { items?: Array<{ contentDetails?: { videoId?: string } }> };
  const videoIds = (pl.items ?? [])
    .map((i) => i.contentDetails?.videoId)
    .filter((v): v is string => !!v);
  if (videoIds.length === 0) throw new Error("No public videos found");

  // videos.list: 1 unit.
  const vs = (await apiGet(
    "videos",
    { part: "snippet,statistics", id: videoIds.join(",") },
    key,
  )) as {
    items?: Array<{
      snippet?: { title?: string; publishedAt?: string };
      statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
    }>;
  };
  const recentVideos: ChannelStatsVideo[] = (vs.items ?? []).map((v) => ({
    title: v.snippet?.title ?? "Untitled",
    views: num(v.statistics?.viewCount),
    likes: num(v.statistics?.likeCount),
    comments: num(v.statistics?.commentCount),
    publishedAt: (v.snippet?.publishedAt ?? "").slice(0, 10),
  }));
  const totalViews = num(item.statistics?.viewCount);
  const totalVideos = num(item.statistics?.videoCount);
  const hidden = !!item.statistics?.hiddenSubscriberCount;
  // Verify: subscriberCount is absent/"0" when hidden; never synthesize a
  // round placeholder. See PublishReadiness prompt — 5,000,000 was that tell.
  const subscribers = hidden ? null : num(item.statistics?.subscriberCount);
  return {
    channelName: item.snippet?.title ?? trimmed,
    subscribers,
    subscribersHidden: hidden,
    totalViews,
    totalVideos,
    avgViewsPerVideo: totalVideos > 0 ? Math.round(totalViews / totalVideos) : 0,
    recentVideos,
    viewsOverTime: viewsByPublishWeek(recentVideos),
    suggestedSlots: suggestSlots(recentVideos),
    demo: false,
    channelId: item.id,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getChannelStats(channel?: string): Promise<ChannelStatsResult> {
  const key = env.YOUTUBE_DATA_API_KEY?.trim();
  const query = (channel ?? "").trim();
  if (!key || !query) {
    if (query && !key) {
      logger.info("channel-stats: no YOUTUBE_DATA_API_KEY, serving example data");
    }
    return demoStats();
  }
  const cacheKey = query.toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { ...hit.data, fetchedAt: new Date().toISOString() };
  }
  try {
    const live = await fetchLive(query, key);
    cache.set(cacheKey, { at: Date.now(), data: live });
    logger.info(
      { channel: live.channelName, videos: live.recentVideos.length },
      "channel-stats: live YouTube Data API result",
    );
    return live;
  } catch (err) {
    // Quota, invalid channel, network — degrade honestly, never 500.
    logger.warn({ err: (err as Error).message, query }, "channel-stats: live fetch failed, demo fallback");
    return demoStats();
  }
}
