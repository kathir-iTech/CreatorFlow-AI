import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { History, Trash2, ExternalLink, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadHistory, clearHistory, type PipelineRun } from "@/lib/history";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const [runs, setRuns] = useState<PipelineRun[]>([]);

  useEffect(() => {
    setRuns(loadHistory());
  }, []);

  const handleClear = () => {
    clearHistory();
    setRuns([]);
  };

  return (
    <div className="space-y-6 pt-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <History className="h-6 w-6 text-[#FFB020]" />
          History
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your recent pipeline runs (stored locally in this browser). Click a URL to re-run it in
          Studio.
        </p>
      </div>

      {runs.length === 0 ? (
        <div className="glass mx-auto max-w-3xl rounded-3xl p-10 text-center text-sm text-muted-foreground">
          No history yet — run the pipeline on the Studio tab and your downloads will appear here.
          <div className="mt-4">
            <Link to="/" className="text-[#FFB020] hover:underline">
              Go to Studio
            </Link>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{runs.length} runs</span>
            <Button variant="ghost" size="sm" onClick={handleClear} className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
          {runs.map((r) => (
            <Card key={r.id} className="glass">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {r.title ?? r.videoId ?? "YouTube video"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{r.url}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(r.createdAt).toLocaleString()}
                    {r.videoId && <span className="font-mono text-[10px]">· {r.videoId}</span>}
                  </div>
                </div>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-muted-foreground transition hover:text-foreground"
                  aria-label="Open original URL"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
