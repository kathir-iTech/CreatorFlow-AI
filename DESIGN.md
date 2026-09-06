# CreatorFlow AI — Design System (Nov 2026)

> Written before any UI code, per Part 1. Critiqued against the listed traps at the end.

## Concept — "Raw footage becoming a finished package"

Not a dashboard. The feeling is an edit bay: dark, focused, a raw timeline scrubbing into organized, labeled, ready-to-publish blocks. The product takes one messy input (a link) and resolves it into five deliberate outputs. Motion should feel like a render completing, not like cards popping. Quiet environment, one focal moment.

## COLOR — Edit-bay palette (deliberate, named, 6 values)

All values are final hex, used consistently. Chosen for the edit-bay concept, not generic AI purple.

- **Ink `#09090B`** — background. Near-black zinc, like a timeline canvas. Not pure black (harsh) nor slate (washed).
- **Track `#1A1A1E`** — surface / card / panel. One step up from Ink, like a track lane. Used for `.glass` replacement.
- **Signal Amber `#FFB020`** — primary accent / brand / "render complete". Warm, confident, editorial — the color of a finished export badge, not a gradient. Used for primary CTA, completed states, headline accent.
- **Playhead Cyan `#0EA5E9`** — secondary accent / active / streaming. Cool, precise, the playhead — used only for live SSE/active processing states, never as decoration.
- **Paper `#F4F4F5`** — text-primary (zinc-100). Warm white, high contrast on Ink.
- **Mute `#A1A1AA`** — text-muted (zinc-400). For secondary labels, timestamps, helper copy.

Supporting only: `emerald #10B981` for success check (kept, it's universally readable), `rose #E11D48` for error. No other accent creep.

Why not purple/blue gradient? That palette says "AI wrapper" before a word is read. Amber says "post-production, finished, warm" — distinctive and tied to the transformation concept. Judges will not have seen the same palette on the previous 30 demos.

Light mode (kept for completeness) inverts Ink↔Paper but keeps amber/cyan accents identical.

## TYPE — Editorial display + neutral UI

- **Display: `Instrument Serif` (400, 500)** — headline only. Editorial, confident, slightly condensed — carries personality without shouting. One size, one voice for the hero. Fallback: `Georgia`.
- **Body/UI: `Geist Sans` (400, 500, 600)** — everything else. Neutral, highly legible at small sizes, excellent tabular numbers. If unavailable, `Inter` fallback.
- **Mono: `JetBrains Mono` (400)** — numbers, timecodes, stat values, video IDs. Like a timecode overlay — reinforces the edit-bay lineage. Used only for stats/count-up.

Scale (all in `rem`, mobile first):
- Hero display: 2.25 / 3.0 (sm) — Instrument Serif, tight leading
- Section title: 0.875 — Geist 600, uppercase tracking 0.12em when used as label
- Body: 0.875 — Geist 400
- UI small: 0.75 — Geist 500
- Mono stat: 1.25 — JetBrains Mono 500

Weights are intentional: display never bold, UI never light — discipline, not variety.

## LAYOUT — Two distinct surfaces

### Hero / Landing — left-aligned, orchestrated reveal

Not centered headline + subhead + input stack. Left-aligned, like a timeline header.

```
+----------------------------------------------------------+
|  Header: [mark] CreatorFlow AI            [Studio History Status] [theme] |
+----------------------------------------------------------+
|                                                          |
|  Paste a YouTube link.                                   |
|  Get back captions, titles, a thumbnail                  |
|  and a posting plan — ready to publish.                  |
|                                                          |
|  [ pasted-link input ——— full width, the focal point  ][Fetch] |
|  ──●───●───●───●───●── continuous thread, named stages    |
|     Fetch Captions SEO  Thumb  Plan                       |
|                                                          |
|  (one motion: headline letters resolve left→right like    |
|   a render completing; everything else still)              |
+----------------------------------------------------------+
```

*Why left-aligned?* Centered says "marketing site." Left-aligned says "tool, timeline, work." The input is the literal focal point everything arranges around — the one thing the user does.

### Working view — tabbed pipeline beneath, varied treatment per tab

```
+----------------------------------------------------------+
|  [Fetch]  [Captions]  [SEO]  [Thumb]  [Plan]   (quiet,    |
|   evenly spaced, active = amber underline + tint)         |
+----------------------------------------------------------+
|  Fetch:     large input + live stream pill + file card    |
|  Captions:  editor — mono timestamps, editable lines      |
|  SEO:       title cards (selectable), tag pills           |
|  Thumbnail: macOS window chrome + canvas + floating bar  |
|  Schedule:  timeline track + stat lane + readiness       |
+----------------------------------------------------------+
```

*Alignment*: Content max-w-3xl, centered — but type inside is left-aligned. Consistent outer container, inconsistent inner card treatment (the point).

## PRINCIPLES — What makes this not a generic AI template

1. One focal motion, not many: the headline resolves like a render; the pipeline thread fills as real jobs complete. No fade-up on every card.
2. Vary treatment by meaning: an editor (Captions) should not look like a stat (Schedule) — same tokens, different structure.
3. Numbers feel live: stats count up on fetch, the thread moves with SSE progress, not with a static step number.
4. Amber is the brand, cyan is the signal: warm for "done," cool for "doing" — never mixed, never decorative.

---

## Self-critique against the listed traps

- *Eyebrow pill?* Removed entirely. Brand is established by the header mark + the hero's amber-accented headline, not a floating label. Checked: no pill remains.
- *Identical rounded-card everywhere?* Explicitly varied per tab (see Layout). If a future change re-applies one Card everywhere, that violates this plan — fix by re-varying.
- *Numbered steps?* Replaced with a continuous thread + named nodes that transform (idle → pulsing playhead → amber check). Numbers were redundant; names carry order.
- *Purple/blue default?* Rejected — amber/cyan edit-bay palette is deliberate and named above. If purple reappears as primary, that's a regression to the template.
- *Generic SaaS risk remaining?* The biggest risk is the hero still reading as "big headline + input" — mitigated by left alignment, single motion, and the thread immediately below the input making the transformation tangible without a "how it works" list. If it still feels generic, the fix is not more decoration but tighter copy and more confident whitespace.

Proceed to implementation only after this reads as specific to "footage → package." It does.

