import { EventEmitter } from "node:events";
import type { ProgressEvent } from "@/engines/downloader/ProgressParser.js";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface JobRecord {
  id: string;
  providerId: string;
  url: string;
  kind: "video" | "audio";
  status: JobStatus;
  percent: number;
  speed?: string;
  eta?: string;
  message?: string;
  errorCode?: string;
  errorProvider?: string;
  errorRetryable?: boolean;
  filename?: string;
  filePath?: string;
  filesize?: number;
  startedAt?: number;
  finishedAt?: number;
  createdAt: number;
}

export type JobEvent =
  | { type: "progress"; jobId: string; percent: number; speed?: string; eta?: string }
  | { type: "status"; jobId: string; status: JobStatus; message?: string; errorCode?: string }
  | { type: "stage"; jobId: string; stage: string }
  | { type: "completed"; jobId: string; downloadUrl: string; filename: string; filesize: number }
  | { type: "error"; jobId: string; code: string; message: string };

export class JobStore {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly emitter = new EventEmitter();

  create(record: JobRecord): void {
    this.jobs.set(record.id, record);
  }

  get(id: string): JobRecord | undefined {
    return this.jobs.get(id);
  }

  update(id: string, patch: Partial<JobRecord>): JobRecord | undefined {
    const existing = this.jobs.get(id);
    if (!existing) return undefined;
    Object.assign(existing, patch);
    return existing;
  }

  delete(id: string): void {
    this.jobs.delete(id);
    this.emitter.removeAllListeners(`job:${id}`);
  }

  emit(event: JobEvent): void {
    this.emitter.emit(`job:${event.jobId}`, event);
  }

  subscribe(jobId: string, listener: (e: JobEvent) => void): () => void {
    const channel = `job:${jobId}`;
    this.emitter.on(channel, listener);
    return () => this.emitter.off(channel, listener);
  }

  onProgress(jobId: string, ev: ProgressEvent): void {
    if (ev.type === "progress" && typeof ev.percent === "number") {
      this.update(jobId, { percent: ev.percent, speed: ev.speed, eta: ev.eta });
      this.emit({ type: "progress", jobId, percent: ev.percent, speed: ev.speed, eta: ev.eta });
    } else if (ev.type === "stage" && ev.stage) {
      this.emit({ type: "stage", jobId, stage: ev.stage });
    }
  }

  /** Mostly for tests / admin endpoints. */
  list(): JobRecord[] {
    return [...this.jobs.values()];
  }
}

export const jobStore = new JobStore();