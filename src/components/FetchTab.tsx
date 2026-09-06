import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, RefreshCw, TriangleAlert, Zap } from "lucide-react";
import { toast } from "sonner";
import { api, friendlyError, API_BASE_URL, type Job } from "@/lib/api";
import { useSlowHint } from "@/lib/useSlowHint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Status = "idle" | "working" | "done" | "error";

/**
 * Fetch tab — real download-job status over the existing SSE stream
 * (GET /api/v1/downloads/:id/events), not a placeholder. Shows queued →
 * percent → succeeded (with a one-click file link) or failed + Retry.
 */
export function FetchTab({ url }: { url: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const lastUrl = useRef("");
  const slow = useSlowHint(status === "working");
  const esRef = useRef<EventSource | null>(null);

  const closeStream = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, []);

  const start = useCallback(
    async (targetUrl: string) => {
      const u = targetUrl.trim();
      if (!u) {
        toast.warning("Paste a YouTube link first");
        return;
      }
      closeStream();
      lastUrl.current = u;
      setStatus("working");
      setError(null);
      setJob(null);
      try {
        const created = await api.createDownload({ url: u, kind: "video", maxHeight: 720 });
        setJobId(created.id);
        const es = new EventSource(`${API_BASE_URL}/api/v1/downloads/${created.id}/events`);
        esRef.current = es;
        es.addEventListener("progress", (ev) => {
          try {
            const data = JSON.parse((ev as MessageEvent).data) as { percent?: number };
            setJob((prev) =>
              prev
                ? { ...prev, percent: data.percent ?? prev.percent }
                : { ...created, percent: data.percent ?? 0 },
            );
          } catch {
            /* partial frame — next one completes it */
          }
        });
        es.addEventListener("status", (ev) => {
          try {
            const data = JSON.parse((ev as MessageEvent).data) as Partial<Job>;
            setJob((prev) => ({ ...(prev ?? created), ...data, id: created.id }));
            if (data.status === "canceled") {
              setStatus("error");
              setError("Download was canceled.");
              es.close();
            }
          } catch {
            /* ignore */
          }
        });
        es.addEventListener("completed", (ev) => {
          try {
            const data = JSON.parse((ev as MessageEvent).data) as {
              filename?: string;
              filesize?: number;
            };
            setJob((prev) => ({
              ...(prev ?? created),
              status: "succeeded",
              percent: 100,
              filename: data.filename,
            }));
            setStatus("done");
            toast.success("Download ready", {
              description: data.filename ?? "Your file is ready.",
            });
          } catch {
            setStatus("done");
          }
          es.close();
        });
        es.addEventListener("error", (ev) => {
          // SSE 'error' fires on stream failure AND on job-error events
          // (server sends event:error for job failures). Distinguish by payload.
          try {
            const data = JSON.parse((ev as MessageEvent).data) as {
              code?: string;
              message?: string;
            };
            if (data?.message || data?.code) {
              setError(data.message ?? "Download failed.");
              setStatus("error");
              es.close();
              return;
            }
          } catch {
            /* no payload — transport-level failure below */
          }
          // Transport failure with no final state: mark error so the UI
          // never hangs on a dead stream.
          setJob((prev) => {
            if (prev && (prev.status === "succeeded" || prev.status === "failed")) return prev;
            setStatus("error");
            setError("Lost connection to the download stream. Retry to resume.");
            return prev;
          });
          es.close();
        });
        // Initial snapshot in case events race ahead of first paint.
        api
          .getJob(created.id)
          .then((j) => setJob(j))
          .catch(() => undefined);
      } catch (e) {
        const f = friendlyError(e);
        setError(f.message);
        setStatus("error");
        toast.error(f.title, { description: f.message });
      }
    },
    [closeStream],
  );

  // New submitted URL → new job (never show the previous video's file).
  useEffect(() => {
    const u = url.trim();
    if (u && u !== lastUrl.current) {
      void start(u);
    }
  }, [url, start]);

  useEffect(() => closeStream, [closeStream]);

  const percent = Math.round(job?.percent ?? 0);

  return (
    <Card className="glass">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-amber-300" />
              Fetch
              {job && (
                <Badge variant={job.status === "succeeded" ? "default" : "secondary"}>
                  {job.status} · {percent}%
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {url ? (
                <>
                  Source URL: <code className="break-all text-xs">{url}</code>
                </>
              ) : (
                "Paste a YouTube link above, then fetch the video file."
              )}
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => void start(url)}
            disabled={!url.trim() || status === "working"}
          >
            {status === "working" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {status === "working" ? "Fetching…" : job ? "Fetch again" : "Fetch video"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4" aria-live="polite">
        {status === "idle" && (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-sm text-muted-foreground">
            No download yet — paste a link above and hit Fetch.
          </div>
        )}

        {status === "working" && (
          <div className="space-y-2" aria-label="Download progress">
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-foreground/10"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Download progress"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-center text-xs text-muted-foreground">
              {percent}%{job?.message ? ` — ${job.message}` : ""}
            </p>
            {percent === 0 && (
              <div className="space-y-2 pt-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            )}
            {slow && (
              <p className="pt-1 text-center text-xs text-muted-foreground">
                Still working — the server may be waking up (up to a minute on the free tier).
              </p>
            )}
          </div>
        )}

        {status === "error" && (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-500/5 p-5 text-sm">
            <div className="flex items-center gap-2 font-medium text-rose-200">
              <TriangleAlert className="h-4 w-4" />
              Download failed
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{error ?? "Please retry."}</p>
            <div className="mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void start(url)}
                disabled={!url.trim()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          </div>
        )}

        {status === "done" && job && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">
                {job.filename ?? "Download ready"}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Ready — the file downloads once, then is removed from the server.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                const a = document.createElement("a");
                a.href = api.fileUrl(job.id);
                a.download = job.filename ?? "video";
                document.body.appendChild(a);
                a.click();
                a.remove();
              }}
            >
              <Download className="h-3.5 w-3.5" />
              Download file
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
