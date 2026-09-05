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

  return (
    <div className="space-y-6 pt-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <Activity className="h-6 w-6 text-cyan-300" />
          System status
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live health of the CreatorFlow AI backend — checked every 15 seconds.
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
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </div>
          )}
        </div>
        <pre className="overflow-auto rounded-2xl bg-black/20 p-4 text-xs text-muted-foreground">
          {version}
        </pre>
      </div>
    </div>
  );
}
