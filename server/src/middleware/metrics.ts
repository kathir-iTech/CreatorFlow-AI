import type { Request, Response, NextFunction } from "express";

interface EndpointStat {
  requests: number;
  errors: number;
  totalMs: number;
}

const stats = new Map<string, EndpointStat>();
const startedAt = Date.now();

function keyFor(req: Request): string {
  // Group by mount point so /downloads/:id doesn't explode cardinality.
  const base = (req.baseUrl || "").trim() || "/";
  return `${req.method} ${base}`;
}

/** Zero-cost in-memory request/error/latency counters (Part 12). */
export function metricsRecorder(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on("finish", () => {
    const key = keyFor(req);
    const s = stats.get(key) ?? { requests: 0, errors: 0, totalMs: 0 };
    s.requests += 1;
    if (res.statusCode >= 400) s.errors += 1;
    s.totalMs += Date.now() - start;
    stats.set(key, s);
  });
  next();
}

export function getMetricsSnapshot() {
  const endpoints: Record<string, { requests: number; errors: number; avgMs: number }> = {};
  for (const [key, s] of stats) {
    endpoints[key] = {
      requests: s.requests,
      errors: s.errors,
      avgMs: s.requests > 0 ? Math.round((s.totalMs / s.requests) * 10) / 10 : 0,
    };
  }
  return { uptimeSec: Math.round((Date.now() - startedAt) / 1000), endpoints };
}
