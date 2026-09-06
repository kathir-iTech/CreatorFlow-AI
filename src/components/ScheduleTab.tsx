import { useCallback, useEffect, useState } from "react";
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  BarChart3,
  Clock,
  TrendingUp,
  Zap,
  Sparkles,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { api, type ChannelStats } from "@/lib/api";

const STORAGE_KEY = "creatorflow-scheduled-posts";

type ScheduledPost = {
  id: string;
  title: string;
  date: string; // ISO date string YYYY-MM-DD
  category: string;
};

const CATEGORIES = ["Tutorial", "Vlog", "Review", "Shorts", "Live", "Other"];

// Static heuristic table — best posting times by content category (UTC hours)
const BEST_TIMES: Record<string, { hour: number; day: string }[]> = {
  Tutorial: [
    { hour: 14, day: "Tue" },
    { hour: 16, day: "Thu" },
    { hour: 10, day: "Sat" },
  ],
  Vlog: [
    { hour: 18, day: "Fri" },
    { hour: 12, day: "Sat" },
    { hour: 19, day: "Sun" },
  ],
  Review: [
    { hour: 17, day: "Wed" },
    { hour: 15, day: "Thu" },
    { hour: 11, day: "Sat" },
  ],
  Shorts: [
    { hour: 12, day: "Mon" },
    { hour: 17, day: "Wed" },
    { hour: 20, day: "Fri" },
  ],
  Live: [
    { hour: 19, day: "Fri" },
    { hour: 20, day: "Sat" },
    { hour: 15, day: "Sun" },
  ],
  Other: [
    { hour: 14, day: "Tue" },
    { hour: 16, day: "Thu" },
    { hour: 10, day: "Sat" },
  ],
};

function loadPosts(): ScheduledPost[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePosts(posts: ScheduledPost[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  } catch {
    // Private/incognito contexts may block storage — schedule still works in-memory.
  }
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

export function ScheduleTab({
  transcript,
  seoTitle,
  seoTags,
}: {
  transcript?: string;
  seoTitle?: string;
  seoTags?: string[];
}) {
  const [posts, setPosts] = useState<ScheduledPost[]>(loadPosts);
  const [stats, setStats] = useState<ChannelStats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newCategory, setNewCategory] = useState("Tutorial");
  const [showAdd, setShowAdd] = useState(false);
  const [channel, setChannel] = useState("");
  const [statsLoading, setStatsLoading] = useState(false);
  const [readiness, setReadiness] = useState<{
    topicFit: string;
    timingFit: string;
    supportingVideos: { title: string; views: number }[];
    explanation: string;
    demo: boolean;
  } | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);

  // Persist (storage may be blocked in private mode — savePosts already guards)
  useEffect(() => {
    savePosts(posts);
  }, [posts]);

  // Fetch stats — example data by default; pass a channel ID or @handle
  // for live YouTube Data API stats (falls back honestly on any failure).
  const loadStats = useCallback((ch?: string) => {
    setStatsError(false);
    setStatsLoading(true);
    api
      .channelStats(ch?.trim() ? ch.trim() : undefined)
      .then(setStats)
      .catch(() => setStatsError(true))
      .finally(() => setStatsLoading(false));
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Publish Readiness — synthesis of this video's transcript/SEO + this
  // channel's real history. Only runs when a channel is loaded (even demo
  // shows the honest "insufficient data" copy). No new YouTube quota
  // beyond what channel-stats already fetched.
  useEffect(() => {
    if (!transcript?.trim() || !channel.trim() || !stats) {
      setReadiness(null);
      return;
    }
    let cancelled = false;
    setReadinessLoading(true);
    api
      .publishReadiness({
        transcript,
        title: seoTitle,
        tags: seoTags,
        channel: channel.trim(),
        scheduledDate: newDate || undefined,
      })
      .then((r) => {
        if (!cancelled) setReadiness(r);
      })
      .catch(() => {
        if (!cancelled) setReadiness(null);
      })
      .finally(() => {
        if (!cancelled) setReadinessLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [transcript, seoTitle, seoTags, channel, newDate, stats?.channelId, stats?.fetchedAt]);

  const addPost = useCallback(() => {
    if (!newTitle.trim() || !newDate) return;
    setPosts((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: newTitle.trim(),
        date: newDate,
        category: newCategory,
      },
    ]);
    setNewTitle("");
    setNewDate("");
    setShowAdd(false);
  }, [newTitle, newDate, newCategory]);

  const removePost = useCallback((id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const today = new Date().toISOString().split("T")[0];
  const sorted = [...posts].sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = sorted.filter((p) => p.date >= today);
  const past = sorted.filter((p) => p.date < today);

  const bestTimes = BEST_TIMES[newCategory] ?? BEST_TIMES.Other;
  // Live channel data beats the static table: rank this channel's own
  // publish slots by views when real stats are loaded.
  const liveSlots = stats && !stats.demo ? (stats.suggestedSlots ?? []) : [];
  const showLiveSlots = liveSlots.length > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-medium">Content Scheduler</span>
          <Badge variant="secondary" className="text-[10px]">
            {posts.length} planned
          </Badge>
        </div>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Schedule
        </Button>
      </div>

      {/* Add form */}
      {showAdd && (
        <Card className="glass">
          <CardContent className="space-y-3 p-4">
            <label htmlFor="sched-title" className="sr-only">
              Video title
            </label>
            <input
              id="sched-title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Video title"
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/50"
            />
            <div className="flex gap-2">
              <label htmlFor="sched-date" className="sr-only">
                Scheduled date
              </label>
              <input
                id="sched-date"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                min={today}
                className="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/50"
              />
              <label htmlFor="sched-category" className="sr-only">
                Content category
              </label>
              <select
                id="sched-category"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/50"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Best times hint */}
            <div className="rounded-lg border border-emerald-500/10 bg-emerald-500/5 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-300">
                <Zap className="h-3 w-3" />
                {showLiveSlots
                  ? `Best times from this channel's own videos:`
                  : `Best times for ${newCategory}:`}
              </div>
              <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
                {showLiveSlots
                  ? liveSlots.map((t, i) => (
                      <span key={i}>
                        {t.day} {t.hour}:00 UTC{i < liveSlots.length - 1 && " ·"}
                      </span>
                    ))
                  : bestTimes.map((t, i) => (
                      <span key={i}>
                        {t.day} {t.hour}:00 UTC{i < bestTimes.length - 1 && " ·"}
                      </span>
                    ))}
              </div>
            </div>

            <Button onClick={addPost} disabled={!newTitle.trim() || !newDate} className="w-full">
              Add to schedule
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Schedule list */}
      <Card className="glass">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Upcoming
            </span>
            <Badge variant="secondary" className="text-[10px]">
              {upcoming.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {upcoming.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No upcoming posts. Click Schedule to plan one.
            </p>
          )}
          {upcoming.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5"
            >
              <div className="text-xs text-muted-foreground shrink-0 w-20 font-mono">
                {new Date(p.date + "T12:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <div className="flex-1 truncate text-sm text-foreground">{p.title}</div>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {p.category}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => removePost(p.id)}
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Past posts */}
      {past.length > 0 && (
        <Card className="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Past</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {past.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 px-2 py-1.5 text-xs text-muted-foreground/60"
              >
                <span className="w-20 font-mono shrink-0">
                  {new Date(p.date + "T12:00:00").toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span className="flex-1 truncate line-through">{p.title}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => removePost(p.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Channel stats */}
      {statsError && !stats && (
        <Card className="glass border-destructive/30">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <p className="text-xs text-muted-foreground">
              Channel stats are unavailable right now (the server may be waking up).
            </p>
            <Button variant="outline" size="sm" onClick={() => loadStats(channel)}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}
      {stats && (
        <>
          {/* Stats overview */}
          <Card className="glass">
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-1.5 text-sm">
                <BarChart3 className="h-4 w-4 text-cyan-400" />
                {stats.channelName}
                {stats.demo ? (
                  <Badge variant="secondary" className="text-[10px]">
                    EXAMPLE DATA
                  </Badge>
                ) : (
                  <Badge variant="default" className="text-[10px]">
                    LIVE DATA
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  loadStats(channel);
                }}
              >
                <label htmlFor="sched-channel" className="sr-only">
                  YouTube channel ID or @handle for live stats
                </label>
                <input
                  id="sched-channel"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  placeholder="Channel ID or @handle for live stats (empty = example)"
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs outline-none focus:border-cyan-400/50"
                />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={statsLoading}
                  className="shrink-0"
                >
                  {statsLoading ? "Loading…" : "Load"}
                </Button>
              </form>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatCard
                  label="Subscribers"
                  value={
                    stats.subscribersHidden
                      ? "Hidden by creator"
                      : (stats.subscribers ?? 0).toLocaleString()
                  }
                />
                <StatCard label="Total Views" value={stats.totalViews.toLocaleString()} />
                <StatCard label="Videos" value={stats.totalVideos} />
                <StatCard label="Avg Views" value={stats.avgViewsPerVideo.toLocaleString()} />
              </div>
            </CardContent>
          </Card>

          {/* Publish Readiness — synthesis of this video + this channel */}
          {(readinessLoading || readiness) && (
            <Card className="glass border-violet-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <Sparkles className="h-4 w-4 text-violet-400" />
                  Publish Readiness
                  {readiness?.demo ? (
                    <Badge variant="secondary" className="text-[10px]">
                      EXAMPLE DATA
                    </Badge>
                  ) : readiness ? (
                    <Badge variant="default" className="text-[10px]">
                      LIVE ANALYSIS
                    </Badge>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {readinessLoading && !readiness && (
                  <p className="text-xs text-muted-foreground">Analyzing topic and timing fit…</p>
                )}
                {readiness && (
                  <>
                    <p className="text-sm leading-relaxed text-foreground">
                      {readiness.explanation}
                    </p>
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      <Badge
                        variant={readiness.topicFit === "above-average" ? "default" : "secondary"}
                      >
                        Topic: {readiness.topicFit}
                      </Badge>
                      <Badge variant={readiness.timingFit === "match" ? "default" : "secondary"}>
                        Timing: {readiness.timingFit}
                      </Badge>
                    </div>
                    {readiness.supportingVideos.length > 0 && (
                      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                        <div className="text-[11px] font-medium text-muted-foreground">
                          Closest past videos
                        </div>
                        <ul className="mt-1 space-y-1">
                          {readiness.supportingVideos.map((v, i) => (
                            <li key={i} className="flex justify-between gap-2 text-xs">
                              <span className="truncate text-foreground">{v.title}</span>
                              <span className="shrink-0 text-muted-foreground">
                                {v.views.toLocaleString()} views
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Based on this channel&apos;s own recent history — not a prediction.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )}
          {/* Hint when channel is set but transcript/SEO not yet */}
          {!readiness && !readinessLoading && channel.trim() && !transcript?.trim() && (
            <Card className="glass">
              <CardContent className="p-4 text-center text-xs text-muted-foreground">
                Generate captions and SEO for this video, then readiness will compare it to{" "}
                {channel.trim()}&apos;s history.
              </CardContent>
            </Card>
          )}

          {/* Views over time chart */}
          <Card className="glass">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <TrendingUp className="h-4 w-4 text-violet-400" />
                Views Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.viewsOverTime}>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(v: string) => v.slice(5)} // MM-DD
                      stroke="hsl(var(--border))"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                      stroke="hsl(var(--border))"
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="views"
                      stroke="hsl(167, 80%, 40%)"
                      strokeWidth={2}
                      dot={{ fill: "hsl(167, 80%, 40%)", r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Recent videos */}
          <Card className="glass">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Recent Videos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.recentVideos} layout="vertical">
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                      stroke="hsl(var(--border))"
                    />
                    <YAxis
                      type="category"
                      dataKey="title"
                      width={150}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      stroke="hsl(var(--border))"
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="views" fill="hsl(262, 83%, 58%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
