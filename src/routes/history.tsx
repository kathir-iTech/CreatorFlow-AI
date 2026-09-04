import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
});

function HistoryPage() {
  return (
    <div className="space-y-6 pt-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Local history (IndexedDB/localStorage) lands in Phase 5 — scaffold placeholder.
        </p>
      </div>
      <div className="glass mx-auto max-w-3xl rounded-3xl p-10 text-center text-sm text-muted-foreground">
        No history yet — your downloads will appear here once Phase 1 wiring is complete.
      </div>
    </div>
  );
}
