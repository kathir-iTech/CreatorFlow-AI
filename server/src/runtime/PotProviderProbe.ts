import { env } from "@/config/env.js";
import { ensureBgutilSidecar } from "./BgutilManager.js";

export interface PotProbeResult {
  url: string;
  attemptedUrls: string[];
  reachable: boolean;
  status?: number;
  contentType?: string;
  bodyPreview?: string;
  errorName?: string;
  errorMessage?: string;
  durationMs: number;
}

async function tryFetch(url: string, timeoutMs: number) {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "mediahub-diagnostics/1.0" },
    });
    const text = await res.text().catch(() => "");
    return {
      ok: true as const,
      status: res.status,
      contentType: res.headers.get("content-type") ?? undefined,
      bodyPreview: text.slice(0, 200),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const e = err as Error;
    return {
      ok: false as const,
      errorName: e.name,
      errorMessage: e.message,
      durationMs: Date.now() - start,
    };
  }
}

export async function probePotProvider(): Promise<PotProbeResult> {
  // Lazy-start sidecar if BGUTIL_LAZY=1 — first probe will cold-start it (~2-3s)
  if (process.env.BGUTIL_LAZY === "1") {
    await ensureBgutilSidecar().catch(() => {});
  }
  const base = env.YOUTUBE_GETPOT_BASE_URL.replace(/\/$/, "");
  const ping = `${base}/ping`;
  const attempts = [ping, base];
  const overallStart = Date.now();

  for (const url of attempts) {
    const r = await tryFetch(url, 3000);
    if (r.ok) {
      return {
        url,
        attemptedUrls: attempts,
        reachable: true,
        status: r.status,
        contentType: r.contentType,
        bodyPreview: r.bodyPreview,
        durationMs: Date.now() - overallStart,
      };
    }
  }

  // Both failed — re-run the last attempt to surface the error detail.
  const last = await tryFetch(base, 3000);
  return {
    url: base,
    attemptedUrls: attempts,
    reachable: false,
    errorName: last.ok ? undefined : last.errorName,
    errorMessage: last.ok ? undefined : last.errorMessage,
    durationMs: Date.now() - overallStart,
  };
}