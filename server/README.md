# MediaHub Pro — Backend

Standalone Node.js + Express + TypeScript service that downloads media from
YouTube, Instagram, and Facebook via `yt-dlp` and post-processes with `ffmpeg`.
This service is **independent of the Lovable frontend** — it can run on any
host with Node 20+, ffmpeg, and yt-dlp.

## Quick start (local)

```bash
cd backend
cp .env.example .env
npm install
# Make sure yt-dlp + ffmpeg + ffprobe are on PATH (or set *_PATH in .env, or drop binaries into ./bin)
npm run dev
# → http://localhost:8787
```

Check binary detection:

```bash
curl http://localhost:8787/system | jq .
```

If any binary is missing, the response describes how to install it.

## YouTube Compatibility Layer (BOT_CHECK)

YouTube occasionally responds with `"Sign in to confirm you're not a bot"`
(or a similarly worded anti-bot challenge) instead of returning the requested
media. This is an **external platform limitation**, not an application bug.

How this backend handles it:

- The `BotCheckDetector` (in `engines/downloader/BotCheckDetector.ts`) inspects
  every yt-dlp stderr/stdout line for the known YouTube anti-bot fingerprints.
- Detection is **YouTube-only** — Instagram and Facebook login walls are NOT
  reclassified as `BOT_CHECK` and keep their original error code.
- When the pattern matches, the engine throws `BotCheckError(...)` and the
  HTTP layer returns:

  ```http
  HTTP/1.1 422 Unprocessable Entity
  Content-Type: application/json

  {
    "data": null,
    "error": {
      "code": "BOT_CHECK",
      "message": "YouTube is temporarily requiring verification for this request.",
      "provider": "youtube",
      "retryable": true,
      "details": { "provider": "youtube", "retryable": true, "videoId": "<id>" }
    }
  }
  ```

  Never HTTP 500. Never a raw yt-dlp error.

- Cookies are used automatically: if `cookies.txt` exists at any of the
  detected paths (`$COOKIES_FILE`, `./cookies.txt`, `./tmp/cookies.txt`,
  `./bin/cookies.txt`), the YouTube provider passes `--cookies` to yt-dlp
  for both metadata and downloads. If `cookies.txt` is absent the request
  proceeds normally; if cookies are present but still fail the challenge,
  the error remains `BOT_CHECK` — surfaced to the client as an external
  YouTube limitation, not an application error.

- Async download jobs surface the same contract via `GET /api/v1/downloads/:id`:
  `status="failed"`, `errorCode="BOT_CHECK"`, `errorProvider="youtube"`,
  `errorRetryable=true`.

- Every failure logs structured fields: `provider`, `videoId`, `ytDlpVersion`,
  `cookiesLoaded`, `botCheck=true|false`, `code`, truncated `stderr`,
  and `durationMs`.

- Frontend guidance: show the friendly message
  *"YouTube is temporarily requiring verification for this video. Please try
  another video or try again later."* — never display raw yt-dlp output.

- Unit tests covering detection patterns and false-positive guards live in
  `test/unit/BotCheckDetector.test.ts`.

## Architecture

```
src/
├── server.ts / app.ts          Express bootstrap
├── config/                     Env (zod) + constants
├── routes/                     REST endpoints (info, downloads, stream, providers, health)
├── services/                   Orchestration (Info, Download, Cleanup)
├── providers/                  Per-platform isolation — Youtube, Instagram, Facebook
├── engines/
│   ├── downloader/             yt-dlp wrapper (args builder, progress parser, engine)
│   └── media/                  ffmpeg + ffprobe wrappers (convert, audio, thumbnail, merge)
├── jobs/                       In-memory queue + job store (Redis/BullMQ ready)
├── runtime/                    Binary detection (yt-dlp, ffmpeg, ffprobe)
├── security/                   URL validation, cookies.txt detection
├── middleware/                 requestId, error, rate limit, zod validate
├── logging/                    pino + pino-http
├── errors/                     Typed AppError / mapped codes
└── utils/                      tmp, hash, sanitize
```

Adding a new platform = one file under `providers/<name>/` + one
`providerRegistry.register(...)` line.

## REST API

All responses follow `{ data, error, requestId }`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/info` | `{ url }` → metadata + formats (cached 10 min) |
| `POST` | `/api/v1/downloads` | `{ url, kind, formatId?, maxHeight?, audioFormat? }` → `{ jobId }` |
| `GET`  | `/api/v1/downloads/:id` | Job snapshot |
| `GET`  | `/api/v1/downloads/:id/events` | **SSE** progress stream |
| `GET`  | `/api/v1/downloads/:id/file` | Stream the produced file, **deleted on completion** |
| `DELETE` | `/api/v1/downloads/:id` | Cancel queued/running job |
| `GET`  | `/api/v1/stream?url=&kind=` | Live yt-dlp → response pipe (no disk) |
| `GET`  | `/api/v1/providers` | List enabled providers |
| `GET`  | `/healthz` `/readyz` `/version` `/system` | Ops |

### Example

```bash
# 1. metadata
curl -X POST http://localhost:8787/api/v1/info \
  -H 'content-type: application/json' \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'

# 2. create job
JOB=$(curl -s -X POST http://localhost:8787/api/v1/downloads \
  -H 'content-type: application/json' \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","kind":"audio","audioFormat":"mp3"}' \
  | jq -r .data.jobId)

# 3. follow progress
curl -N http://localhost:8787/api/v1/downloads/$JOB/events

# 4. download file (auto-deletes server-side on completion)
curl -OJL http://localhost:8787/api/v1/downloads/$JOB/file
```

## Runtime requirements

- **Node.js** ≥ 20
- **yt-dlp** — `pip install -U yt-dlp` / `brew install yt-dlp` / `choco install yt-dlp` / drop binary in `./bin`
- **ffmpeg + ffprobe** — `apt install ffmpeg` / `brew install ffmpeg` / `choco install ffmpeg` / static build in `./bin`

The server **never auto-installs** these. On startup it logs detected paths
and versions. `/readyz` returns 503 until all three are resolvable.

## cookies.txt

Drop `cookies.txt` (Netscape format, exported from a logged-in browser) at
the project root, in `./tmp/`, or wherever `COOKIES_FILE` points. It is
auto-detected on boot and used **only** for providers that need auth
(Instagram, Facebook, sometimes YouTube). If absent the server runs normally;
anonymous-allowed downloads still work.

For Railway, set cookies through an environment variable instead of uploading a
file:

```bash
# from your local machine, in the folder containing cookies.txt
base64 -i cookies.txt | tr -d '\n'
```

Add the resulting value as `COOKIES_TXT_BASE64` in Railway Variables and
redeploy/restart the backend. `/system` should then report
`cookies.detected: true`. If Instagram/Facebook content needs authentication
and cookies are missing, the API returns HTTP 422 `COOKIES_REQUIRED` instead of
a generic `DOWNLOAD_FAILED`.

## Configuration (env)

See `.env.example`. Important keys:

- `PORT`, `HOST`, `NODE_ENV`, `LOG_LEVEL`
- `CORS_ORIGINS` — `*` or comma-separated
- `MAX_CONCURRENT_DOWNLOADS` — queue concurrency (default 5)
- `YTDLP_PATH`, `FFMPEG_PATH`, `FFPROBE_PATH` — explicit overrides
- `COOKIES_FILE` — explicit cookies.txt path
- `TMP_DIR`, `MAX_FILE_SIZE_MB`, `JOB_TIMEOUT_MS`
- `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`

## Logging

Structured pino JSON in prod, pretty in dev. Every entry includes
`requestId`. Download jobs log platform, provider id, full yt-dlp argv,
resolved ffmpeg path, whether cookies were loaded, stderr, stdout, and
execution time.

## Deployment

| Target | Recipe |
|---|---|
| Local | `npm install && npm run dev` |
| Docker | `docker compose -f deploy/docker/docker-compose.yml up --build` |
| Railway | Point to `deploy/railway/railway.json` (uses the Dockerfile) |
| Render | `deploy/render/render.yaml` |
| Replit | `deploy/replit/.replit` + `replit.nix` (nix provides ffmpeg + yt-dlp) |
| Oracle Linux VM | `sudo bash deploy/oracle/install.sh` then deploy build to `/opt/mediahub` and `systemctl start mediahub` |

`/readyz` is the standard health gate.

## Testing

```bash
npm test
```

Unit tests cover `ProviderRegistry`, `ProgressParser`, `YtDlpArgsBuilder`.
Integration + E2E tests (against a stubbed yt-dlp) belong in `test/integration`
and `test/e2e` and run in CI.

### Production smoke-test checklist (Phase 3)

Run these against the **deployed** API URL (not localhost):

- ✓ `POST /api/v1/info` with a YouTube URL → 200, formats present
- ✓ Download YouTube as MP4 (kind=video) → file delivered
- ✓ Download YouTube as MP3 (kind=audio, audioFormat=mp3) → file delivered
- ✓ `POST /api/v1/info` with an Instagram URL → 200, formats present
- ✓ Download Instagram as MP4 → file delivered
- ✓ Download Instagram as MP3 → file delivered

If YouTube returns `LOGIN_REQUIRED` / "confirm you're not a bot", that's an
**external platform limitation** (YouTube bot challenge), not a server bug —
supply `cookies.txt` exported from a logged-in browser to unblock.

## Roadmap hooks

- **Auth (Clerk / Supabase)** — drop a middleware into `src/middleware/auth.ts`
  and `app.use(authMiddleware)` before the API routes.
- **Redis / BullMQ queue** — implement `JobQueueAdapter` in
  `src/jobs/RedisJobQueue.ts` and swap the export in `JobQueue.ts`.
- **More providers** — add `src/providers/<name>/` and register in
  `ProviderRegistry.ts`. Zero edits elsewhere.
- **S3 storage** — add `src/storage/S3Storage.ts` implementing
  `StorageAdapter`; default remains tmp + immediate delete.