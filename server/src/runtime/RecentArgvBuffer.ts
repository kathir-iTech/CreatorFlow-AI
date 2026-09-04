import { extractYoutubeVideoId } from "@/engines/downloader/BotCheckDetector.js";
import type { ProviderId } from "@/providers/types.js";

export type ArgvKind = "info" | "download";
export type ArgvResult = "ok" | "error";

export interface RecordedArgv {
  timestamp: string;
  kind: ArgvKind;
  attempt: "primary" | "android-fallback";
  providerId?: ProviderId;
  videoId?: string;
  url?: string;
  result: ArgvResult;
  exitCode?: number | null;
  durationMs?: number;
  errorCode?: string;
  argv: string[];
  extractorArgs?: string;
  formatArg?: string;
  cookiesPath?: string;
  proxyRedacted?: string;
  stderrTail?: string;
  stdoutTail?: string;
}

const SECRET_QUERY_KEYS = ["po_token", "visitor_data"];

function redactUrlCredentials(input: string): string {
  try {
    const u = new URL(input);
    if (u.username || u.password) {
      u.username = "***";
      u.password = "***";
    }
    return u.toString();
  } catch {
    return input;
  }
}

function redactProxy(value: string): string {
  return redactUrlCredentials(value);
}

function redactExtractorArgs(value: string): string {
  // youtube:player_client=...;po_token=XYZ;visitor_data=ABC -> redact those keys
  return value
    .split(";")
    .map((clause) => {
      const eq = clause.indexOf("=");
      if (eq < 0) return clause;
      const key = clause.slice(0, eq).trim().toLowerCase();
      if (SECRET_QUERY_KEYS.some((k) => key.endsWith(k))) {
        return `${clause.slice(0, eq)}=***`;
      }
      return clause;
    })
    .join(";");
}

export function redactArgv(argv: string[]): string[] {
  const out = argv.slice();
  for (let i = 0; i < out.length; i++) {
    const a = out[i];
    const next = out[i + 1];
    if (a === "--proxy" && next) {
      out[i + 1] = redactProxy(next);
      i++;
    } else if (a === "--extractor-args" && next) {
      out[i + 1] = redactExtractorArgs(next);
      i++;
    } else if (a === "--add-headers" && next) {
      // headers are non-secret in our pipeline; pass through
    } else if (/^https?:\/\//i.test(a)) {
      out[i] = redactUrlCredentials(a);
    }
  }
  return out;
}

function findFlag(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

class RingBuffer<T> {
  private items: T[] = [];
  constructor(private readonly capacity: number) {}
  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.capacity) this.items.shift();
  }
  list(): T[] {
    return this.items.slice().reverse();
  }
  clear(): void {
    this.items = [];
  }
}

const buffer = new RingBuffer<RecordedArgv>(5);

export interface RecordInput {
  kind: ArgvKind;
  attempt: "primary" | "android-fallback";
  providerId?: ProviderId;
  url?: string;
  argv: string[];
  result: ArgvResult;
  exitCode?: number | null;
  durationMs?: number;
  errorCode?: string;
  stderr?: string;
  stdout?: string;
}

export function recordArgv(input: RecordInput): void {
  const argv = redactArgv(input.argv);
  const tail = (s: string | undefined, n = 2000) =>
    s && s.length > 0 ? s.slice(-n) : undefined;
  buffer.push({
    timestamp: new Date().toISOString(),
    kind: input.kind,
    attempt: input.attempt,
    providerId: input.providerId,
    videoId:
      input.providerId === "youtube" && input.url
        ? extractYoutubeVideoId(input.url)
        : undefined,
    url: input.url ? redactUrlCredentials(input.url) : undefined,
    result: input.result,
    exitCode: input.exitCode ?? null,
    durationMs: input.durationMs,
    errorCode: input.errorCode,
    argv,
    extractorArgs: findFlag(argv, "--extractor-args"),
    formatArg: findFlag(argv, "-f"),
    cookiesPath: findFlag(argv, "--cookies"),
    proxyRedacted: findFlag(argv, "--proxy"),
    stderrTail: input.result === "error" ? tail(input.stderr) : undefined,
    // Always capture a stdout tail — on success it contains the
    // `[info] Downloading 1 format(s): <id>` line that proves which
    // format yt-dlp actually picked. Errors keep the larger 2000-char
    // tail; successes only need the last 500 chars.
    stdoutTail: tail(input.stdout, input.result === "error" ? 2000 : 500),
  });
}

export function listRecentArgv(): RecordedArgv[] {
  return buffer.list();
}

export function clearRecentArgv(): void {
  buffer.clear();
}