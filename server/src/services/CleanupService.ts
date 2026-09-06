import cron from "node-cron";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { ensureTmpRoot, safeRemove } from "@/utils/tmp.js";
import { jobStore } from "@/jobs/JobStore.js";
import { logger } from "@/logging/logger.js";

// node-cron v4 no longer exposes a `cron` namespace type; infer from schedule().
type ScheduledTask = ReturnType<typeof cron.schedule>;

const ORPHAN_TTL_MS = 30 * 60_000; // 30 min
const JOB_RECORD_TTL_MS = 60 * 60_000; // 1h after finished

let task: ScheduledTask | null = null;

async function sweepTmp(): Promise<void> {
  const root = await ensureTmpRoot();
  const entries = await readdir(root).catch(() => []);
  const now = Date.now();
  for (const entry of entries) {
    if (entry === ".gitkeep") continue;
    const full = path.join(root, entry);
    try {
      const s = await stat(full);
      if (now - s.mtimeMs > ORPHAN_TTL_MS) {
        await safeRemove(full);
        logger.debug({ path: full }, "Cleanup: removed orphan tmp entry");
      }
    } catch {
      /* skip */
    }
  }
}

function sweepJobs(): void {
  const now = Date.now();
  for (const job of jobStore.list()) {
    if (
      (job.status === "succeeded" || job.status === "failed" || job.status === "canceled") &&
      job.finishedAt &&
      now - job.finishedAt > JOB_RECORD_TTL_MS
    ) {
      jobStore.delete(job.id);
    }
  }
}

export const cleanupService = {
  start(): void {
    if (task) return;
    task = cron.schedule("*/5 * * * *", async () => {
      try {
        await sweepTmp();
        sweepJobs();
      } catch (err) {
        logger.warn({ err }, "Cleanup sweep failed");
      }
    });
    logger.info("Cleanup service scheduled (every 5 minutes)");
  },
  stop(): void {
    task?.stop();
    task = null;
  },
  async sweepNow(): Promise<void> {
    await sweepTmp();
    sweepJobs();
  },
};