import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { env } from "@/config/env.js";

export async function ensureTmpRoot(): Promise<string> {
  const root = path.resolve(env.TMP_DIR);
  await mkdir(root, { recursive: true });
  return root;
}

export async function createJobDir(jobId: string): Promise<string> {
  const root = await ensureTmpRoot();
  const dir = await mkdtemp(path.join(root, `job-${jobId}-`));
  return dir;
}

export async function safeRemove(target: string): Promise<void> {
  try {
    if (!existsSync(target)) return;
    await rm(target, { recursive: true, force: true });
  } catch {
    /* swallow */
  }
}

/**
 * Resolve a path that must remain INSIDE root — protect against directory escapes.
 */
export function assertInside(root: string, candidate: string): string {
  const resolved = path.resolve(candidate);
  const rootResolved = path.resolve(root);
  if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
    throw new Error(`Path escape detected: ${candidate}`);
  }
  return resolved;
}

export async function fileSize(p: string): Promise<number> {
  const s = await stat(p);
  return s.size;
}