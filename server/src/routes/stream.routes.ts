import { Router } from "express";
import { z } from "zod";
import { execa } from "execa";
import { validate, getValidated } from "@/middleware/validate.js";
import { providerRegistry } from "@/providers/ProviderRegistry.js";
import { infoService } from "@/services/InfoService.js";
import { resolveBinaries } from "@/runtime/BinaryResolver.js";
import { getCookiesPath } from "@/security/CookiesDetector.js";
import { buildYtDlpArgs } from "@/engines/downloader/YtDlpArgsBuilder.js";
import { logger } from "@/logging/logger.js";
import { contentDispositionFilename, sanitizeFilename, sanitizeMediaUrl } from "@/utils/sanitize.js";

const StreamQuery = z.object({
  url: z.string(),
  kind: z.enum(["video", "audio"]).default("video"),
  formatId: z.string().optional(),
  maxHeight: z.coerce.number().int().positive().max(4320).optional(),
  audioFormat: z.enum(["mp3", "m4a", "opus", "wav"]).optional(),
});

type StreamQuery = z.infer<typeof StreamQuery>;

export const streamRouter = Router();

/**
 * Pipe yt-dlp output straight to the response — no disk write.
 * Useful for short-form media (Instagram reels, YouTube Shorts).
 */
streamRouter.get("/", validate(StreamQuery, "query"), async (req, res, next) => {
  try {
    const q = getValidated<StreamQuery>(req, "query");
    q.url = sanitizeMediaUrl(q.url);
    const provider = providerRegistry.resolveFromUrl(q.url);
    const { metadata } = await infoService.getMetadata(q.url);
    const plan = provider.buildDownloadPlan(metadata, {
      url: q.url,
      kind: q.kind,
      formatId: q.formatId,
      maxHeight: q.maxHeight,
      audioFormat: q.audioFormat,
    });
    const { ytDlp } = await resolveBinaries();
    const cookies = getCookiesPath();
    const args = buildYtDlpArgs({ plan, outputTemplate: "-", cookiesPath: cookies });
    const filename = sanitizeFilename(
      `${metadata.title}.${q.kind === "audio" ? plan.audioFormat ?? "mp3" : "mp4"}`,
    );

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", contentDispositionFilename(filename));

    logger.info({ provider: provider.id, command: ["yt-dlp", ...args] }, "Stream start");
    const child = execa(ytDlp.path, args, { buffer: false, reject: false });
    if (!child.stdout) throw new Error("yt-dlp produced no stdout");
    child.stdout.pipe(res);

    req.on("close", () => {
      if (!res.writableEnded) child.kill("SIGTERM");
    });
    await child;
  } catch (err) {
    next(err);
  }
});