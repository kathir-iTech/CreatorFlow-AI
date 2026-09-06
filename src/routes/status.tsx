import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, Loader2, TriangleAlert, CircleCheck } from "lucide-react";
import { api, API_BASE_URL } from "@/lib/api";
import { useApiHealth } from "@/hooks/useApiHealth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/status")({
  component: StatusPage,
});

function StatusPage() {
  const { state, detail } = useApiHealth(15000);
  const [version, setVersion] = useState<string>("…");
  const [pub, setPub] = useState<{
    entries: Array<{ timestamp: string; endpoint: string; path: string; success: boolean }>;
    total: number;
    percentages: Record<string, number>;
    byPathSuccess: Record<string, { total: number; success: number; rate: number }>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .version()
      .then((v) => {
        if (!cancelled) setVersion(v ? JSON.stringify(v) : "unreachable");
      })
      .catch(() => {
        if (!cancelled) setVersion("unreachable");
      });
    return () => {
      cancelled = true;
    };
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .statusPublic()
        .then((d) => {
          if (!cancelled) setPub(d);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 7000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="space-y-6 pt-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <Activity className="h-6 w-6 text-cyan-300" />
          System status
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live health of the CreatorFlow AI backend — checked every 15 seconds. Fallback panel below polls every 7s.
        </p>
      </div>
      <div className="glass mx-auto max-w-3xl space-y-4 rounded-3xl p-6" aria-live="polite">
        <div className="flex flex-wrap items-center gap-2">
          {state === "checking" && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking backend… (first load can take up to a minute while the server wakes up)
            </p>
          )}
          {state === "online" && (
            <p className="flex items-center gap-2 text-sm text-emerald-300">
              <CircleCheck className="h-4 w-4" />
              Backend online — {detail}
              <Badge variant="secondary" className="text-[10px]">
                {API_BASE_URL}
              </Badge>
            </p>
          )}
          {state === "degraded" && (
            <p className="flex items-center gap-2 text-sm text-amber-300">
              <TriangleAlert className="h-4 w-4" />
              Backend degraded — {detail}
            </p>
          )}
          {state === "offline" && (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm text-rose-200">
                <TriangleAlert className="h-4 w-4" />
                Backend unreachable — it may be waking up. Wait a moment and retry.
              </p>
              <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </div>
          )}
        </div>
        <pre className="overflow-auto rounded-2xl bg-black/20 p-4 text-xs text-muted-foreground">
          {version}
        </pre>
      </div>

      <div className="glass mx-auto max-w-3xl space-y-4 rounded-3xl p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4 text-[#FFB020]" />
          Fallback paths — last 20 requests
        </h2>
        {!pub || pub.total === 0 ? (
          <p className="text-sm text-muted-foreground">No requests yet — paste a video into Fetch to see live counts.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Object.entries(pub.percentages).map(([path, pct]) => {
                const s = pub.byPathSuccess[path];
                const dot = s && s.rate >= 80 ? "bg-emerald-400" : s && s.rate >= 50 ? "bg-amber-400" : "bg-rose-400";
                return (
                  <div key={path} className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`h-2 w-2 rounded-full ${dot}`} />
                      <span className="font-mono text-[11px]">{path}</span>
                      <span className="ml-auto font-mono text-xs">{pct}%</span>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {s?.success}/{s?.total} success ({s?.rate}%)
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="space-y-1">
              {pub.entries.slice(0, 10).map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-xs font-mono">
                  <span className={e.success ? "text-emerald-300" : "text-rose-300"}>{e.success ? "✓" : "✗"}</span>
                  <span className="text-muted-foreground">{new Date(e.timestamp).toLocaleTimeString()}</span>
                  <span>{e.endpoint}</span>
                  <span className="text-[#FFB020]">{e.path}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
