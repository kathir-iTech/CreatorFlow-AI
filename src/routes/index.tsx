import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useState, type ReactNode } from "react";
import type { StepState } from "@/lib/pipeline";
import {
  Calendar,
  Captions,
  Check,
  Image as ImageIcon,
  Loader2,
  TriangleAlert,
  Wand2,
  Zap,
} from "lucide-react";
import { UrlInput } from "@/components/UrlInput";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import type { CaptionsResult } from "@/lib/api";
import { addHistoryRun } from "@/lib/history";

// Code-split: each tab chunk (incl. recharts in ScheduleTab) loads only when opened.
const FetchTab = lazy(() => import("@/components/FetchTab").then((m) => ({ default: m.FetchTab })));
const CaptionsTab = lazy(() =>
  import("@/components/CaptionsTab").then((m) => ({ default: m.CaptionsTab })),
);
const SeoTab = lazy(() => import("@/components/SeoTab").then((m) => ({ default: m.SeoTab })));
const ThumbnailTab = lazy(() =>
  import("@/components/ThumbnailTab").then((m) => ({ default: m.ThumbnailTab })),
);
const ScheduleTab = lazy(() =>
  import("@/components/ScheduleTab").then((m) => ({ default: m.ScheduleTab })),
);

export const Route = createFileRoute("/")({
  component: Index,
});

function Hero() {
  return (
    <div className="mx-auto max-w-3xl text-left">
      <h1 className="hero-resolve font-display text-[2.2rem] leading-[0.92] tracking-tight text-foreground sm:text-[3rem]">
        Paste a YouTube link.
        <span className="block text-[#FFB020]">Get back everything</span>
        <span className="block">ready to publish.</span>
      </h1>
      <p className="hero-resolve hero-resolve-delay-1 mt-4 max-w-[36rem] text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
        Captions, titles, a thumbnail and a posting plan — from one link. Built on your
        channel&apos;s real numbers.
      </p>
    </div>
  );
}

/** Single source of truth for stage ordering and naming überall. */
export const PIPELINE_STEPS = [
  { key: "fetch", label: "Fetch" },
  { key: "captions", label: "Captions" },
  { key: "seo", label: "SEO" },
  { key: "thumbnail", label: "Thumbnail" },
  { key: "schedule", label: "Schedule" },
] as const;

const STEP_ICONS: Record<string, typeof Zap> = {
  fetch: Zap,
  captions: Captions,
  seo: Wand2,
  thumbnail: ImageIcon,
  schedule: Calendar,
};

function StepIndicator({
  active,
  states,
  onSelect,
}: {
  active: string;
  states: Record<string, StepState>;
  onSelect: (key: string) => void;
}) {
  const steps = PIPELINE_STEPS;
  const doneCount = steps.filter((s) => states[s.key] === "done").length;
  const hasWorking = steps.some((s) => states[s.key] === "working");
  const fillPct = Math.round(((doneCount + (hasWorking ? 0.5 : 0)) / (steps.length - 1)) * 100);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const idx = steps.findIndex((s) => s.key === active);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = steps[(idx + 1) % steps.length];
      onSelect(next.key);
      document.getElementById(`thread-tab-${next.key}`)?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prev = steps[(idx - 1 + steps.length) % steps.length];
      onSelect(prev.key);
      document.getElementById(`thread-tab-${prev.key}`)?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      onSelect(steps[0].key);
      document.getElementById(`thread-tab-${steps[0].key}`)?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      onSelect(steps[steps.length - 1].key);
      document.getElementById(`thread-tab-${steps[steps.length - 1].key}`)?.focus();
    }
  };

  return (
    <nav aria-label="Pipeline stages" className="mx-auto mt-6 w-full max-w-3xl">
      <div
        role="tablist"
        aria-label="Pipeline stages"
        onKeyDown={handleKeyDown}
        className="relative rounded-2xl border border-white/[0.06] bg-[#1A1A1E]/60 px-3 py-4 backdrop-blur-xl sm:px-4"
      >
        {/* continuous thread */}
        <div className="absolute left-6 right-6 top-[22px] hidden sm:block" aria-hidden="true">
          <div className="pipeline-thread">
            <div
              className="pipeline-thread-fill"
              style={{ "--fill": `${fillPct}%` } as React.CSSProperties}
            />
          </div>
        </div>
        <div className="absolute bottom-6 left-[18px] top-6 w-px sm:hidden" aria-hidden="true">
          <div className="h-full w-px bg-white/[0.08]" />
          <div
            className="absolute left-0 top-0 w-px bg-gradient-to-b from-[#FFB020] to-[#0EA5E9] transition-all duration-700"
            style={{ height: `${fillPct}%` }}
          />
        </div>
        <div className="relative flex flex-col gap-3 sm:flex-row sm:justify-between">
          {steps.map((s) => {
            const state = states[s.key] ?? "idle";
            const isActive = active === s.key;
            const Icon = STEP_ICONS[s.key];
            return (
              <button
                key={s.key}
                id={`thread-tab-${s.key}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${s.key}`}
                onClick={() => onSelect(s.key)}
                className={`group flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition sm:flex-col sm:items-center sm:gap-2 sm:px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB020]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1A1A1E] ${isActive ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"}`}
              >
                <span
                  className={
                    state === "done"
                      ? `grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#FFB020] text-[#09090B] shadow-lg shadow-amber-500/20 transition ${isActive ? "ring-2 ring-[#FFB020] ring-offset-2 ring-offset-[#1A1A1E]" : "group-hover:brightness-110"}`
                      : state === "working"
                        ? "node-active-ripple grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#0EA5E9] text-white shadow-lg shadow-sky-500/30 ring-2 ring-sky-300/50"
                        : state === "error"
                          ? `grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#E11D48] text-white ${isActive ? "ring-2 ring-rose-300 ring-offset-2 ring-offset-[#1A1A1E]" : ""}`
                          : isActive
                            ? "grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-[#FFB020]/60 bg-[#FFB020]/10 text-[#FFB020] shadow-md"
                            : "grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-muted-foreground group-hover:border-white/20 group-hover:text-foreground"
                  }
                >
                  {state === "done" ? (
                    <Check className="pop-in h-4 w-4" strokeWidth={2.5} />
                  ) : state === "working" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : state === "error" ? (
                    <TriangleAlert className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </span>
                <span
                  className={
                    isActive
                      ? "text-xs font-semibold tracking-wide text-foreground sm:text-[11px]"
                      : state === "done"
                        ? "text-xs font-medium text-[#FFB020] sm:text-[11px]"
                        : state === "working"
                          ? "text-xs font-medium text-[#0EA5E9] sm:text-[11px]"
                          : "text-xs text-muted-foreground group-hover:text-foreground sm:text-[11px]"
                  }
                >
                  {s.label}
                  {isActive && (
                    <span className="ml-1 hidden text-[10px] leading-none text-[#FFB020] sm:inline">
                      ●
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

function LazyPanel({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Suspense
      fallback={
        <Card className="glass" aria-label={`Loading ${label}`}>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="h-5 w-32 rounded-md bg-foreground/10" />
              <div className="h-8 w-24 rounded-md bg-foreground/10" />
            </div>
            <div className="h-3 w-2/3 rounded bg-foreground/5" />
            <div className="space-y-2 pt-2" aria-hidden="true">
              <div className="h-4 w-full rounded bg-foreground/5" />
              <div className="h-4 w-5/6 rounded bg-foreground/5" />
              <div className="h-4 w-4/6 rounded bg-foreground/5" />
            </div>
          </CardContent>
        </Card>
      }
    >
      {children}
    </Suspense>
  );
}

function Index() {
  // Shared URL input — built once at the top level, reused by every tab.
  const [url, setUrl] = useState("");
  const [submittedUrl, setSubmittedUrl] = useState("");
  const [tab, setTab] = useState("captions");
  const [transcript, setTranscript] = useState("");
  const [captionsResult, setCaptionsResult] = useState<CaptionsResult | null>(null);
  const [seoResult, setSeoResult] = useState<{ titles: string[]; tags: string[] } | null>(null);
  // Live pipeline statuses driving the step indicator (real completions,
  // not tab position).
  const [fetchState, setFetchState] = useState<StepState>("idle");
  const [captionsState, setCaptionsState] = useState<StepState>("idle");
  const [seoState, setSeoState] = useState<StepState>("idle");

  const handleSubmit = useCallback((u: string) => {
    setUrl(u);
    setSubmittedUrl(u);
    // New video = clean pipeline: drop the previous transcript/SEO context so
    // nothing from the old video lingers (Part 7/8 row 15).
    setTranscript("");
    setCaptionsResult(null);
    setSeoResult(null);
    setFetchState("idle");
    setCaptionsState("idle");
    setSeoState("idle");
    setTab("captions");
    // Persist for History page (cheap genuine value — no stub page).
    try {
      const vid = (() => {
        try {
          const parsed = new URL(u);
          return (
            parsed.searchParams.get("v") ??
            parsed.pathname.split("/").filter(Boolean).pop()?.slice(0, 20) ??
            undefined
          );
        } catch {
          return undefined;
        }
      })();
      addHistoryRun({ url: u, videoId: vid });
    } catch {
      // storage blocked
    }
  }, []);

  const handleValueChange = useCallback((u: string) => {
    setUrl(u);
  }, []);

  const handleTranscript = useCallback((text: string, result: CaptionsResult | null) => {
    // Shared state — SEO reuses this transcript without re-fetching.
    // A null result means the pipeline reset or captions failed: SEO clears.
    setTranscript(text);
    setCaptionsResult(result);
  }, []);

  const handleFetchStatus = useCallback((s: StepState) => {
    setFetchState(s);
  }, []);

  const handleCaptionsStatus = useCallback((s: StepState) => {
    setCaptionsState(s);
  }, []);

  const handleSeoResult = useCallback((hasResult: boolean) => {
    setSeoState(hasResult ? "done" : "idle");
  }, []);

  const handleSeoData = useCallback((data: { titles: string[]; tags: string[] } | null) => {
    setSeoResult(data ? { titles: data.titles, tags: data.tags } : null);
  }, []);

  const handleDemoLoad = useCallback(async (id: string) => {
    try {
      const base = (import.meta as unknown as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL ?? "https://creatorflow-ai-backend-lin3.onrender.com";
      const r = await fetch(`${String(base).replace(/\/+$/, "")}/api/v1/demo/${id}`);
      const j = await r.json();
      const entry = j.data as {
        id: string;
        url: string;
        title: string;
        metadata: { title: string };
        captions: { captions: { start: number; end: number; text: string }[]; srt: string; vtt: string; videoId: string; source: string; language: string; isAuto: boolean };
        seo: { titles: string[]; tags: string[] };
      };
      if (!entry) throw new Error("No demo");
      setUrl(entry.url);
      setSubmittedUrl(entry.url);
      const plain = entry.captions.captions.map((c) => c.text).join(" ");
      setTranscript(plain);
      setCaptionsResult({
        videoId: entry.id,
        providerId: "youtube",
        source: entry.captions.source as "native" | "whisper",
        language: entry.captions.language,
        isAuto: entry.captions.isAuto,
        captions: entry.captions.captions,
        srt: entry.captions.srt,
        vtt: entry.captions.vtt,
        demo: true,
      } as CaptionsResult & { demo?: boolean });
      setSeoResult({ titles: entry.seo.titles, tags: entry.seo.tags });
      setFetchState("done");
      setCaptionsState("done");
      setSeoState("done");
      setTab("captions");
      // Persist for History
      try {
        addHistoryRun({ url: entry.url, videoId: entry.id, title: entry.title });
      } catch {}
    } catch {
      // fallback to normal flow if demo fetch fails
    }
  }, []);

  const stepStates: Record<string, StepState> = {
    fetch: fetchState,
    captions: captionsState === "idle" && submittedUrl ? "working" : captionsState,
    seo: seoState === "done" ? "done" : transcript ? "working" : "idle",
    thumbnail: tab === "thumbnail" && submittedUrl ? "working" : "idle",
    schedule: tab === "schedule" ? "working" : "idle",
  };

  return (
    <div className="space-y-10">
      <Toaster richColors position="top-right" />
      <section className="pt-6 sm:pt-10">
        <Hero />
        <div className="mt-6">
          <UrlInput value={url} onValueChange={handleValueChange} onSubmit={handleSubmit} />
        </div>
        <StepIndicator active={tab} states={stepStates} onSelect={setTab} />
        {/* Pro-studio feature strip — shows pipeline value prop without duplicating nav */}
        <div className="mx-auto mt-6 grid max-w-3xl grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            { k: "Fetch", d: "yt-dlp + Data API", c: "#FFB020" },
            { k: "Captions", d: "native → Whisper", c: "#0EA5E9" },
            { k: "SEO", d: "Groq · titles/tags", c: "#10B981" },
            { k: "Thumbnail", d: "6 frames + canvas", c: "#A78BFA" },
            { k: "Schedule", d: "Data API live stats", c: "#F472B6" },
          ].map((f) => (
            <div key={f.k} className="rounded-xl border border-white/[0.05] bg-[#1A1A1E]/40 px-2 py-2 text-center backdrop-blur">
              <div className="text-[10px] tracking-[0.12em] text-muted-foreground">{f.k}</div>
              <div className="mt-0.5 text-[11px] font-medium" style={{ color: f.c }}>
                {f.d}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsContent
            value="fetch"
            id="panel-fetch"
            role="tabpanel"
            className="tab-panel-enter mt-4"
          >
            <LazyPanel label="Fetch">
              <FetchTab url={submittedUrl} onStatusChange={handleFetchStatus} onDemoLoad={handleDemoLoad} />
            </LazyPanel>
          </TabsContent>
          <TabsContent
            value="captions"
            id="panel-captions"
            role="tabpanel"
            className="tab-panel-enter mt-4"
          >
            <LazyPanel label="Captions">
              <CaptionsTab
                url={submittedUrl}
                onTranscript={handleTranscript}
                onStatusChange={handleCaptionsStatus}
              />
            </LazyPanel>
          </TabsContent>
          <TabsContent value="seo" id="panel-seo" role="tabpanel" className="tab-panel-enter mt-4">
            <LazyPanel label="SEO">
              <SeoTab
                transcript={transcript}
                videoTitle={
                  captionsResult?.videoId ? `YouTube Video ${captionsResult.videoId}` : undefined
                }
                onResult={handleSeoResult}
                onSeoData={handleSeoData}
              />
            </LazyPanel>
          </TabsContent>
          <TabsContent
            value="thumbnail"
            id="panel-thumbnail"
            role="tabpanel"
            className="tab-panel-enter mt-4"
          >
            <LazyPanel label="Thumbnail">
              <ThumbnailTab url={submittedUrl} />
            </LazyPanel>
          </TabsContent>
          <TabsContent
            value="schedule"
            id="panel-schedule"
            role="tabpanel"
            className="tab-panel-enter mt-4"
          >
            <LazyPanel label="Schedule">
              <ScheduleTab
                transcript={transcript}
                seoTitle={seoResult?.titles[0]}
                seoTags={seoResult?.tags}
              />
            </LazyPanel>
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
