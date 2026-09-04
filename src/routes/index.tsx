import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Sparkles,
  ShieldCheck,
  Zap,
  ArrowRight,
  Wand2,
  Image as ImageIcon,
  Calendar,
} from "lucide-react";
import { UrlInput } from "@/components/UrlInput";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  component: Index,
});

function Hero() {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground backdrop-blur">
        <Sparkles className="h-3 w-3 text-violet-300" />
        CreatorFlow AI — Phase 0 scaffold
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

function Features() {
  const items = [
    {
      icon: Zap,
      title: "Fast fetch",
      body: "YouTube metadata + formats up to 1080p, streaming-ready.",
    },
    {
      icon: Wand2,
      title: "Captions + SEO",
      body: "Native captions → Groq Whisper fallback + AI SEO pack.",
    },
    { icon: ImageIcon, title: "Thumbnails", body: "FFmpeg keyframes + canvas editor, export PNG." },
    {
      icon: Calendar,
      title: "Schedule",
      body: "Demo-data analytics, best-time heuristic, local calendar.",
    },
    {
      icon: ShieldCheck,
      title: "Free stack",
      body: "Groq free tier, no paid keys required to run.",
    },
    {
      icon: Sparkles,
      title: "Polished UI",
      body: "shadcn + Tailwind v4, dark/light, mobile-ready.",
    },
  ];
  return (
    <div className="mx-auto mt-8 grid w-full max-w-3xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => (
        <div key={it.title} className="glass rounded-2xl p-4">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-foreground/5 text-violet-300">
            <it.icon className="h-4 w-4" />
          </div>
          <div className="mt-3 text-sm font-medium text-foreground">{it.title}</div>
          <div className="mt-1 text-xs text-muted-foreground">{it.body}</div>
        </div>
      ))}
    </div>
  );
}

function StepIndicator() {
  const steps = ["Fetch", "Captions", "SEO", "Thumbnail", "Schedule"];
  return (
    <div className="mx-auto mt-6 flex w-full max-w-3xl items-center justify-between gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-white/5 p-2 backdrop-blur">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-full bg-foreground/10 text-xs font-medium text-foreground">
            {i + 1}
          </div>
          <span className="whitespace-nowrap text-xs text-muted-foreground">{s}</span>
          {i < steps.length - 1 && (
            <ArrowRight className="hidden h-3 w-3 text-muted-foreground/50 sm:block" />
          )}
        </div>
      ))}
    </div>
  );
}

function Index() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchInfo = async (u: string) => {
    setUrl(u);
    setLoading(true);
    // Phase 0: just demo toast, real /api/formats comes in Phase 1
    setTimeout(() => {
      setLoading(false);
      toast.info("Scaffold ready", {
        description: `Pasted: ${u.slice(0, 48)}${u.length > 48 ? "…" : ""} — API wiring lands in Phase 1.`,
      });
    }, 600);
  };

  return (
    <div className="space-y-8">
      <Toaster richColors position="top-right" />
      <section className="pt-6 sm:pt-10">
        <Hero />
        <div className="mt-6">
          <UrlInput onSubmit={fetchInfo} loading={loading} defaultUrl={url} />
        </div>
        <StepIndicator />
        <div className="mx-auto mt-6 max-w-3xl text-center text-xs text-muted-foreground">
          Placeholder pipeline — every tab shares this single URL input (built once at top level).
        </div>
      </section>

      <Features />

      <Card className="glass mx-auto max-w-3xl">
        <CardContent className="p-6 text-sm text-muted-foreground">
          <div className="font-medium text-foreground">Phase 0 verification</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            <li>
              <code className="rounded bg-foreground/5 px-1 py-0.5">.gitignore</code> created first
              — <code>_reference-mediahub/</code>, <code>.env</code>, <code>cookies.txt</code> are
              gitignored
            </li>
            <li>Design tokens + shadcn UI copied from reference (Tailwind v4)</li>
            <li>
              No <code>cookies.txt</code> inside repo — real file lives at{" "}
              <code>D:\Developer\secrets\cookies.txt</code> and Vercel env{" "}
              <code>YT_COOKIES_B64</code>
            </li>
            <li>
              Env vars: <code>GROQ_API_KEY</code>, <code>YT_COOKIES_B64</code> (see .env.example)
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
