/**
 * MediaHub Pro — thin REST client for the backend.
 * The frontend NEVER executes yt-dlp. All work is delegated to the API.
 */

const RAW_BASE =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE_URL) ||
  "http://localhost:8787";

export const API_BASE_URL: string = String(RAW_BASE).replace(/\/+$/, "");

export type ApiError = {
  code: string;
  message: string;
  provider?: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
};

export class ApiClientError extends Error {
  status: number;
  code: string;
  provider?: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
  constructor(status: number, err: ApiError) {
    super(err.message || "Request failed");
    this.status = status;
    this.code = err.code || "UNKNOWN";
    this.provider = err.provider;
    this.retryable = err.retryable;
    this.details = err.details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (e) {
    throw new ApiClientError(0, {
      code: "NETWORK",
      message: "Cannot reach the MediaHub API. Check your connection or backend URL.",
    });
  }
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON
  }
  if (!res.ok) {
    const err: ApiError = (body && body.error) || {
      code: `HTTP_${res.status}`,
      message: `Request failed (${res.status})`,
    };
    throw new ApiClientError(res.status, err);
  }
  return (body?.data ?? body) as T;
}

// ---------------- Types mirroring the backend contract ----------------

export type MediaFormat = {
  formatId?: string;
  ext?: string;
  quality?: string;
  height?: number;
  width?: number;
  fps?: number;
  filesize?: number;
  vcodec?: string;
  acodec?: string;
  abr?: number;
  tbr?: number;
  note?: string;
};

export type Metadata = {
  providerId: string;
  id: string;
  title: string;
  description?: string;
  uploader?: string;
  durationSec?: number;
  webpageUrl?: string;
  thumbnail?: string;
  thumbnails?: { url: string; width?: number; height?: number }[];
  formats?: MediaFormat[];
  uploadDate?: string;
  viewCount?: number;
};

export type InfoResponse = {
  providerId: string;
  cached: boolean;
  metadata: Metadata;
};

export type DownloadKind = "video" | "audio";

export type CreateDownloadRequest = {
  url: string;
  kind?: DownloadKind;
  formatId?: string;
  maxHeight?: number;
  audioFormat?: "mp3" | "m4a" | "opus" | "wav";
};

export type JobStatus = "pending" | "queued" | "running" | "succeeded" | "failed" | "canceled";

export type Job = {
  id: string;
  status: JobStatus;
  percent: number;
  message?: string;
  providerId?: string;
  url?: string;
  filename?: string;
  filePath?: string;
  errorCode?: string;
  errorMessage?: string;
  errorProvider?: string;
  errorRetryable?: boolean;
  createdAt?: number;
  updatedAt?: number;
};

export type SystemReport = {
  youtubeHardening?: boolean;
  binaries?: {
    ytDlp?: { path?: string; version?: string; ok: boolean; error?: string };
    ffmpeg?: { path?: string; version?: string; ok: boolean; error?: string };
    ffprobe?: { path?: string; version?: string; ok: boolean; error?: string };
  };
  cookies?: {
    found?: boolean;
    detected?: boolean;
    path?: string | null;
    canary?: CookieCanaryResult;
  };
  providers?: { id: string; displayName: string; requiresCookies?: boolean }[];
  env?: Record<string, unknown>;
  [k: string]: unknown;
};

export type CookieCanaryStatus = "ok" | "bot_check" | "stale" | "no_cookies" | "error" | "unknown";

export type CookieCanaryResult = {
  status: CookieCanaryStatus;
  checkedAt: string | null;
  nextCheckAt: string | null;
  message: string;
  durationMs: number | null;
  url: string;
};

export type Provider = {
  id: string;
  displayName: string;
  domains: string[];
  requiresCookies?: boolean;
};

export type CaptionSegment = {
  start: number;
  end: number;
  text: string;
};

export type CaptionsResult = {
  videoId?: string;
  providerId: string;
  source: "native" | "whisper";
  language?: string;
  isAuto?: boolean;
  captions: CaptionSegment[];
  srt: string;
  vtt: string;
};

export type SeoChapter = {
  time: string;
  label: string;
};

export type SeoResult = {
  titles: string[];
  description: string;
  tags: string[];
  chapters: SeoChapter[];
};

export type ThumbnailFrame = {
  index: number;
  timeSec: number;
  base64: string;
  mime: string;
};

export type ThumbnailsResult = {
  videoId: string;
  frames: ThumbnailFrame[];
  capped: boolean;
  durationSec: number;
};

export type ChannelStatsVideo = {
  title: string;
  views: number;
  likes: number;
  comments: number;
  publishedAt: string;
};

export type SuggestedSlot = {
  day: string;
  hour: number;
  score: number;
};

export type ChannelStats = {
  channelName: string;
  subscribers: number;
  totalViews: number;
  totalVideos: number;
  avgViewsPerVideo: number;
  recentVideos: ChannelStatsVideo[];
  viewsOverTime: { date: string; views: number }[];
  suggestedSlots?: SuggestedSlot[];
  demo: boolean;
  channelId?: string;
  fetchedAt?: string;
};

// ---------------- Calls ----------------

export const api = {
  info: (url: string) =>
    request<InfoResponse>("/api/v1/info", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),

  createDownload: async (req: CreateDownloadRequest): Promise<Job> => {
    // Backend responds with `{ data: { jobId } }`; normalize to a Job-shaped object
    // so the rest of the app (polling, history, UI) can rely on `.id`.
    const r = await request<{ jobId?: string; id?: string } & Partial<Job>>("/api/v1/downloads", {
      method: "POST",
      body: JSON.stringify(req),
    });
    const id = r.id ?? r.jobId;
    if (!id) {
      throw new ApiClientError(500, {
        code: "BAD_RESPONSE",
        message: "Server did not return a job id.",
      });
    }
    return { ...(r as Job), id, status: r.status ?? "queued", percent: r.percent ?? 0 };
  },

  getJob: (id: string) => request<Job>(`/api/v1/downloads/${id}`),

  cancelJob: (id: string) =>
    request<{ canceled: boolean }>(`/api/v1/downloads/${id}`, { method: "DELETE" }),

  fileUrl: (id: string) => `${API_BASE_URL}/api/v1/downloads/${id}/file`,

  streamUrl: (params: CreateDownloadRequest) => {
    const u = new URL(`${API_BASE_URL}/api/v1/stream`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    });
    return u.toString();
  },

  providers: () => request<Provider[]>("/api/v1/providers"),

  captions: (url: string, lang = "en") =>
    request<CaptionsResult>("/api/v1/captions", {
      method: "POST",
      body: JSON.stringify({ url, lang }),
    }),

  seo: (transcript: string, videoTitle?: string) =>
    request<SeoResult>("/api/v1/seo", {
      method: "POST",
      body: JSON.stringify({ transcript, videoTitle }),
    }),

  thumbnails: (url: string) =>
    request<ThumbnailsResult>("/api/v1/thumbnails", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),

  channelStats: (channel?: string) => {
    const qs = channel?.trim() ? `?channel=${encodeURIComponent(channel.trim())}` : "";
    return request<ChannelStats>(`/api/v1/channel-stats${qs}`);
  },

  health: async () => {
    const r = await fetch(`${API_BASE_URL}/healthz`).catch(() => null);
    return r?.ok ? ((await r.json()) as { status: string; uptime?: number }) : null;
  },

  ready: async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/readyz`);
      const body = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, ...body };
    } catch {
      return { ok: false, status: 0, error: "unreachable" };
    }
  },

  version: () =>
    fetch(`${API_BASE_URL}/version`)
      .then((r) => r.json())
      .catch(() => null),

  system: () =>
    fetch(`${API_BASE_URL}/system`)
      .then((r) => r.json())
      .then((b) => b?.data as SystemReport)
      .catch(() => null),

  recheckCookies: async (): Promise<CookieCanaryResult | null> => {
    try {
      const r = await fetch(`${API_BASE_URL}/system/cookies/recheck`, { method: "POST" });
      const b = await r.json().catch(() => ({}));
      return (b?.data as CookieCanaryResult) ?? null;
    } catch {
      return null;
    }
  },
};

/** Map any error into a user-safe message. Never leak raw yt-dlp output. */
export function friendlyError(e: unknown): {
  title: string;
  message: string;
  code: string;
  retryable: boolean;
} {
  if (e instanceof ApiClientError) {
    if (e.code === "BOT_CHECK") {
      return {
        title: "YouTube blocked this request",
        message: e.message || "YouTube blocked this request. Retrying with fallback...",
        code: e.code,
        retryable: true,
      };
    }
    if (e.code === "COOKIES_REQUIRED") {
      return {
        title: "Cookies required",
        message:
          "This source requires a cookies.txt file on the backend. Add it to the Railway backend environment, then try again.",
        code: e.code,
        retryable: true,
      };
    }
    if (e.code === "NETWORK") {
      return {
        title: "Can't reach the API",
        message: e.message,
        code: e.code,
        retryable: true,
      };
    }
    if (e.code === "VALIDATION_ERROR" || e.code === "INVALID_URL") {
      return {
        title: "Invalid link",
        message: "That URL doesn't look right. Paste a YouTube, Instagram, or Facebook link.",
        code: e.code,
        retryable: false,
      };
    }
    if (e.code === "UNSUPPORTED_PROVIDER") {
      return {
        title: "Unsupported source",
        message: "We don't support that website yet.",
        code: e.code,
        retryable: false,
      };
    }
    if (e.code === "RATE_LIMITED") {
      return {
        title: "Slow down",
        message: "You're sending requests too quickly. Wait a moment and try again.",
        code: e.code,
        retryable: true,
      };
    }
    if (e.code === "NOT_READY") {
      return {
        title: "Almost ready",
        message: "Your download isn't ready yet — wait for it to finish.",
        code: e.code,
        retryable: true,
      };
    }
    if (e.code === "DOWNLOAD_FAILED") {
      return {
        title: "Download failed",
        message:
          "We couldn't fetch that media. The source may be private, removed, or region-locked.",
        code: e.code,
        retryable: true,
      };
    }
    if (e.code === "WHISPER_UNAVAILABLE") {
      return {
        title: "No captions + no AI fallback",
        message: "This video has no captions, and AI transcription isn't configured on the server.",
        code: e.code,
        retryable: false,
      };
    }
    if (e.code === "WHISPER_FAILED") {
      return {
        title: "Transcription failed",
        message: e.message || "The AI transcription service failed. Try again in a moment.",
        code: e.code,
        retryable: true,
      };
    }
    if (e.code === "AUDIO_DOWNLOAD_FAILED") {
      return {
        title: "Audio unavailable",
        message:
          e.message ||
          "Couldn't download this video's audio. It may be private, age-restricted, or a live stream.",
        code: e.code,
        retryable: true,
      };
    }
    if (e.code === "NO_SPEECH") {
      return {
        title: "No speech detected",
        message: "No spoken words detected in this video — the audio may be music-only.",
        code: e.code,
        retryable: false,
      };
    }
    return {
      title: "Something went wrong",
      message: "Please try again in a moment.",
      code: e.code,
      retryable: e.retryable ?? true,
    };
  }
  return {
    title: "Unexpected error",
    message: "Please try again in a moment.",
    code: "UNKNOWN",
    retryable: true,
  };
}
