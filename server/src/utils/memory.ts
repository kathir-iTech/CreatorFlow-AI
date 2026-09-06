import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { logger } from "@/logging/logger.js";

function fmt(n: number): string {
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtBytes(n: number | null | undefined): string | undefined {
  if (n == null || !Number.isFinite(n)) return undefined;
  return fmt(n);
}

function readCgroupMemory(): { current: number | null; max: number | null; source: string } {
  // cgroup v2 (unified) — standard on modern Render / Docker
  const v2cur = "/sys/fs/cgroup/memory.current";
  const v2max = "/sys/fs/cgroup/memory.max";
  // cgroup v1
  const v1cur = "/sys/fs/cgroup/memory/memory.usage_in_bytes";
  const v1max = "/sys/fs/cgroup/memory/memory.limit_in_bytes";
  try {
    if (existsSync(v2cur)) {
      const cur = Number(readFileSync(v2cur, "utf8").trim());
      let max: number | null = null;
      if (existsSync(v2max)) {
        const raw = readFileSync(v2max, "utf8").trim();
        max = raw === "max" ? null : Number(raw);
      }
      return { current: Number.isFinite(cur) ? cur : null, max, source: "cgroupv2" };
    }
    if (existsSync(v1cur)) {
      const cur = Number(readFileSync(v1cur, "utf8").trim());
      let max: number | null = null;
      if (existsSync(v1max)) {
        const raw = readFileSync(v1max, "utf8").trim();
        max = Number(raw);
      }
      return { current: Number.isFinite(cur) ? cur : null, max, source: "cgroupv1" };
    }
  } catch {
    // ignore — container may not expose cgroup, or read blocked
  }
  return { current: null, max: null, source: "none" };
}

function getPsRssSum(): { sumRssKb: number | null; sumRssMb: string | null; details: string | null; count: number | null } {
  try {
    // ps -eo pid,ppid,rss,comm : rss in KB
    const out = execSync("ps -eo pid,ppid,rss,comm 2>/dev/null", { timeout: 2000, encoding: "utf8" });
    const lines = out.trim().split("\n");
    // Header is first line
    let sumKb = 0;
    let count = 0;
    const interesting: string[] = [];
    const relevantRe = /(node|deno|yt-dlp|ffmpeg|ffprobe|python3?)/i;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;
      // ps output: pid ppid rss comm
      const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
      if (!m) continue;
      const rssKb = Number(m[3] ?? 0);
      const comm = m[4] ?? "";
      if (!Number.isFinite(rssKb)) continue;
      count++;
      // Sum only interesting processes + main pid tree, but for OOM truth,
      // container-wide sum is what matters — sum all. Keep filter for detail string.
      sumKb += rssKb;
      if (relevantRe.test(comm) || rssKb > 50000) {
        interesting.push(`${comm}(${m[1]}:${rssKb}KB)`);
      }
    }
    return {
      sumRssKb: sumKb,
      sumRssMb: fmt(sumKb * 1024),
      details: interesting.length ? interesting.join(", ") : null,
      count,
    };
  } catch {
    return { sumRssKb: null, sumRssMb: null, details: null, count: null };
  }
}

export function logMemory(tag: string, extra?: Record<string, unknown>): void {
  const m = process.memoryUsage();
  const cg = readCgroupMemory();
  const ps = getPsRssSum();
  logger.info(
    {
      tag,
      rss: fmt(m.rss),
      heapUsed: fmt(m.heapUsed),
      heapTotal: fmt(m.heapTotal),
      external: fmt(m.external),
      rssRaw: m.rss,
      heapUsedRaw: m.heapUsed,
      cgroupCurrent: cg.current != null ? fmt(cg.current) : undefined,
      cgroupCurrentRaw: cg.current,
      cgroupMax: cg.max != null ? fmt(cg.max) : undefined,
      cgroupMaxRaw: cg.max,
      cgroupSource: cg.source,
      psSumRss: ps.sumRssMb,
      psSumRssKb: ps.sumRssKb,
      psCount: ps.count,
      psDetails: ps.details,
      ...extra,
    },
    `[memory] ${tag} rss=${fmt(m.rss)} heapUsed=${fmt(m.heapUsed)} external=${fmt(m.external)} cgroup=${cg.current != null ? fmt(cg.current) : "n/a"}/${cg.max != null ? fmt(cg.max) : "n/a"} psSum=${ps.sumRssMb ?? "n/a"}`,
  );
}

export function getMemorySnapshot(): Record<string, number> {
  const m = process.memoryUsage();
  const cg = readCgroupMemory();
  const ps = getPsRssSum();
  return {
    rss: m.rss,
    heapUsed: m.heapUsed,
    heapTotal: m.heapTotal,
    external: m.external,
    cgroupCurrent: cg.current ?? 0,
    cgroupMax: cg.max ?? 0,
    psSumRssKb: ps.sumRssKb ?? 0,
  };
}
