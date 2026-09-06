/**
 * Simple semaphore limiter for heavy subprocess work (yt-dlp / ffmpeg).
 * Prevents unbounded concurrent Python interpreters from OOMing a 512 MB container.
 * On free tier, 2 concurrent heavy jobs is ~ceiling before sidecar (~120 MB) + Node (~150 MB) + 2×yt-dlp (~80-120 MB each) ≈ 470 MB.
 */
export function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  function drain() {
    while (active < concurrency && queue.length > 0) {
      const next = queue.shift();
      if (next) next();
    }
  }

  return {
    get activeCount() {
      return active;
    },
    get pendingCount() {
      return queue.length;
    },
    async run<T>(fn: () => Promise<T>): Promise<T> {
      if (active >= concurrency) {
        await new Promise<void>((resolve) => queue.push(resolve));
      }
      active++;
      try {
        return await fn();
      } finally {
        active--;
        drain();
      }
    },
  };
}

// Global limiter for all yt-dlp invocations (metadata + download + subs dump)
// Separated from JobQueue (which only throttles downloads) — this throttles the
// actual subprocess spawn, including untracked metadata/captions paths.
export const ytdlpLimiter = createLimiter(2);
