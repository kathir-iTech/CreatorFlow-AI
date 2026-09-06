import { logger } from "@/logging/logger.js";

function fmt(n: number): string {
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function logMemory(tag: string, extra?: Record<string, unknown>): void {
  const m = process.memoryUsage();
  logger.info(
    {
      tag,
      rss: fmt(m.rss),
      heapUsed: fmt(m.heapUsed),
      heapTotal: fmt(m.heapTotal),
      external: fmt(m.external),
      rssRaw: m.rss,
      heapUsedRaw: m.heapUsed,
      ...extra,
    },
    `[memory] ${tag} rss=${fmt(m.rss)} heapUsed=${fmt(m.heapUsed)} external=${fmt(m.external)}`,
  );
}

export function getMemorySnapshot(): Record<string, number> {
  const m = process.memoryUsage();
  return { rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, external: m.external };
}
