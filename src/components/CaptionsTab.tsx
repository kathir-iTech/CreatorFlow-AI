import { useCallback, useEffect, useRef, useState } from "react";
import { Captions, Download, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { api, friendlyError, type CaptionSegment, type CaptionsResult } from "@/lib/api";
import { useSlowHint } from "@/lib/useSlowHint";
import {
  captionsToPlainText,
  captionsToSrt,
  captionsToVtt,
  downloadTextFile,
  formatTime,
} from "@/lib/captions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type Status = "idle" | "loading" | "done" | "error";

export function CaptionsTab({
  url,
  onTranscript,
}: {
  url: string;
  onTranscript?: (text: string, result: CaptionsResult) => void;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<CaptionsResult | null>(null);
  const [segments, setSegments] = useState<CaptionSegment[]>([]);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const lastFetchedUrl = useRef<string>("");
  // Race guard (Part 7): rapid successive submissions must not let a slow
  // first response overwrite the newer request's result.
  const requestSeq = useRef(0);
  const slow = useSlowHint(status === "loading");

  const fetchCaptions = useCallback(
    async (targetUrl: string) => {
      const u = targetUrl.trim();
      if (!u) {
        toast.warning("Paste a YouTube link first");
        return;
      }
      const seq = ++requestSeq.current;
      lastFetchedUrl.current = u;
      setStatus("loading");
      setError(null);
      try {
        const data = await api.captions(u);
        if (requestSeq.current !== seq) return; // stale — a newer request won
        setResult(data);
        setSegments(data.captions);
        setStatus("done");
        const label =
          data.source === "native" ? "Native YouTube captions" : "Groq Whisper transcription";
        toast.success(label, {
          description: `${data.captions.length} lines${data.isAuto ? " (auto-generated)" : ""} — ready to edit.`,
        });
        onTranscript?.(captionsToPlainText(data.captions), data);
      } catch (e) {
        if (requestSeq.current !== seq) return; // stale — a newer request won
        const f = friendlyError(e);
        setError({ title: f.title, message: f.message });
        setStatus("error");
        toast.error(f.title, { description: f.message });
      }
    },
    [onTranscript],
  );

  // Auto-fetch when the shared top-level URL is submitted — every NEW url
  // refetches (no stale transcript lingers) and in-flight races resolve to
  // the latest submission, never the slowest response.
  useEffect(() => {
    const u = url.trim();
    if (u && u !== lastFetchedUrl.current) {
      void fetchCaptions(u);
    }
  }, [url, fetchCaptions]);

  const updateLine = (idx: number, text: string) => {
    setSegments((prev) => prev.map((s, i) => (i === idx ? { ...s, text } : s)));
  };

  const edited = result ? segments : [];
  const plainText = captionsToPlainText(edited);

  return (
    <Card className="glass">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Captions className="h-4 w-4 text-violet-300" />
              Captions
            </CardTitle>
            <CardDescription>
              {url ? (
                <>
                  Source URL: <code className="break-all text-xs">{url}</code>
                </>
              ) : (
                "Paste a YouTube link above, then fetch captions."
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {result && (
              <Badge variant={result.source === "native" ? "default" : "secondary"}>
                {result.source === "native" ? "native captions" : "Groq Whisper"}
                {result.isAuto ? " · auto" : ""}
              </Badge>
            )}
            <Button
              size="sm"
              onClick={() => void fetchCaptions(url)}
              disabled={!url.trim() || status === "loading"}
            >
              {status === "loading" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {status === "loading" ? "Fetching…" : result ? "Refetch" : "Get captions"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4" aria-live="polite">
        {status === "idle" && (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-sm text-muted-foreground">
            No transcript yet — paste a link above and hit Fetch, or press “Get captions”.
          </div>
        )}

        {status === "loading" && (
          <div className="space-y-2" aria-label="Loading captions">
            <Skeleton className="h-4 w-1/3" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-4 w-12 shrink-0" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
            {slow && (
              <p className="pt-2 text-center text-xs text-muted-foreground">
                Still working — the server may be waking up (this can take up to a minute on the
                free tier). Hang tight.
              </p>
            )}
          </div>
        )}

        {status === "error" && error && (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-500/5 p-5 text-sm">
            <div className="flex items-center gap-2 font-medium text-rose-200">
              <TriangleAlert className="h-4 w-4" />
              {error.title}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
            <div className="mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void fetchCaptions(url)}
                disabled={!url.trim()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          </div>
        )}

        {status === "done" && result && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadTextFile("captions.srt", captionsToSrt(edited), "text/srt")}
              >
                <Download className="h-3.5 w-3.5" />
                .srt
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadTextFile("captions.vtt", captionsToVtt(edited), "text/vtt")}
              >
                <Download className="h-3.5 w-3.5" />
                .vtt
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadTextFile("transcript.txt", plainText, "text/plain")}
              >
                <Download className="h-3.5 w-3.5" />
                .txt
              </Button>
              <span className="ml-auto text-xs text-muted-foreground">
                {edited.length} lines · {result.language ?? "en"}
                {result.isAuto ? " · auto-generated" : ""}
              </span>
            </div>

            <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-3">
              {edited.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-12 shrink-0 pt-2 text-right font-mono text-[11px] text-muted-foreground">
                    {formatTime(s.start)}
                  </span>
                  <Textarea
                    value={s.text}
                    onChange={(e) => updateLine(i, e.target.value)}
                    rows={1}
                    aria-label={`Caption line ${i + 1} at ${formatTime(s.start)}`}
                    className="min-h-9 resize-y text-sm"
                  />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Lines are editable — exports use your edited text. The transcript is also shared with
              the SEO tab.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
