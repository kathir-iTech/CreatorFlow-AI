import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { logger } from "@/logging/logger.js";

const BGUTIL_MAIN = "/opt/bgutil/server/build/main.js";
const BGUTIL_PORT = Number(process.env.BGUTIL_PORT ?? 4416);
const IDLE_KILL_MS = 15 * 60_000;

let proc: ChildProcess | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let starting: Promise<void> | null = null;

function isRunning(): boolean {
  return !!proc && !proc.killed && proc.exitCode === null;
}

async function waitForPing(timeoutMs = 30000): Promise<boolean> {
  const start = Date.now();
  const url = `http://127.0.0.1:${BGUTIL_PORT}/ping`;
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch {
      // sidecar not yet ready — retry
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  return false;
}

export async function ensureBgutilSidecar(): Promise<boolean> {
  // If BGUTIL_LAZY not enabled, sidecar was started by entrypoint — just probe
  if (process.env.BGUTIL_LAZY !== "1") return true;
  if (isRunning()) {
    // Reset idle kill
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(stopBgutilSidecar, IDLE_KILL_MS);
    }
    return true;
  }
  if (starting) {
    await starting;
    return isRunning();
  }
  if (!existsSync(BGUTIL_MAIN)) {
    logger.warn({ path: BGUTIL_MAIN }, "bgutil sidecar not found — cannot lazy-start");
    return false;
  }
  starting = (async () => {
    logger.info({ port: BGUTIL_PORT }, "Lazy-starting bgutil PO-token sidecar");
    proc = spawn("node", [BGUTIL_MAIN, "--host", "127.0.0.1", "--port", String(BGUTIL_PORT)], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });
    proc.stdout?.on("data", (d) => logger.debug({ src: "bgutil" }, String(d).slice(0, 500)));
    proc.stderr?.on("data", (d) => logger.debug({ src: "bgutil" }, String(d).slice(0, 500)));
    proc.on("exit", (code, sig) => {
      logger.warn({ code, sig }, "bgutil sidecar exited");
      proc = null;
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    });
    const ok = await waitForPing(30000);
    if (!ok) {
      logger.warn("bgutil sidecar did not become ready within 30s");
      stopBgutilSidecar();
    } else {
      logger.info({ pid: proc?.pid, port: BGUTIL_PORT }, "bgutil sidecar ready (lazy)");
      try {
        const usage = process.memoryUsage();
        logger.info({ tag: "bgutil:lazy-ready", rss: `${(usage.rss / 1024 / 1024).toFixed(1)} MB` }, "memory after sidecar lazy-start");
      } catch {
        // ignore
      }
      idleTimer = setTimeout(stopBgutilSidecar, IDLE_KILL_MS);
    }
  })();
  try {
    await starting;
  } finally {
    starting = null;
  }
  return isRunning();
}

export function stopBgutilSidecar(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (proc && !proc.killed) {
    logger.info({ pid: proc.pid }, "Stopping idle bgutil sidecar to reclaim memory");
    try {
      proc.kill("SIGTERM");
    } catch {
      // already dead
    }
    setTimeout(() => {
      if (proc && !proc.killed) {
        try {
          proc.kill("SIGKILL");
        } catch {
          // ignore
        }
      }
    }, 5000).unref();
  }
  proc = null;
}
