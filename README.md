# CreatorFlow AI

**Paste one YouTube link, get captions, SEO, thumbnails, and a posting schedule —
the whole pre-publish workflow automated in one pipeline.**

## The problem

A creator finishing a video faces the same fragmented grind every upload:
pull a transcript from one tool, draft titles/descriptions/tags in another,
screenshot or design a thumbnail in a third, then guess at a posting time from
a fourth. Each handoff is copy-paste busywork, and most of the tools charge
separate subscriptions for what is really one workflow: *turn a finished video
into a published, discoverable post.*

## How it works

One URL drives a five-step pipeline in a single Studio page:

1. **Fetch** — paste any YouTube link (`watch`, `youtu.be` short links
   including `?si=` share parameters, Shorts, embeds, mobile links). The
   backend normalizes it to a canonical video ID, then `yt-dlp` resolves
   metadata and formats through a provider abstraction (YouTube today,
   Instagram/Facebook partially).
2. **Captions** — three ordered paths: free native YouTube captions first,
   then a `yt-dlp` subtitle dump, then Groq Whisper transcription as a last
   resort. The transcript is editable in-line and exports to `.srt` / `.vtt` /
   `.txt`. Each failure mode returns a distinct, honest error (no captions +
   no AI key configured, audio undownloadable, transcription API failed, or
   genuinely no speech detected).
3. **SEO** — the transcript feeds a Groq LLM (`openai/gpt-oss-120b`,
   overridable via `GROQ_SEO_MODEL`) that returns 5 title options, a
   keyword-rich description, tags, and chapters. Everything is editable and
   one-click copyable.
4. **Thumbnail** — the backend downloads a lightweight copy and extracts 6
   evenly-spaced keyframes with `ffmpeg` (capped to the first 2 minutes for
   long videos). Pick a frame, add styled overlay text, drag it (or nudge it
   with arrow keys), export a PNG with the overlay baked in.
5. **Schedule** — plan posts against a best-time-to-post heuristic table per
   content category, persisted in `localStorage`, alongside channel
   performance charts.

## Tech stack (zero-cost by design)

- **Frontend (Vercel):** React 19, TanStack Router + Query, Tailwind CSS v4,
  shadcn/Radix primitives, `recharts` (code-split — loads only on the Plan tab)
- **Backend (Render free tier, Docker):** Node 20 + Express, in-memory job
  queue with SSE progress, `yt-dlp` + `ffmpeg` subprocess engine, `pino`
  structured logging
- **AI (Groq free tier, one key):** Whisper `whisper-large-v3-turbo` fallback
  transcription + LLM SEO generation

Total running cost: **$0** — Render free web service, Vercel hobby, Groq free
tier. Built solo, no budget; the upgrade path (paid Render/Groq tiers, same
platforms, same code) is straightforward when traffic outgrows free limits.
See `ARCHITECTURE.md` for why the system is split and shaped this way.

## Setup

**Backend** (`./server`):

```bash
cd server
npm install
cp .env.example .env   # fill in GROQ_API_KEY + COOKIES_TXT_BASE64
npm run dev            # http://localhost:8787
```

Required env: `GROQ_API_KEY` (Whisper + SEO), `COOKIES_TXT_BASE64` (single-line
base64 of a Netscape `cookies.txt` — keeps age-gated/bot-checked videos
working), `FRONTEND_ORIGIN` (production CORS lock). Full list with comments in
`server/.env.example`.

**Frontend** (repo root):

```bash
npm install
# .env: VITE_API_BASE_URL=http://localhost:8787  (local) or the Render URL (prod)
npm run dev            # http://localhost:5173
```

Tests: `npm run --prefix server test` (vitest, 60+ unit tests),
`npx tsc --noEmit` both sides.

## Live demo

- App: https://creatorflowai-two.vercel.app
- API: https://creatorflow-ai-backend-lin3.onrender.com (`/healthz`, `/version`)
- 90-second demo script: [`DEMO.md`](./DEMO.md)

<!-- Screenshots: capture the five tabs with real content from the live site
     into docs/screenshots/ and reference them here before submitting. -->

## Future scope (vision, not built)

1. **Real YouTube Analytics integration.** The Schedule tab currently runs on a
   static best-time heuristic plus demo channel data. With YouTube Data API v3
   OAuth, it could pull per-channel view counts, audience retention, and
   traffic sources, making "best time to post" genuinely data-driven per
   channel. The stats UI (cards + views-over-time + recent-videos charts) is
   already shaped for real series — only the data source needs swapping.
2. **Multi-platform expansion.** The backend already abstracts a `Provider`
   (`supports()` + `fetchMetadata()` + `buildDownloadPlan()`); YouTube,
   Instagram, and Facebook are registered in one place. TikTok, Reels-native
   flows, and audio-only podcast pipelines slot into the same registry without
   touching route or queue code — one tool across a creator's entire
   cross-posting workflow.
3. **Direct publish-back.** Today SEO output is copy-paste. With YouTube API
   OAuth consent, generated titles/descriptions/tags could be pushed straight
   onto a creator-owned video — turning a "suggestions" tool into genuine
   one-click pre-publish automation. The metadata shape already matches what
   the upload API accepts.
4. **AI-generated thumbnail concepts.** Frame extraction is limited to what
   exists in the video. An image model could propose entirely new compositions
   from the title/topic, with the existing canvas editor (styles, drag/arrow
   positioning, PNG export) refining the AI base instead of a video frame.
5. **Team/collaboration mode.** Many channels are creator + editor. A shared
   workspace where scheduled posts, SEO drafts, and caption edits sit in
   review before publishing maps directly onto today's localStorage drafts and
   editable outputs — same objects, shared store, approve/reject transitions.
6. **Batch processing.** Accept a channel backlog or CSV of URLs and run the
   pipeline overnight — the job queue already supports concurrent jobs with
   per-job progress, so batching is mostly a fan-out UI plus a results table.
   The killer use case: migrating a whole back-catalog's SEO in one pass.
7. **Browser extension.** A lightweight companion living on the YouTube Studio
   upload page, auto-suggesting captions/SEO/thumbnails inline during the
   native upload flow — same three backend endpoints, no separate tool, no
   copy-paste step at all.
8. **Multi-language captions and SEO.** Whisper already detects dozens of
   languages; the SEO prompt could emit localized titles/descriptions per
   target audience from a single upload. The `lang` parameter already threads
   from the Captions tab through the API — generation prompts are the only
   thing left to localize.

## Known limitations (stated plainly)

- YouTube bot-checks are an arms race: `yt-dlp` + cookies + PO-token helper
  work today, but a YouTube change can break extraction until upstream updates.
- Whisper input is capped at 25MB of audio (~long videos fail gracefully with
  a specific message); thumbnail extraction caps at the first 2 minutes.
- Videos with no native captions *and* no clear speech (music-only, silent)
  return "no speech detected" — correctly, not as a crash.
- Channel stats are demo data until a YouTube Data API key is wired in.
- The free Render tier sleeps: first request after idle can take up to a
  minute (the UI says so explicitly instead of showing a dead spinner).
