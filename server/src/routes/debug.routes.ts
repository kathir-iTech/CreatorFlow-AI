import { Router, type Request, type Response, type NextFunction } from "express";
import { env, getYtDlpProxyUrl } from "@/config/env.js";
import { listRecentArgv } from "@/runtime/RecentArgvBuffer.js";
import { inspectCookies } from "@/runtime/CookieInspector.js";
import { probePotProvider } from "@/runtime/PotProviderProbe.js";
import { execa } from "execa";
import { resolveBinaries } from "@/runtime/BinaryResolver.js";

export const debugRouter = Router();

function redactProxyStatus(url?: string) {
  if (!url) return { configured: false as const };
  try {
    const u = new URL(url);
    return {
      configured: true as const,
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port ? Number(u.port) : undefined,
    };
  } catch {
    return { configured: true as const, protocol: "invalid", hostname: "invalid" };
  }
}

function envPresence(name: keyof typeof env | string) {
  // Read from the parsed env object first (Zod schema is the source of
  // truth at runtime); fall back to process.env for keys not in the schema.
  const parsed = (env as Record<string, unknown>)[name as string];
  const raw = process.env[name as string];
  const value =
    typeof parsed === "string" && parsed.length > 0
      ? parsed
      : typeof raw === "string"
        ? raw
        : undefined;
  return {
    present: typeof value === "string" && value.length > 0,
    length: value?.length ?? 0,
    source: typeof parsed === "string" && parsed.length > 0 ? "env" : raw ? "process.env" : "none",
  };
}

function requireToken(req: Request, res: Response, next: NextFunction): void {
  const expected = env.DEBUG_DIAGNOSTICS_TOKEN;
  if (!expected) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Diagnostics disabled" } });
    return;
  }
  const got = req.header("x-debug-token");
  if (!got || got !== expected) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid or missing x-debug-token" } });
    return;
  }
  next();
}

debugRouter.get("/diagnostics", requireToken, async (_req, res, next) => {
  try {
    const [potProbe] = await Promise.all([probePotProvider()]);
    const cookieReport = inspectCookies();
    const recent = listRecentArgv();

    res.json({
      data: {
        generatedAt: new Date().toISOString(),
        recentYtDlpInvocations: recent,
        potProvider: potProbe,
        cookies: cookieReport,
        env: {
          PROXY_URL: envPresence("PROXY_URL"),
          DOWNLOAD_PROXY_URL: envPresence("DOWNLOAD_PROXY_URL"),
          YOUTUBE_GETPOT_BASE_URL: { ...envPresence("YOUTUBE_GETPOT_BASE_URL"), effective: env.YOUTUBE_GETPOT_BASE_URL },
          COOKIES_TXT_BASE64: envPresence("COOKIES_TXT_BASE64"),
          COOKIES_TXT: envPresence("COOKIES_TXT"),
          COOKIES_FILE: envPresence("COOKIES_FILE"),
          YOUTUBE_VISITOR_DATA: envPresence("YOUTUBE_VISITOR_DATA"),
          YOUTUBE_PO_TOKEN: envPresence("YOUTUBE_PO_TOKEN"),
          YOUTUBE_USER_AGENT: envPresence("YOUTUBE_USER_AGENT"),
          DEBUG_DIAGNOSTICS_TOKEN: envPresence("DEBUG_DIAGNOSTICS_TOKEN"),
          proxyEffective: redactProxyStatus(getYtDlpProxyUrl()),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

debugRouter.get("/env-raw", requireToken, (_req, res) => {
  res.json({
    raw_process_env: process.env.YOUTUBE_GETPOT_BASE_URL,
    env_object: env.YOUTUBE_GETPOT_BASE_URL,
    length_raw: (process.env.YOUTUBE_GETPOT_BASE_URL ?? "").length,
    length_env: env.YOUTUBE_GETPOT_BASE_URL.length,
  });
});

/**
 * Exercises the bgutil sidecar's actual PO-token generation endpoint
 * (`POST /get_pot`) so we can verify a real token is produced, not just
 * that `/ping` responds. Body shape per
 * https://github.com/Brainicism/bgutil-ytdlp-pot-provider server/src/main.ts.
 * Optional ?content_binding=<videoId|visitor_data> query param.
 */
debugRouter.get("/pot-test", requireToken, async (req, res) => {
  const base = (env.YOUTUBE_GETPOT_BASE_URL ?? "").trim().replace(/\/$/, "");
  const contentBinding =
    typeof req.query.content_binding === "string" && req.query.content_binding
      ? req.query.content_binding
      : "dQw4w9WgXcQ";
  const url = `${base}/get_pot`;
  const started = Date.now();
  try {
    const upstream = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "content-type": "application/json",
        "user-agent": "mediahub-diagnostics/1.0",
      },
      body: JSON.stringify({ content_binding: contentBinding }),
    });
    const text = await upstream.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    const tokenLen =
      parsed && typeof parsed === "object" && parsed !== null && "po_token" in parsed && typeof (parsed as { po_token?: unknown }).po_token === "string"
        ? ((parsed as { po_token: string }).po_token).length
        : 0;
    res.status(200).json({
      data: {
        url,
        contentBinding,
        durationMs: Date.now() - started,
        upstreamStatus: upstream.status,
        upstreamContentType: upstream.headers.get("content-type"),
        bodyRaw: text.slice(0, 4000),
        bodyJson: parsed,
        poTokenLength: tokenLen,
        poTokenLooksValid: tokenLen > 40,
      },
    });
  } catch (err) {
    const e = err as Error;
    res.status(502).json({
      error: {
        code: "POT_UPSTREAM_ERROR",
        message: e.message,
        name: e.name,
        url,
        contentBinding,
        durationMs: Date.now() - started,
      },
    });
  }
});

debugRouter.get("/run-raw", requireToken, async (_req, res) => {
  try {
    const { ytDlp } = await resolveBinaries();
    const result = await execa(
      ytDlp.path,
      [
        "--verbose",
        "--remote-components",
        "ejs:github",
        "--extractor-args",
        "youtube:player_client=android,tv_simply,web",
        "--extractor-args",
        "youtubepot-bgutilhttp:base_url=http://zesty-grace.railway.internal:4416",
        "--list-formats",
        "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
      ],
      { reject: false, timeout: 60_000, all: true },
    );
    res
      .type("text/plain")
      .send(
        `EXIT: ${result.exitCode}\n\n===== STDOUT =====\n${result.stdout}\n\n===== STDERR =====\n${result.stderr}\n`,
      );
  } catch (err) {
    res.type("text/plain").status(500).send(String((err as Error).stack ?? err));
  }
});

debugRouter.get("/download-raw", requireToken, async (_req, res) => {
  const startedAt = Date.now();
  try {
    const { ytDlp, ffprobe } = await resolveBinaries();
    try {
      const { rm } = await import("node:fs/promises");
      await rm("/tmp/test-1080.mp4", { force: true });
    } catch {
      /* ignore */
    }
    const ytdlp = await execa(
      ytDlp.path,
      [
        "--no-playlist",
        "-f",
        "bv*[height<=1080]+ba/best",
        "--merge-output-format",
        "mp4",
        "-o",
        "/tmp/test-1080.mp4",
        "--extractor-args",
        "youtube:player_client=android,tv_simply,web",
        "--extractor-args",
        "youtubepot-bgutilhttp:base_url=http://zesty-grace.railway.internal:4416",
        "--cookies",
        "/tmp/mediahub/cookies.txt",
        "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
      ],
      { reject: false, timeout: 180_000 },
    );

    const ffp = await execa(
      ffprobe.path,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=p=0",
        "/tmp/test-1080.mp4",
      ],
      { reject: false, timeout: 30_000 },
    );

    res.json({
      data: {
        durationMs: Date.now() - startedAt,
        ytdlp: {
          exitCode: ytdlp.exitCode,
          stdout: ytdlp.stdout,
          stderr: ytdlp.stderr,
        },
        ffprobe: {
          exitCode: ffp.exitCode,
          stdout: ffp.stdout,
          stderr: ffp.stderr,
        },
      },
    });
  } catch (err) {
    const e = err as Error;
    res.status(500).json({
      error: { code: "DOWNLOAD_RAW_ERROR", message: e.message, stack: e.stack },
    });
  }
});