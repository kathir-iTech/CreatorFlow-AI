import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import {
  ArrowRight,
  Calendar,
  Captions,
  Image as ImageIcon,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import { UrlInput } from "@/components/UrlInput";
import { CaptionsTab } from "@/components/CaptionsTab";
import { SeoTab } from "@/components/SeoTab";
import { ThumbnailTab } from "@/components/ThumbnailTab";
import { ScheduleTab } from "@/components/ScheduleTab";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import type { CaptionsResult } from "@/lib/api";

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

function StepIndicator({ active }: { active: string }) {
  const steps = [
    { key: "fetch", label: "Fetch" },
    { key: "captions", label: "Captions" },
    { key: "seo", label: "SEO" },
    { key: "thumbnail", label: "Thumbnail" },
    { key: "schedule", label: "Schedule" },
  ];
  const activeIdx = steps.findIndex((s) => s.key === active);
  return (
    <div className="mx-auto mt-6 flex w-full max-w-3xl items-center justify-between gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-white/5 p-2 backdrop-blur">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <div
            className={
              i <= activeIdx
                ? "grid h-7 w-7 place-items-center rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 text-xs font-medium text-white"
                : "grid h-7 w-7 place-items-center rounded-full bg-foreground/10 text-xs font-medium text-foreground"
            }
          >
            {i + 1}
          </div>
          <span className="whitespace-nowrap text-xs text-muted-foreground">{s.label}</span>
          {i < steps.length - 1 && (
            <ArrowRight className="hidden h-3 w-3 text-muted-foreground/50 sm:block" />
          )}
        </div>
      ))}
    </div>
  );
}

function PlaceholderTab({ title, body }: { title: string; body: string }) {
  return (
    <Card className="glass">
      <CardContent className="p-8 text-center">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <p className="mt-1 text-xs text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

function Index() {
  // Shared URL input — built once at the top level, reused by every tab.
  const [url, setUrl] = useState("");
  const [submittedUrl, setSubmittedUrl] = useState("");
  const [tab, setTab] = useState("captions");
  const [transcript, setTranscript] = useState("");
  const [captionsResult, setCaptionsResult] = useState<CaptionsResult | null>(null);

  const handleSubmit = useCallback((u: string) => {
    setUrl(u);
    setSubmittedUrl(u);
    setTab("captions");
  }, []);

  const handleTranscript = useCallback((text: string, result: CaptionsResult) => {
    // Shared state — SEO reuses this transcript without re-fetching.
    setTranscript(text);
    setCaptionsResult(result);
  }, []);

  return (
    <div className="space-y-8">
      <Toaster richColors position="top-right" />
      <section className="pt-6 sm:pt-10">
        <Hero />
        <div className="mt-6">
          <UrlInput onSubmit={handleSubmit} defaultUrl={url} />
        </div>
        <StepIndicator active={tab} />
      </section>

      <section className="mx-auto w-full max-w-3xl">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="fetch" className="gap-1 text-xs">
              <Zap className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Fetch</span>
            </TabsTrigger>
            <TabsTrigger value="captions" className="gap-1 text-xs">
              <Captions className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Captions</span>
            </TabsTrigger>
            <TabsTrigger value="seo" className="gap-1 text-xs">
              <Wand2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">SEO</span>
            </TabsTrigger>
            <TabsTrigger value="thumbnail" className="gap-1 text-xs">
              <ImageIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Thumb</span>
            </TabsTrigger>
            <TabsTrigger value="schedule" className="gap-1 text-xs">
              <Calendar className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Plan</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fetch" className="mt-4">
            <PlaceholderTab
              title="Fetch"
              body="Video metadata + formats (existing POST /api/v1/info + /downloads flow). Paste a link above — captions start automatically."
            />
          </TabsContent>
          <TabsContent value="captions" className="mt-4">
            <CaptionsTab url={submittedUrl} onTranscript={handleTranscript} />
          </TabsContent>
          <TabsContent value="seo" className="mt-4">
            <SeoTab
              transcript={transcript}
              videoTitle={
                captionsResult?.videoId ? `YouTube Video ${captionsResult.videoId}` : undefined
              }
            />
          </TabsContent>
          <TabsContent value="thumbnail" className="mt-4">
            <ThumbnailTab url={submittedUrl} />
          </TabsContent>
          <TabsContent value="schedule" className="mt-4">
            <ScheduleTab />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
