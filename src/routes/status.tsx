import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/status")({
  component: StatusPage,
});

function StatusPage() {
  const [health, setHealth] = useState<string>("Checking…");
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => setHealth(JSON.stringify(j, null, 2)))
      .catch(() => setHealth("API not reachable (expected until Phase 1 deployed)"));
  }, []);
  return (
    <div className="space-y-6 pt-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">System status</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Health check — Phase 1 will add full /api/health + binary probe.
        </p>
      </div>
      <pre className="glass mx-auto max-w-3xl overflow-auto rounded-2xl p-4 text-xs text-muted-foreground">
        {health}
      </pre>
    </div>
  );
}
