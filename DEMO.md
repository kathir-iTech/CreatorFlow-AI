# CreatorFlow AI — 90-second demo script

Total: ~90 seconds. Rehearse once. End on the thumbnail export (most visual).

**Setup before the slot:** open the live app, have a captioned video URL in
your clipboard (a popular tech explainer works — native captions = instant),
backend already warm (hit `/healthz` 2 min before).

## Beat by beat

**0:00–0:10 — The pitch (say while pasting the URL)**
> "Every upload, creators repeat the same grind: transcripts in one tool, SEO
> in another, thumbnails in a third. CreatorFlow does the whole pre-publish
> pipeline from one link."
*Paste URL, hit Fetch. Captions start automatically.*

**0:10–0:30 — Captions (the engine is real)**
> "First it pulls native YouTube captions — free and instant. If a video has
> none, it falls back to AI transcription. Everything's editable, and it
> exports to SRT, VTT, or plain text."
*Click a caption line, edit a word. Hit .srt to show export.*

**0:30–0:50 — SEO (the money feature)**
> "That transcript feeds straight into the SEO generator — five title
> options, description, tags, chapters. No copy-paste between tools; the
> pipeline hands the transcript over itself."
*Click through two titles, remove a tag.*

**0:50–1:10 — Thumbnail (end on the visual)**
> "And thumbnails — real frames pulled from the actual video, not stock. Pick
> one, add text, drag it where you want…"
*Drag the text, switch style, hit Export PNG.*
> "…and that's a finished thumbnail."

**1:10–1:30 — Schedule + close**
> "Everything lands in a posting schedule with best-time guidance. One link
> in — captions, SEO, thumbnail, schedule out. That's CreatorFlow."
*Show the Schedule tab briefly. Stop. Take questions.*

## If something fails live

- Captions shows a *specific* error (no captions / audio blocked / no speech)
  — read it aloud; it proves the error handling is real, then move on.
- Backend cold start: "free-tier server waking up — this is the honest
  loading state" (it says so on screen).
- Never debug on stage. The Status page (`/status`) shows backend health if a
  judge asks.
