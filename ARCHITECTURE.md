# CreatorFlow AI — Architecture

One URL in, five outputs out: captions, SEO, thumbnails, schedule. This doc
explains **why** the system is shaped the way it is. For user-facing behavior
see `README.md`.

## Request flow

```
browser (Vercel static SPA)
  │  POST /api/v1/{info,captions,downloads,seo,thumbnails,channel-stats}
  ▼
Render API (Express, persistent process)
  ├─ /info, /captions(native), /seo ──► direct response (seconds)
  ├─ /downloads ──► JobStore + JobQueue ──► yt-dlp/ffmpeg subprocess
  │                      │                          │  (+ cookies.txt from env,
  │                      │                          │     PO-token sidecar, proxy)
  │                      ▼                          ▼
  │                 SSE /:id/events ◄── progress ── download file
  │                      │
  │                      ▼
  │                 GET /:id/file (streamed once, then deleted from disk)
  │
  └─ /captions(whisper fallback), /thumbnails ──► engine download ──► Groq API
                                                        (audio → Whisper,
                                                         transcript → LLM)
```

## Why two deployments (Vercel + Render)?

Constraint, not preference: **Vercel serverless functions cap at ~10–60s**
and are stateless. The download engine needs (a) a persistent process for the
in-memory job queue + SSE streams, (b) minutes-long yt-dlp/ffmpeg subprocess
runs, (c) temp-disk space for video files, (d) sidecar binaries installed via
Docker. Render's free web service provides all four; Vercel provides none.
So the frontend is static-only on Vercel and every byte of media work happens
on Render. `FRONTEND_ORIGIN` locks CORS to the Vercel URL in production.

## Why a job queue + SSE instead of one request/response?

A real video download takes 5s–3min depending on size, and free-tier cold
starts add up to 60s more. A single synchronous HTTP cycle is a poor fit:
timeouts at every layer (CDN, client, server) and zero progress feedback.
The queue pattern (`POST /downloads` → `202 {jobId}` → SSE/poll → `GET /file`)
lets the frontend show **real-time progress** and lets the file be streamed
exactly once, then deleted — the server never accumulates media.

## Why three caption paths instead of straight to Whisper?

Cost and speed, in that order:

1. **Native timedtext** (`video.google.com/timedtext` + watch-page
   `captionTracks`) — free, ~1s. Covers most captioned videos.
2. **yt-dlp subtitle dump** (`--write-sub --write-auto-sub`) — free, ~10-60s.
   Catches cases where datacenter-IP fetches are blocked but yt-dlp (with
   cookies + PO-token helper) still succeeds.
3. **Groq Whisper** (`whisper-large-v3-turbo` on downloaded audio) — metered
   and slow (full audio download + 25MB cap). Last resort only.

Each failure produces a **distinct error code** (`WHISPER_UNAVAILABLE`,
`AUDIO_DOWNLOAD_FAILED`, `WHISPER_FAILED`, `NO_SPEECH`) so the UI can tell
the user what actually happened instead of "both paths failed".

## Why cookies via base64 env var, never a file?

`COOKIES_TXT_BASE64` holds a live YouTube session. Committing it — even once,
even gitignored later — would burn it into git history forever, leaking
account access to anyone with repo access the moment the repo goes public.
Env-only means the secret exists in exactly one place (the Render dashboard)
and can be rotated without a code change. `/api/v1/debug/*` endpoints only
ever report cookie *presence/length*, never values, and are token-gated.

## Why `style-src 'unsafe-inline'` in the CSP?

Radix UI primitives (Slider thumb, Select, Dialog positioning, chart
tooltips) set inline `style` attributes at runtime — there is no build step
that can externalize them. Removing `'unsafe-inline'` from `style-src` breaks
interaction visibly. `script-src` stays strict (`'self'`, no inline) because
the Vite build emits zero inline scripts — verified against `dist/index.html`.
This is the minimum workable policy, not a blanket allowance.

## Debugging notes (postmortems worth keeping)

- **React 19 URL-input freeze.** The root shell rendered `<html>/<head>/<body>`
  singletons client-side; React 19's client renderer desyncs from the DOM when
  it owns document singletons, freezing controlled inputs. Fix: shell renders
  only `HeadContent + children + Scripts` (no document singletons). Lesson:
  never own document singletons in a client-rendered tree on React 19.
- **Timedtext dead from datacenters.** Direct `timedtext` fetches started
  failing from cloud IPs (IP-reputation wall) while working locally — looked
  like "no captions exist". Fix: the yt-dlp subtitle-dump middle path, which
  carries cookies + browser fingerprint. Lesson: verify "not found" against a
  second path before believing it.
- **recharts + React 19.** `recharts@2` peer-depends `react-is@^16/17/18`;
  under React 19 charts silently broke. Fix: `overrides: {react-is: $react-is}`
  pinned to 19 + code-split `ScheduleTab` so charts load on demand.
- **Groq retired `llama-3.3-70b-versatile` (2026-08-16).** SEO returned 404
  overnight with no code change. Fix: `openai/gpt-oss-120b` (Groq's
  recommended replacement), overridable via `GROQ_SEO_MODEL` so the next
  rotation is a config change, not a deploy. Lesson: pin nothing you don't
  control; make model IDs env-configurable.
- **ThumbnailService called the engine with the wrong shape** (`{url, kind}`
  vs `{plan, workDir, jobId}`) — every request 500'd. `tsup` doesn't
  typecheck, so it shipped. Lesson: run `tsc --noEmit` in CI even when the
  bundler doesn't.
