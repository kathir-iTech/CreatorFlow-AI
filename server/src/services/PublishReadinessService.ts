import { getChannelStats, type ChannelStatsVideo } from "./ChannelStatsService.js";
import { logger } from "@/logging/logger.js";

/**
 * PublishReadinessService — synthesis of pipeline outputs (captions + SEO +
 * channel history). It has no external data source beyond what
 * channel-stats already fetches; no new YouTube quota cost beyond that.
 * Demo channels always return insufficient-data, never a fabricated verdict.
 */

export type TopicFit = "above-average" | "below-average" | "insufficient-data";
export type TimingFit = "match" | "mismatch" | "no-schedule-set" | "insufficient-data";

export interface SupportingVideo {
  title: string;
  views: number;
  publishedAt: string;
  overlapScore: number;
}

export interface PublishReadinessResult {
  topicFit: TopicFit;
  timingFit: TimingFit;
  supportingVideos: SupportingVideo[];
  topicFitDetail?: { matchedAvg: number; channelAvg: number; deltaPct: number };
  timingFitDetail?: { bestSlot: { day: string; hour: number } | null; scheduledDay: string | null };
  explanation: string;
  demo: boolean;
  channelName?: string;
}

// Small stopword list — keep it conservative so topic words survive.
const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "have",
  "has",
  "had",
  "was",
  "were",
  "are",
  "is",
  "be",
  "been",
  "being",
  "will",
  "would",
  "could",
  "should",
  "about",
  "into",
  "over",
  "after",
  "before",
  "under",
  "again",
  "more",
  "most",
  "other",
  "some",
  "such",
  "only",
  "very",
  "can",
  "just",
  "than",
  "then",
  "also",
  "your",
  "you",
  "our",
  "out",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
  );
}

function overlapSize(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function computeTopicFit(
  transcript: string,
  title: string,
  tags: string[],
  recentVideos: ChannelStatsVideo[],
  channelAvg: number,
): { fit: TopicFit; supporting: SupportingVideo[]; detail?: { matchedAvg: number; channelAvg: number; deltaPct: number } } {
  const currentTokens = tokenize(`${transcript} ${title} ${tags.join(" ")}`);
  if (currentTokens.size < 3 || recentVideos.length === 0) {
    return { fit: "insufficient-data", supporting: [] };
  }
  const scored = recentVideos.map((v) => ({
    video: v,
    score: overlapSize(currentTokens, tokenize(v.title)),
  }));
  scored.sort((a, b) => b.score - a.score);
  // Need at least some overlap to claim a fit — otherwise it's noise.
  const top = scored.filter((s) => s.score > 0).slice(0, 3);
  if (top.length === 0) {
    return { fit: "insufficient-data", supporting: [] };
  }
  const matchedAvg = Math.round(top.reduce((sum, s) => sum + s.video.views, 0) / top.length);
  const deltaPct = channelAvg > 0 ? Math.round(((matchedAvg - channelAvg) / channelAvg) * 100) : 0;
  const fit: TopicFit = matchedAvg >= channelAvg ? "above-average" : "below-average";
  const supporting: SupportingVideo[] = top.map((s) => ({
    title: s.video.title,
    views: s.video.views,
    publishedAt: s.video.publishedAt,
    overlapScore: s.score,
  }));
  return { fit, supporting, detail: { matchedAvg, channelAvg, deltaPct } };
}

export function computeTimingFit(
  scheduledDate: string | undefined,
  recentVideos: ChannelStatsVideo[],
): { fit: TimingFit; bestSlot: { day: string; hour: number } | null; scheduledDay: string | null } {
  if (!scheduledDate) {
    return { fit: "no-schedule-set", bestSlot: null, scheduledDay: null };
  }
  if (recentVideos.length === 0) {
    return { fit: "insufficient-data", bestSlot: null, scheduledDay: null };
  }
  // Reuse the same bucketing as ChannelStatsService but we need the best
  // slot's day. SuggestedSlots is precomputed there, but recompute here
  // to avoid coupling to cached shape.
  const scores = new Map<string, number>();
  for (const v of recentVideos) {
    const d = new Date(`${v.publishedAt}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${DAY_NAMES[d.getUTCDay()]}|${d.getUTCHours()}`;
    scores.set(key, (scores.get(key) ?? 0) + v.views);
  }
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const bestKey = sorted[0]?.[0];
  const bestSlot = bestKey
    ? { day: bestKey.split("|")[0]!, hour: Number(bestKey.split("|")[1]!) }
    : null;
  const scheduled = new Date(`${scheduledDate}T12:00:00Z`);
  const scheduledDay = Number.isNaN(scheduled.getTime()) ? null : DAY_NAMES[scheduled.getUTCDay()]!;
  if (!bestSlot || !scheduledDay) {
    return { fit: "insufficient-data", bestSlot, scheduledDay };
  }
  const fit: TimingFit = scheduledDay === bestSlot.day ? "match" : "mismatch";
  return { fit, bestSlot, scheduledDay };
}

export interface PublishReadinessInput {
  transcript?: string;
  title?: string;
  tags?: string[];
  channel?: string;
  scheduledDate?: string; // YYYY-MM-DD from Schedule tab
}

export async function getPublishReadiness(input: PublishReadinessInput): Promise<PublishReadinessResult> {
  const transcript = (input.transcript ?? "").trim();
  const title = (input.title ?? "").trim();
  const tags = Array.isArray(input.tags) ? input.tags.filter((t) => typeof t === "string" && t.trim()) : [];
  const channel = (input.channel ?? "").trim();
  const scheduledDate = input.scheduledDate?.trim() || undefined;

  const stats = await getChannelStats(channel || undefined);
  if (stats.demo) {
    return {
      topicFit: "insufficient-data",
      timingFit: "insufficient-data",
      supportingVideos: [],
      explanation:
        "Not enough live channel data to judge — load a real channel in the Schedule tab (or add YOUTUBE_DATA_API_KEY on the server) to get a readiness verdict based on this channel's own history.",
      demo: true,
      channelName: stats.channelName,
    };
  }

  const channelAvg = stats.avgViewsPerVideo;
  const topic = computeTopicFit(transcript, title, tags, stats.recentVideos, channelAvg);
  const timing = computeTimingFit(scheduledDate, stats.recentVideos);

  // Build a plain-English, honest explanation.
  const parts: string[] = [];
  if (topic.fit === "above-average") {
    parts.push(
      `Videos like this on your channel average ${topic.detail!.deltaPct > 0 ? `+${topic.detail!.deltaPct}%` : `${topic.detail!.deltaPct}%`} vs your channel average (${topic.detail!.matchedAvg.toLocaleString()} vs ${channelAvg.toLocaleString()} avg views).`,
    );
  } else if (topic.fit === "below-average") {
    parts.push(
      `Similar past videos average ${Math.abs(topic.detail!.deltaPct)}% below your channel average (${topic.detail!.matchedAvg.toLocaleString()} vs ${channelAvg.toLocaleString()}), so this topic has historically underperformed for this channel.`,
    );
  } else {
    parts.push("Not enough topical overlap with recent videos to judge topic fit — this looks like a new direction for the channel.");
  }

  if (timing.fit === "match" && timing.bestSlot) {
    parts.push(`Your best-performing posting window is ${timing.bestSlot.day}s around ${timing.bestSlot.hour}:00 UTC — your scheduled date (${timing.scheduledDay}) lines up.`);
  } else if (timing.fit === "mismatch" && timing.bestSlot) {
    parts.push(
      `Your strongest window is ${timing.bestSlot.day}s around ${timing.bestSlot.hour}:00 UTC, but you're scheduled for ${timing.scheduledDay} — consider shifting if timing matters for this video.`,
    );
  } else if (timing.fit === "no-schedule-set") {
    if (timing.bestSlot) {
      parts.push(`Best window on this channel is ${timing.bestSlot.day}s around ${timing.bestSlot.hour}:00 UTC — nothing scheduled yet.`);
    }
  } else if (timing.fit === "insufficient-data") {
    parts.push("Not enough publish-history to judge timing fit.");
  }

  parts.push("Based on this channel's own recent history — not a prediction, just what past data shows.");

  const explanation = parts.join(" ");

  logger.info(
    {
      channel: stats.channelName,
      topicFit: topic.fit,
      timingFit: timing.fit,
      supportingCount: topic.supporting.length,
    },
    "publish-readiness computed",
  );

  return {
    topicFit: topic.fit,
    timingFit: timing.fit,
    supportingVideos: topic.supporting,
    topicFitDetail: topic.detail,
    timingFitDetail: { bestSlot: timing.bestSlot, scheduledDay: timing.scheduledDay },
    explanation,
    demo: false,
    channelName: stats.channelName,
  };
}
