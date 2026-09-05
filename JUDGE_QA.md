# Judge Q&A prep (internal — do not link from README)

Honest, specific answers. Never bluff; judges can tell.

## "How is this different from TubeBuddy / VidIQ?"

"Those are analytics-and-keyword-research tools for videos already uploaded —
they tell you what ranked. CreatorFlow works pre-upload, from a single URL,
generating captions, SEO, thumbnails, and a schedule together in one pass.
TubeBuddy's keyword data is backed by years of search volume; ours is
LLM-reasoning over the actual transcript — weaker for keyword research,
stronger for going from finished video to publish-ready in minutes with one
free tool instead of three paid subscriptions."

## "What happens if YouTube changes something and yt-dlp breaks?"

"That's a real dependency risk, shared by everything in this category. yt-dlp
is aggressively maintained and usually adapts within days; we pin the binary
via an auto-updater on boot and monitor upstream. If extraction breaks, every
endpoint degrades to a specific error instead of a crash — you'd see it on
the Status page immediately."

## "Is this legal / does it violate YouTube ToS?"

"Directly: it's built as a personal workflow tool for a creator processing
their own content — your captions, your SEO, your thumbnails — not a public
video-ripping service. Downloads stream once to the requester and are deleted
from the server immediately. The demo runs against public content."

## "What does it cost to run at scale?"

"Today: $0 — Vercel hobby, Render free, Groq free tier. Honestly, that stops
scaling at hobby traffic: Groq rate limits would force a paid tier first,
then Render off free. The architecture doesn't need rewriting for that —
same platforms, paid tiers, plus a real queue store (Redis) once one dyno
isn't enough. I'd say that instead of pretending free scales forever."

## "Hardest technical problem you solved?"

"The URL input froze completely under React 19. Root cause, not guesswork:
the app shell rendered `<html>/<head>/<body>` singletons client-side, which
desyncs React 19's fiber tree from the DOM. Fixed by making the shell render
only head content plus children. Thirty-second version: framework-level DOM
ownership bug, traced to a known React 19 constraint, fixed by removing the
duplicate document shell."

## "Why Groq instead of OpenAI/Anthropic?"

"Cost, stated plainly: Groq's free tier gave a production-grade LLM and
Whisper transcription under one key with zero budget. The code isolates the
model ID behind `GROQ_SEO_MODEL`, so swapping providers is a config change —
and we already exercised that once when Groq retired `llama-3.3-70b-versatile`
overnight and we moved to `openai/gpt-oss-120b`."

## "What's not working / what would you fix first?"

"Three honest items: (1) channel stats are demo data until a YouTube Data API
key is wired in; (2) Whisper input caps at 25MB of audio, so very long videos
can't AI-transcribe; (3) YouTube bot-checks are an arms race we mitigate but
can't eliminate. First with more time: real analytics integration — it turns
the scheduling heuristic into genuinely data-driven guidance."
