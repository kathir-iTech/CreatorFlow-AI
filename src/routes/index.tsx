import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useState, type ReactNode } from "react";
import type { StepState } from "@/lib/pipeline";
import {
  ArrowRight,
  ArrowDown,
  Calendar,
  Captions,
  Check,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  TriangleAlert,
  Wand2,
  Zap,
} from "lucide-react";
import { UrlInput } from "@/components/UrlInput";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import type { CaptionsResult } from "@/lib/api";

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
    <div className="mx-auto max-w-3xl text-center">
      <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground backdrop-blur">
        <Sparkles className="h-3 w-3 text-violet-300" />
        CreatorFlow AI
      </div>
      <h1 className="mt-4 text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
        Automate your creator <span className="gradient-text">workflow</span>
      </h1>
      <p className="mt-3 text-balance text-sm text-muted-foreground sm:text-base">
        Paste a YouTube link — we&apos;ll fetch transcripts, generate SEO, create thumbnails, and
        schedule. One URL, full pipeline.
      </p>
    </div>
  );
}

function StepIndicator({ active, states }: { active: string; states: Record<string, StepState> }) {
  const steps = [
    { key: "fetch", label: "Fetch" },
    { key: "captions", label: "Captions" },
    { key: "seo", label: "SEO" },
    { key: "thumbnail", label: "Thumbnail" },
    { key: "schedule", label: "Schedule" },
  ];
  return (
    <nav
      aria-label="Pipeline progress"
      className="glass mx-auto mt-6 flex w-full max-w-3xl flex-col gap-1 rounded-2xl p-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2"
    >
      {steps.map((s, i) => {
        const state = states[s.key] ?? "idle";
        const isActive = active === s.key;
        return (
          <div key={s.key} className="flex items-center gap-2 sm:gap-1.5">
            <div
              className={
                state === "done"
                  ? "grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                  : state === "working"
                    ? "node-active-ripple grid h-7 w-7 shrink-0 place-items-center rounded-full bg-cyan-400 text-zinc-950 shadow-lg shadow-cyan-400/40 ring-2 ring-cyan-300/60"
                    : state === "error"
                      ? "grid h-7 w-7 shrink-0 place-items-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/30"
                      : isActive
                        ? "grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 text-xs font-medium text-white"
                        : "node-pending-pulse grid h-7 w-7 shrink-0 place-items-center rounded-full bg-foreground/10 text-xs font-medium text-foreground"
              }
            >
              {state === "done" ? (
                <Check className="pop-in h-3.5 w-3.5" strokeWidth={3} />
              ) : state === "working" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : state === "error" ? (
                <TriangleAlert className="h-3.5 w-3.5" />
              ) : (
                i + 1
              )}
            </div>
            <span
              className={
                state === "done"
                  ? "whitespace-nowrap text-xs font-medium text-emerald-300"
                  : "whitespace-nowrap text-xs text-muted-foreground"
              }
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <>
                <ArrowRight className="hidden h-3 w-3 text-muted-foreground/50 sm:block" />
                <ArrowDown className="h-3 w-3 text-muted-foreground/50 sm:hidden" />
              </>
            )}
          </div>
        );
      })}
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

  const stepStates: Record<string, StepState> = {
    fetch: fetchState,
    captions: captionsState === "idle" && submittedUrl ? "working" : captionsState,
    seo: seoState === "done" ? "done" : transcript ? "working" : "idle",
    thumbnail: tab === "thumbnail" && submittedUrl ? "working" : "idle",
    schedule: tab === "schedule" ? "working" : "idle",
  };

  return (
    <div className="space-y-8">
      <Toaster richColors position="top-right" />
      <section className="pt-6 sm:pt-10">
        <Hero />
        <div className="mt-6">
          <UrlInput value={url} onValueChange={handleValueChange} onSubmit={handleSubmit} />
        </div>
        <StepIndicator active={tab} states={stepStates} />
      </section>

      <section className="mx-auto w-full max-w-3xl">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-5" aria-label="Pipeline stages">
            <TabsTrigger value="fetch" className="min-h-11 gap-1 text-xs">
              <Zap className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Fetch</span>
            </TabsTrigger>
            <TabsTrigger value="captions" className="min-h-11 gap-1 text-xs">
              <Captions className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Captions</span>
            </TabsTrigger>
            <TabsTrigger value="seo" className="min-h-11 gap-1 text-xs">
              <Wand2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">SEO</span>
            </TabsTrigger>
            <TabsTrigger value="thumbnail" className="min-h-11 gap-1 text-xs">
              <ImageIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Thumb</span>
            </TabsTrigger>
            <TabsTrigger value="schedule" className="min-h-11 gap-1 text-xs">
              <Calendar className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Plan</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fetch" className="tab-panel-enter mt-4">
            <LazyPanel label="Fetch">
              <FetchTab url={submittedUrl} onStatusChange={handleFetchStatus} />
            </LazyPanel>
          </TabsContent>
          <TabsContent value="captions" className="tab-panel-enter mt-4">
            <LazyPanel label="Captions">
              <CaptionsTab
                url={submittedUrl}
                onTranscript={handleTranscript}
                onStatusChange={handleCaptionsStatus}
              />
            </LazyPanel>
          </TabsContent>
          <TabsContent value="seo" className="tab-panel-enter mt-4">
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
          <TabsContent value="thumbnail" className="tab-panel-enter mt-4">
            <LazyPanel label="Thumbnail">
              <ThumbnailTab url={submittedUrl} />
            </LazyPanel>
          </TabsContent>
          <TabsContent value="schedule" className="tab-panel-enter mt-4">
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
