import { env } from "@/config/env.js";
import { logger } from "@/logging/logger.js";

export interface QueuedTask {
  id: string;
  run: (signal: AbortSignal) => Promise<void>;
  onError: (err: unknown) => void;
}

/**
 * Abstract queue interface. Default impl is in-memory. Swap with a BullMQ
 * adapter later by implementing the same contract.
 */
export interface JobQueueAdapter {
  enqueue(task: QueuedTask): void;
  cancel(id: string): boolean;
  size(): { queued: number; active: number };
}

export class InMemoryJobQueue implements JobQueueAdapter {
  private readonly queue: QueuedTask[] = [];
  private readonly active = new Map<string, AbortController>();

  constructor(private readonly concurrency: number) {}

  enqueue(task: QueuedTask): void {
    this.queue.push(task);
    this.drain();
  }

  cancel(id: string): boolean {
    // Cancel queued
    const qIdx = this.queue.findIndex((t) => t.id === id);
    if (qIdx >= 0) {
      this.queue.splice(qIdx, 1);
      return true;
    }
    // Cancel running
    const ctrl = this.active.get(id);
    if (ctrl) {
      ctrl.abort();
      return true;
    }
    return false;
  }

  size(): { queued: number; active: number } {
    return { queued: this.queue.length, active: this.active.size };
  }

  private drain(): void {
    while (this.active.size < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;
      const ctrl = new AbortController();
      this.active.set(task.id, ctrl);
      logger.debug({ jobId: task.id, active: this.active.size, queued: this.queue.length }, "queue: starting task");
      task
        .run(ctrl.signal)
        .catch((err) => task.onError(err))
        .finally(() => {
          this.active.delete(task.id);
          this.drain();
        });
    }
  }
}

export const jobQueue: JobQueueAdapter = new InMemoryJobQueue(env.MAX_CONCURRENT_DOWNLOADS);