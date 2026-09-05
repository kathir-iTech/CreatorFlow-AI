/**
 * DownloadService — owns the async download JOB lifecycle only (plan, queue,
 * progress, cancel, delivery). It does NOT execute yt-dlp itself (delegated
 * to YtDlpEngine) and does NOT resolve transcripts, SEO, or thumbnails —
 * those are separate services that reuse the engine independently.
 */
import path from "node:path";
import { stat } from "node:fs/promises";
import { ulid } from "ulid";
import { providerRegistry } from "@/providers/ProviderRegistry.js";
import { ytDlpEngine } from "@/engines/downloader/YtDlpEngine.js";
import { jobQueue } from "@/jobs/JobQueue.js";
import { jobStore, type JobRecord } from "@/jobs/JobStore.js";
import { createJobDir, safeRemove } from "@/utils/tmp.js";
import { logger } from "@/logging/logger.js";
import { AppError } from "@/errors/AppError.js";
import { infoService } from "./InfoService.js";
import type { DownloadRequest } from "@/providers/types.js";

export interface CreateDownloadResult {
  jobId: string;
}

export class DownloadService {
  async create(req: DownloadRequest): Promise<CreateDownloadResult> {
    const provider = providerRegistry.resolveFromUrl(req.url);
    // Fetch (cached) metadata up front so the plan is precise
    const { metadata } = await infoService.getMetadata(req.url);
    const plan = provider.buildDownloadPlan(metadata, req);

    logger.info(
      {
        provider: provider.id,
        kind: req.kind,
        requestedMaxHeight: req.maxHeight ?? null,
        requestedFormatId: req.formatId ?? null,
        plannedFormat: plan.format ?? null,
        useCookies: !!plan.useCookies,
      },
      "Download request planned",
    );

    const jobId = ulid();
    const record: JobRecord = {
      id: jobId,
      providerId: provider.id,
      url: req.url,
      kind: req.kind,
      status: "queued",
      percent: 0,
      createdAt: Date.now(),
    };
    jobStore.create(record);
    jobStore.emit({ type: "status", jobId, status: "queued" });

    jobQueue.enqueue({
      id: jobId,
      run: async (signal) => {
        const workDir = await createJobDir(jobId);
        try {
          jobStore.update(jobId, { status: "running", startedAt: Date.now() });
          jobStore.emit({ type: "status", jobId, status: "running" });

          const result = await ytDlpEngine.download({
            plan,
            workDir,
            jobId,
            signal,
            onEvent: (ev) => jobStore.onProgress(jobId, ev),
          });

          const filename = path.basename(result.filePath);
          const size = (await stat(result.filePath)).size;

          jobStore.update(jobId, {
            status: "succeeded",
            percent: 100,
            filePath: result.filePath,
            filename,
            filesize: size,
            finishedAt: Date.now(),
          });
          jobStore.emit({
            type: "completed",
            jobId,
            downloadUrl: `/api/v1/downloads/${jobId}/file`,
            filename,
            filesize: size,
          });
          logger.info(
            { jobId, provider: provider.id, durationMs: result.durationMs, filesize: size },
            "Download job succeeded",
          );
        } catch (err) {
          await safeRemove(workDir);
          throw err;
        }
      },
      onError: (err) => {
        const code = err instanceof AppError ? err.code : "INTERNAL_ERROR";
        const message = err instanceof Error ? err.message : "Unknown error";
        let errorProvider: string | undefined;
        let errorRetryable: boolean | undefined;
        if (err instanceof AppError && err.details && typeof err.details === "object") {
          const d = err.details as { provider?: string; retryable?: boolean };
          errorProvider = d.provider;
          errorRetryable = d.retryable;
        }
        jobStore.update(jobId, {
          status: "failed",
          errorCode: code,
          errorProvider,
          errorRetryable,
          message,
          finishedAt: Date.now(),
        });
        jobStore.emit({ type: "error", jobId, code, message });
        logger.warn(
          {
            jobId,
            code,
            provider: errorProvider,
            retryable: errorRetryable,
            botCheck: code === "BOT_CHECK",
            message,
          },
          "Download job failed",
        );
      },
    });

    return { jobId };
  }

  cancel(jobId: string): boolean {
    const job = jobStore.get(jobId);
    if (!job) return false;
    const ok = jobQueue.cancel(jobId);
    if (ok) {
      jobStore.update(jobId, { status: "canceled", finishedAt: Date.now() });
      jobStore.emit({ type: "status", jobId, status: "canceled" });
    }
    return ok;
  }
}

export const downloadService = new DownloadService();