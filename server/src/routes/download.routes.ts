import { Router } from "express";
import { z } from "zod";
import { createReadStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import path from "node:path";
import { validate, getValidated } from "@/middleware/validate.js";
import { downloadRateLimit } from "@/middleware/rateLimit.js";
import { downloadService } from "@/services/DownloadService.js";
import { jobStore, type JobEvent } from "@/jobs/JobStore.js";
import { NotFoundError } from "@/errors/AppError.js";
import { contentDispositionFilename, sanitizeMediaUrl } from "@/utils/sanitize.js";
import { SSE_HEARTBEAT_MS } from "@/config/constants.js";
import { logger } from "@/logging/logger.js";
import { safeRemove } from "@/utils/tmp.js";

// Intentionally loose: validation is `z.string()` rather than `z.string().url()`
// so the frontend can send raw pasted links. sanitizeMediaUrl() strips tracking
// params before the URL reaches the downloader engine.
const CreateBody = z.object({
  url: z.string(),
  kind: z.enum(["video", "audio"]).default("video"),
  formatId: z.string().optional(),
  maxHeight: z.number().int().positive().max(4320).optional(),
  audioFormat: z.enum(["mp3", "m4a", "opus", "wav"]).optional(),
});
type CreateBody = z.infer<typeof CreateBody>;


export const downloadRouter = Router();

downloadRouter.post("/", downloadRateLimit, validate(CreateBody, "body"), async (req, res, next) => {
  try {
    const body = getValidated<CreateBody>(req, "body");
    body.url = sanitizeMediaUrl(body.url);
    const result = await downloadService.create(body);
    res.status(202).json({ data: result, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

downloadRouter.get("/:id", (req, res, next) => {
  try {
    const job = jobStore.get(req.params.id);
    if (!job) throw NotFoundError("Job not found");
    res.json({ data: job, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

downloadRouter.delete("/:id", (req, res, next) => {
  try {
    const ok = downloadService.cancel(req.params.id);
    if (!ok) throw NotFoundError("Job not found or already completed");
    res.json({ data: { canceled: true }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

downloadRouter.get("/:id/events", (req, res) => {
  const jobId = req.params.id;
  const job = jobStore.get(jobId);
  if (!job) {
    res.status(404).json({ data: null, error: { code: "NOT_FOUND", message: "Job not found" } });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let closed = false;
  const send = (event: JobEvent) => {
    // Guarded: a write after client disconnect must never throw into the
    // job emitter (which would mark jobs failed and leak listeners).
    if (closed || res.writableEnded || res.destroyed) return;
    try {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (err) {
      logger.warn({ err, jobId }, "SSE write failed, closing stream");
      cleanup();
    }
  };

  // Send current snapshot first
  send({ type: "status", jobId, status: job.status, message: job.message });
  if (job.percent > 0) send({ type: "progress", jobId, percent: job.percent });

  const unsub = jobStore.subscribe(jobId, (event) => {
    send(event);
    if (event.type === "completed" || event.type === "error" || (event.type === "status" && event.status === "canceled")) {
      cleanup();
    }
  });

  const heartbeat = setInterval(() => {
    if (closed || res.writableEnded || res.destroyed) {
      cleanup();
      return;
    }
    try {
      res.write(`: ping\n\n`);
    } catch {
      cleanup();
    }
  }, SSE_HEARTBEAT_MS);

  let cleaned = false;
  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    closed = true;
    clearInterval(heartbeat);
    unsub();
    try {
      res.end();
    } catch {
      // already gone — nothing to do
    }
  }

  req.on("close", cleanup);
});

downloadRouter.get("/:id/file", async (req, res, next) => {
  try {
    const job = jobStore.get(req.params.id);
    if (!job) throw NotFoundError("Job not found");
    if (job.status !== "succeeded") {
      res.status(409).json({
        data: null,
        error: { code: "NOT_READY", message: `Job is ${job.status}` },
        requestId: req.id,
      });
      return;
    }
    if (!job.filePath) {
      // File was already delivered once and cleaned up from disk.
      res.status(410).json({
        data: null,
        error: {
          code: "FILE_GONE",
          message:
            "This download has already been delivered and the file was removed from the server. Start a new download to fetch it again.",
        },
        requestId: req.id,
      });
      return;
    }

    const filePath = job.filePath;
    const filename = job.filename ?? path.basename(filePath);
    const { size } = await stat(filePath);

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", String(size));
    res.setHeader("Content-Disposition", contentDispositionFilename(filename));

    const stream = createReadStream(filePath);
    let cleaned = false;
    const cleanup = async () => {
      if (cleaned) return;
      cleaned = true;
      // "Delete immediately after successful download completes"
      await unlink(filePath).catch(() => undefined);
      // Remove parent job dir too
      await safeRemove(path.dirname(filePath));
      jobStore.update(job.id, { filePath: undefined });
      logger.info({ jobId: job.id, filePath }, "Temp file deleted after delivery");
    };

    stream.on("end", cleanup);
    stream.on("error", (err) => {
      logger.error({ err, jobId: job.id }, "File stream error");
      cleanup();
    });
    req.on("close", () => {
      if (!res.writableEnded) {
        stream.destroy();
        cleanup();
      }
    });

    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});