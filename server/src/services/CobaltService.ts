import { logger } from "@/logging/logger.js";
import { createJobDir, safeRemove } from "@/utils/tmp.js";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

/**
 * Cobalt fallback — what y2mate/10downloader actually use behind the scenes
 * for 8K when yt-dlp is blocked. Cobalt is a self-hostable YouTube
 * resolver with residential IP rotation, no cookies/PO needed.
 * Public instances: co.wuk.sh, api.cobalt.tools
 * Docs: https://github.com/imputnet/cobalt
 */
const COBALT_INSTANCES = [
  "https://co.wuk.sh",
  "https://api.cobalt.tools",
];

export async function tryCobaltDownload(url: string, workDir: string): Promise<string | null> {
  for (const base of COBALT_INSTANCES) {
    try {
      logger.info({ base, url }, "Cobalt fallback: requesting stream");
      const r = await fetch(`${base}/`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ url, videoQuality: "8", downloadMode: "auto", filenameStyle: "basic" }),
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) continue;
      const j = (await r.json()) as { status?: string; url?: string; picker?: Array<{ url?: string }> };
      const streamUrl = j.url ?? j.picker?.[0]?.url;
      if (!streamUrl) continue;
      // Stream to file (same workDir as yt-dlp would)
      const outPath = path.join(workDir, `cobalt_${Date.now()}.mp4`);
      const src = await fetch(streamUrl, { signal: AbortSignal.timeout(60000) });
      if (!src.ok || !src.body) continue;
      await pipeline(src.body as unknown as NodeJS.ReadableStream, createWriteStream(outPath));
      logger.info({ base, outPath }, "Cobalt fallback: stream saved");
      return outPath;
    } catch (e) {
      logger.debug({ err: e, base }, "Cobalt fallback failed for instance");
      continue;
    }
  }
  return null;
}

export async function tryCobaltWithWorkDir(url: string): Promise<{ filePath: string; workDir: string } | null> {
  const workDir = await createJobDir(`cobalt-${Date.now()}`);
  try {
    const fp = await tryCobaltDownload(url, workDir);
    if (!fp) {
      await safeRemove(workDir);
      return null;
    }
    return { filePath: fp, workDir };
  } catch {
    await safeRemove(workDir);
    return null;
  }
}
