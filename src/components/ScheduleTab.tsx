import { useCallback, useEffect, useState } from "react";
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  BarChart3,
  Clock,
  TrendingUp,
  Zap,
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
import { api } from "@/lib/api";

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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
}

type ChannelStats = {
  channelName: string;
  subscribers: number;
  totalViews: number;
  totalVideos: number;
  avgViewsPerVideo: number;
  recentVideos: {
    title: string;
    views: number;
    likes: number;
    comments: number;
    publishedAt: string;
  }[];
  viewsOverTime: { date: string; views: number }[];
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

export function ScheduleTab() {
  const [posts, setPosts] = useState<ScheduledPost[]>(loadPosts);
  const [stats, setStats] = useState<ChannelStats | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newCategory, setNewCategory] = useState("Tutorial");
  const [showAdd, setShowAdd] = useState(false);

  // Persist
  useEffect(() => {
    savePosts(posts);
  }, [posts]);

  // Fetch demo stats
  useEffect(() => {
    api
      .channelStats()
      .then(setStats)
      .catch(() => {});
  }, []);

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
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Video title"
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/50"
            />
            <div className="flex gap-2">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                min={today}
                className="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/50"
              />
              <select
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
                Best times for {newCategory}:
              </div>
              <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
                {bestTimes.map((t, i) => (
                  <span key={i}>
                    {t.day} {t.hour}:00 UTC
                    {i < bestTimes.length - 1 && " ·"}
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
      {stats && (
        <>
          {/* Stats overview */}
          <Card className="glass">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <BarChart3 className="h-4 w-4 text-cyan-400" />
                {stats.channelName}
                <Badge variant="secondary" className="text-[10px]">
                  DEMO DATA
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatCard label="Subscribers" value={stats.subscribers.toLocaleString()} />
                <StatCard label="Total Views" value={stats.totalViews.toLocaleString()} />
                <StatCard label="Videos" value={stats.totalVideos} />
                <StatCard label="Avg Views" value={stats.avgViewsPerVideo.toLocaleString()} />
              </div>
            </CardContent>
          </Card>

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
