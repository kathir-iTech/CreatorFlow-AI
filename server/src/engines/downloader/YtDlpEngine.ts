import { execa, type ResultPromise } from "execa";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { resolveBinaries } from "@/runtime/BinaryResolver.js";
import { getCookiesPathFor } from "@/security/CookiesDetector.js";
import { addYoutubeBotFallbackArgs, buildYtDlpArgs, buildMetadataArgs } from "./YtDlpArgsBuilder.js";
import { parseProgressLine, type ProgressEvent } from "./ProgressParser.js";
import { logger } from "@/logging/logger.js";
import { AppError, BotCheckError, CookiesRequiredError, ProviderError } from "@/errors/AppError.js";
import type { DownloadPlan, ProviderId, RawMetadata } from "@/providers/types.js";
import { env } from "@/config/env.js";
import { detectYoutubeBotCheck, extractYoutubeVideoId } from "./BotCheckDetector.js";
import { recordArgv } from "@/runtime/RecentArgvBuffer.js";

const ytDlpExecutionEnv = { ...process.env };

export interface DownloadOptions {
  plan: DownloadPlan;
  workDir: string;
  jobId: string;
  onEvent?: (event: ProgressEvent) => void;
  signal?: AbortSignal;
}

export interface DownloadResult {
  filePath: string;
  durationMs: number;
  command: string[];
}

function mapYtDlpError(
  output: string,
  ctx: { providerId?: ProviderId; url?: string; cookiesDetected?: boolean } = {},
): AppError {
  // 1. YouTube anti-bot challenge — return structured BOT_CHECK (HTTP 422).
  //    Do NOT collapse into LOGIN_REQUIRED or INTERNAL_ERROR.
  const bot = detectYoutubeBotCheck(output, ctx.providerId);
  if (bot.isBotCheck) {
    const videoId = ctx.url ? extractYoutubeVideoId(ctx.url) : undefined;
    return BotCheckError("youtube", { videoId, retryable: true });
  }

  const s = output.toLowerCase();
  const cookiesRequiredProvider = ctx.providerId === "instagram" || ctx.providerId === "facebook";
  const authCookieHint =
    s.includes("--cookies") ||
    s.includes("cookies-from-browser") ||
    s.includes("login required") ||
    s.includes("please sign in") ||
    s.includes("logged-in") ||
    s.includes("private") ||
    s.includes("authentication") ||
    s.includes("empty media response");
  if (!ctx.cookiesDetected && cookiesRequiredProvider && authCookieHint) {
    const provider = ctx.providerId ?? "provider";
    return CookiesRequiredError(
      provider,
      `${provider === "instagram" ? "Instagram" : "Facebook"} requires cookies.txt for this content. Add cookies.txt to the backend environment and retry.`,
    );
  }

  if (s.includes("age") && s.includes("restrict")) {
    return ProviderError("Content is age-restricted. Provide cookies.txt.", "AGE_RESTRICTED");
  }
  if (s.includes("private video") || s.includes("login required") || s.includes("requested format is not available") && s.includes("login")) {
    return ProviderError("Private content. Login (cookies.txt) required.", "PRIVATE_CONTENT");
  }
  if (s.includes("geo")) {
    return ProviderError("Content is geo-blocked in this region.", "GEO_BLOCKED");
  }
  if (s.includes("unsupported url")) {
    return ProviderError("yt-dlp does not support this URL.", "UNSUPPORTED_URL");
  }
  if (s.includes("http error 429")) {
    return ProviderError("Upstream rate-limited the request.", "RATE_LIMITED");
  }
  if (s.includes("http error 404")) {
    return ProviderError("Upstream returned 404 — content may be removed.", "NOT_FOUND");
  }
  // yt-dlp sometimes exits non-zero with empty stdout/stderr (killed early,
  // bot-blocked before any log line, age-gate with no detail). Never surface
  // "yt-dlp failed: null" — name the provider and the likely causes instead.
  const lastLine = output.split("\n").map((l) => l.trim()).filter(Boolean).pop();
  if (!lastLine) {
    const who = ctx.providerId ? ` ${ctx.providerId}` : "";
    return ProviderError(
      `Video info fetch${who} failed with no detail from yt-dlp — the video may be private, removed, region-locked, or behind YouTube's bot check.`,
      "DOWNLOAD_FAILED",
    );
  }
  return ProviderError(`yt-dlp failed: ${lastLine}`.slice(0, 500), "DOWNLOAD_FAILED");
}

export class YtDlpEngine {
  async fetchMetadata(
    url: string,
    useCookies: boolean,
    providerId?: ProviderId,
  ): Promise<RawMetadata> {
    const { ytDlp } = await resolveBinaries();
    const cookies = getCookiesPathFor(providerId);
    const args = buildMetadataArgs(url, cookies, useCookies, providerId);
    const start = Date.now();
    const cookiesLoaded = !!(cookies && useCookies);
    logger.info(
      {
        provider: providerId,
        binary: ytDlp.path,
        ytDlpVersion: ytDlp.version,
        cookiesLoaded,
        videoId: providerId === "youtube" ? extractYoutubeVideoId(url) : undefined,
        command: ["yt-dlp", ...args],
      },
      "yt-dlp metadata fetch",
    );
    try {
      const { stdout, stderr } = await execa(ytDlp.path, args, { timeout: 60_000, reject: true, env: ytDlpExecutionEnv });
      logger.debug(
        { durationMs: Date.now() - start, stderr: stderr?.slice(0, 500) },
        "yt-dlp metadata done",
      );
      recordArgv({
        kind: "info",
        attempt: "primary",
        providerId,
        url,
        argv: args,
        result: "ok",
        exitCode: 0,
        durationMs: Date.now() - start,
        stdout,
        stderr,
      });
      return JSON.parse(stdout) as RawMetadata;
    } catch (err) {
      const execaErr = err as { stderr?: string; stdout?: string; message?: string };
      const stderr = execaErr.stderr ?? execaErr.message ?? "";
      const output = [execaErr.stdout, execaErr.stderr, execaErr.message].filter(Boolean).join("\n");
      let mapped = mapYtDlpError(output, { providerId, url, cookiesDetected: cookiesLoaded });
      recordArgv({
        kind: "info",
        attempt: "primary",
        providerId,
        url,
        argv: args,
        result: "error",
        errorCode: mapped.code,
        durationMs: Date.now() - start,
        stderr: execaErr.stderr ?? execaErr.message,
        stdout: execaErr.stdout,
      });
      if (mapped.code === "BOT_CHECK") {
        const fallbackArgs = addYoutubeBotFallbackArgs(args);
        logger.warn(
          {
            provider: providerId,
            ytDlpVersion: ytDlp.version,
            cookiesLoaded,
            videoId: providerId === "youtube" ? extractYoutubeVideoId(url) : undefined,
            command: ["yt-dlp", ...fallbackArgs],
          },
          "yt-dlp metadata bot block; retrying with android fallback",
        );
        try {
          const { stdout, stderr: fallbackStderr } = await execa(ytDlp.path, fallbackArgs, { timeout: 60_000, reject: true, env: ytDlpExecutionEnv });
          logger.debug(
            { durationMs: Date.now() - start, stderr: fallbackStderr?.slice(0, 500), fallback: true },
            "yt-dlp metadata fallback done",
          );
          recordArgv({
            kind: "info",
            attempt: "android-fallback",
            providerId,
            url,
            argv: fallbackArgs,
            result: "ok",
            exitCode: 0,
            durationMs: Date.now() - start,
            stdout,
            stderr: fallbackStderr,
          });
          return JSON.parse(stdout) as RawMetadata;
        } catch (fallbackErr) {
          const fallbackExecaErr = fallbackErr as { stderr?: string; stdout?: string; message?: string };
          const fallbackOutput = [fallbackExecaErr.stdout, fallbackExecaErr.stderr, fallbackExecaErr.message]
            .filter(Boolean)
            .join("\n");
          mapped = mapYtDlpError(fallbackOutput, { providerId, url, cookiesDetected: cookiesLoaded });
          recordArgv({
            kind: "info",
            attempt: "android-fallback",
            providerId,
            url,
            argv: fallbackArgs,
            result: "error",
            errorCode: mapped.code,
            durationMs: Date.now() - start,
            stderr: fallbackExecaErr.stderr ?? fallbackExecaErr.message,
            stdout: fallbackExecaErr.stdout,
          });
        }
      }
      logger.warn(
        {
          provider: providerId,
          ytDlpVersion: ytDlp.version,
          cookiesLoaded,
          videoId: providerId === "youtube" ? extractYoutubeVideoId(url) : undefined,
          botCheck: mapped.code === "BOT_CHECK",
          code: mapped.code,
          stderr: stderr?.slice(0, 1000),
          durationMs: Date.now() - start,
        },
        "yt-dlp metadata failed",
      );
      throw mapped;
    }
  }

  async download(opts: DownloadOptions): Promise<DownloadResult> {
    const { plan, workDir, jobId, onEvent, signal } = opts;
    const { ytDlp } = await resolveBinaries();
    const cookies = getCookiesPathFor(plan.providerId);
    const cookiesLoaded = !!(cookies && plan.useCookies);
    const outputTemplate = path.join(workDir, "%(title).180B [%(id)s].%(ext)s");
    const args = buildYtDlpArgs({ plan, outputTemplate, cookiesPath: cookies });

    const start = Date.now();
    logger.info(
      {
        jobId,
        provider: plan.providerId,
        videoId: plan.providerId === "youtube" ? extractYoutubeVideoId(plan.url) : undefined,
        binary: ytDlp.path,
        ytDlpVersion: ytDlp.version,
        cookiesLoaded,
        formatSelector: plan.format,
        mergeOutputFormat: plan.mergeOutputFormat,
        extractAudio: !!plan.extractAudio,
        audioFormat: plan.audioFormat,
        command: ["yt-dlp", ...args],
      },
      "yt-dlp download start",
    );

    // Explicit pre-exec audit so we can verify in Railway logs that BOTH
    // -f <selector> AND --cookies <path> are present in the same argv,
    // and that -f actually changes when the user picks a different quality.
    const fIdx = args.indexOf("-f");
    const cIdx = args.indexOf("--cookies");
    const eIdx = args.indexOf("--extractor-args");
    logger.info(
      {
        jobId,
        provider: plan.providerId,
        requestedMaxHeight: plan.requestedMaxHeight ?? null,
        hasFormatFlag: fIdx >= 0,
        formatArg: fIdx >= 0 ? args[fIdx + 1] : null,
        hasCookiesFlag: cIdx >= 0,
        cookiesAttached: cIdx >= 0,
        cookiesArg: cIdx >= 0 ? args[cIdx + 1] : null,
        extractorArgs: eIdx >= 0 ? args[eIdx + 1] : null,
        argv: args,
      },
      "yt-dlp final argv",
    );

    const runAttempt = async (attemptArgs: string[], attempt: "primary" | "android-fallback") => {
      const subprocess: ResultPromise = execa(ytDlp.path, attemptArgs, {
        cwd: workDir,
        timeout: env.JOB_TIMEOUT_MS,
        buffer: false,
        reject: false,
        cancelSignal: signal,
        env: ytDlpExecutionEnv,
      });

      const stderrChunks: string[] = [];
      const outputChunks: string[] = [];
      const attach = (stream: NodeJS.ReadableStream | null, isErr: boolean) => {
        if (!stream) return;
        let buf = "";
        stream.setEncoding?.("utf8");
        stream.on("data", (chunk: string) => {
          buf += chunk;
          let idx;
          while ((idx = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, idx);
            buf = buf.slice(idx + 1);
            if (isErr) stderrChunks.push(line);
            outputChunks.push(line);
            const ev = parseProgressLine(line);
            if (ev && onEvent) onEvent(ev);
          }
        });
      };
      attach(subprocess.stdout, false);
      attach(subprocess.stderr, true);

      const result = await subprocess;
      return {
        attempt,
        args: attemptArgs,
        exitCode: result.exitCode,
        stderr: stderrChunks.join("\n"),
        output: outputChunks.join("\n") || stderrChunks.join("\n"),
      };
    };

    let activeArgs = args;
    let attempt = await runAttempt(args, "primary");
    const durationMs = Date.now() - start;

    if (attempt.exitCode !== 0) {
      let mapped = mapYtDlpError(attempt.output, { providerId: plan.providerId, url: plan.url, cookiesDetected: cookiesLoaded });
      recordArgv({
        kind: "download",
        attempt: "primary",
        providerId: plan.providerId,
        url: plan.url,
        argv: args,
        result: "error",
        exitCode: attempt.exitCode,
        durationMs,
        errorCode: mapped.code,
        stderr: attempt.stderr,
        stdout: attempt.output,
      });
      if (mapped.code === "BOT_CHECK") {
        const fallbackArgs = addYoutubeBotFallbackArgs(args);
        logger.warn(
          {
            jobId,
            provider: plan.providerId,
            requestedMaxHeight: plan.requestedMaxHeight ?? null,
            formatArg: args[args.indexOf("-f") + 1] ?? null,
            command: ["yt-dlp", ...fallbackArgs],
          },
          "yt-dlp download bot block; retrying with android fallback",
        );
        activeArgs = fallbackArgs;
        attempt = await runAttempt(fallbackArgs, "android-fallback");
        if (attempt.exitCode !== 0) {
          mapped = mapYtDlpError(attempt.output, { providerId: plan.providerId, url: plan.url, cookiesDetected: cookiesLoaded });
          recordArgv({
            kind: "download",
            attempt: "android-fallback",
            providerId: plan.providerId,
            url: plan.url,
            argv: fallbackArgs,
            result: "error",
            exitCode: attempt.exitCode,
            durationMs: Date.now() - start,
            errorCode: mapped.code,
            stderr: attempt.stderr,
            stdout: attempt.output,
          });
        } else {
          recordArgv({
            kind: "download",
            attempt: "android-fallback",
            providerId: plan.providerId,
            url: plan.url,
            argv: fallbackArgs,
            result: "ok",
            exitCode: 0,
            durationMs: Date.now() - start,
            stdout: attempt.output,
            stderr: attempt.stderr,
          });
        }
      }
    }
    else {
      recordArgv({
        kind: "download",
        attempt: "primary",
        providerId: plan.providerId,
        url: plan.url,
        argv: args,
        result: "ok",
        exitCode: 0,
        durationMs,
        stdout: attempt.output,
        stderr: attempt.stderr,
      });
    }

    if (attempt.exitCode !== 0) {
      const mapped = mapYtDlpError(attempt.output, { providerId: plan.providerId, url: plan.url, cookiesDetected: cookiesLoaded });
      logger.error(
        {
          jobId,
          provider: plan.providerId,
          videoId: plan.providerId === "youtube" ? extractYoutubeVideoId(plan.url) : undefined,
          ytDlpVersion: ytDlp.version,
          cookiesLoaded,
          botCheck: mapped.code === "BOT_CHECK",
          code: mapped.code,
          exitCode: attempt.exitCode,
          attempt: attempt.attempt,
          stderr: attempt.stderr.slice(0, 2000),
          durationMs: Date.now() - start,
        },
        "yt-dlp failed",
      );
      throw mapped;
    }

    // Find the produced file (largest in workDir matching expected ext)
    const files = await readdir(workDir);
    if (files.length === 0) {
      throw ProviderError("yt-dlp produced no output file", "DOWNLOAD_FAILED");
    }
    // Prefer audio file if extractAudio, otherwise newest non-part file
    const final = files
      .filter((f) => !f.endsWith(".part") && !f.endsWith(".ytdl"))
      .sort()
      .pop();
    if (!final) throw ProviderError("yt-dlp produced no final file", "DOWNLOAD_FAILED");

    const filePath = path.join(workDir, final);
    logger.info({ jobId, filePath, durationMs }, "yt-dlp download complete");
    return { filePath, durationMs: Date.now() - start, command: ["yt-dlp", ...activeArgs] };
  }
}

export const ytDlpEngine = new YtDlpEngine();