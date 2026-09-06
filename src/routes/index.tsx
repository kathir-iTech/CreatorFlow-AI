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

function StepIndicator({ states }: { active: string; states: Record<string, StepState> }) {
  const steps: Array<{ key: string; label: string; icon: typeof Zap }> = [
    { key: "fetch", label: "Fetch", icon: Zap },
    { key: "captions", label: "Captions", icon: Captions },
    { key: "seo", label: "SEO", icon: Wand2 },
    { key: "thumbnail", label: "Thumbnail", icon: ImageIcon },
    { key: "schedule", label: "Schedule", icon: Calendar },
  ];
  const doneCount = steps.filter((s) => states[s.key] === "done").length;
  const hasWorking = steps.some((s) => states[s.key] === "working");
  const fillPct = Math.round(((doneCount + (hasWorking ? 0.5 : 0)) / (steps.length - 1)) * 100);

  return (
    <nav aria-label="Pipeline progress" className="mx-auto mt-6 w-full max-w-3xl">
      <div className="relative rounded-2xl border border-white/[0.06] bg-[#1A1A1E]/60 px-3 py-4 backdrop-blur-xl sm:px-4">
        {/* continuous thread */}
        <div className="absolute left-6 right-6 top-[22px] hidden sm:block">
          <div className="pipeline-thread">
            <div
              className="pipeline-thread-fill"
              style={{ "--fill": `${fillPct}%` } as React.CSSProperties}
            />
          </div>
        </div>
        <div className="absolute bottom-6 left-[18px] top-6 w-px sm:hidden">
          <div className="h-full w-px bg-white/[0.08]" />
          <div
            className="absolute left-0 top-0 w-px bg-gradient-to-b from-[#FFB020] to-[#0EA5E9] transition-all duration-700"
            style={{ height: `${fillPct}%` }}
          />
        </div>
        <div className="relative flex flex-col gap-3 sm:flex-row sm:justify-between">
          {steps.map((s) => {
            const state = states[s.key] ?? "idle";
            const Icon = s.icon;
            return (
              <div
                key={s.key}
                className="flex items-center gap-3 sm:flex-col sm:items-center sm:gap-2"
              >
                <div
                  className={
                    state === "done"
                      ? "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#FFB020] text-[#09090B] shadow-lg shadow-amber-500/20"
                      : state === "working"
                        ? "node-active-ripple grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#0EA5E9] text-white shadow-lg shadow-sky-500/30 ring-2 ring-sky-300/50"
                        : state === "error"
                          ? "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#E11D48] text-white"
                          : "grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-muted-foreground"
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
                </div>
                <span
                  className={
                    state === "done"
                      ? "text-xs font-medium text-[#FFB020] sm:text-[11px]"
                      : state === "working"
                        ? "text-xs font-medium text-[#0EA5E9] sm:text-[11px]"
                        : "text-xs text-muted-foreground sm:text-[11px]"
                  }
                >
                  {s.label}
                </span>
              </div>
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
