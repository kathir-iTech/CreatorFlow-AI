export type ProviderId = "youtube" | "instagram" | "facebook" | (string & {});

export interface MediaFormat {
  formatId: string;
  ext: string;
  quality?: string;
  resolution?: string;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  fps?: number;
  abr?: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

export interface MediaMetadata {
  providerId: ProviderId;
  id: string;
  title: string;
  description?: string;
  uploader?: string;
  durationSec?: number;
  thumbnail?: string;
  webpageUrl: string;
  formats: MediaFormat[];
  raw?: unknown;
}

export type RequestedKind = "video" | "audio";

export interface DownloadRequest {
  url: string;
  kind: RequestedKind;
  /** Optional explicit format id (from metadata.formats) */
  formatId?: string;
  /** Optional max video height (480, 720, 1080, etc) */
  maxHeight?: number;
  /** Audio format when kind=audio */
  audioFormat?: "mp3" | "m4a" | "opus" | "wav";
}

export interface DownloadPlan {
  providerId: ProviderId;
  url: string;
  format?: string;
  mergeOutputFormat?: "mp4" | "mkv" | "webm";
  extractAudio?: boolean;
  audioFormat?: string;
  audioQuality?: string;
  userAgent?: string;
  referer?: string;
  useCookies?: boolean;
  extraHeaders?: Record<string, string>;
  extraArgs?: string[];
  /** Diagnostic only — the height ceiling requested by the user. */
  requestedMaxHeight?: number;
}

export type RawMetadata = Record<string, unknown> & {
  id?: string;
  title?: string;
  description?: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
  webpage_url?: string;
  formats?: Array<{
    format_id?: string;
    ext?: string;
    height?: number;
    width?: number;
    fps?: number;
    vcodec?: string;
    acodec?: string;
    abr?: number;
    filesize?: number;
    filesize_approx?: number;
    format_note?: string;
    resolution?: string;
  }>;
};

export interface MediaProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly domains: readonly string[];
  /** Provider needs cookies.txt to access most content */
  readonly requiresCookies: boolean;

  supports(url: URL): boolean;
  fetchMetadata(url: string): Promise<MediaMetadata>;
  buildDownloadPlan(metadata: MediaMetadata, request: DownloadRequest): DownloadPlan;
}