export type PipelineRun = {
  id: string;
  url: string;
  videoId?: string;
  createdAt: number;
  title?: string;
};

const KEY = "creatorflow-pipeline-history";

export function loadHistory(): PipelineRun[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as PipelineRun[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveHistory(runs: PipelineRun[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(runs.slice(0, 50)));
  } catch {
    // private mode
  }
}

export function addHistoryRun(
  entry: Omit<PipelineRun, "id" | "createdAt"> & { createdAt?: number },
) {
  const runs = loadHistory();
  const next: PipelineRun = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...entry,
  };
  // dedupe by url: move existing to front
  const filtered = runs.filter((r) => r.url !== entry.url);
  filtered.unshift(next);
  saveHistory(filtered.slice(0, 50));
  return next;
}

export function clearHistory() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // storage blocked
  }
}
