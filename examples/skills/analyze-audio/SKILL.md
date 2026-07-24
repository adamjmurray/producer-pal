---
name: analyze-audio
description:
  Render audio out of Ableton Live (the whole mix or a single track) and analyze
  it with Google's Gemini API. Use when the user wants to hear/analyze how
  something sounds, render a mixdown or stem, or get feedback on timbre, mix, or
  arrangement. macOS + Ableton Live 12 only.
---

# Analyze Audio

Get audio **out** of Ableton Live and hand it to an audio-capable LLM for
feedback. Ableton exposes no Live API for rendering, so `render.mjs` drives
Live's Export dialog with AppleScript (macOS accessibility automation), then
`analyze-audio.mjs` sends the result to Gemini.

**Why a skill and not a Producer Pal tool?** Rendering needs UI automation and
analysis needs an API key + network — neither fits the Max-for-Live runtime
(`child_process` is banned there, and it has no secrets story). A coding-agent
skill runs in an environment that has both.

**Non-destructive.** Export never alters the Set. By default the render goes to
a temp file that you delete after analysis; pass `--out <dir>` to keep it.

## Prerequisites

- **macOS** with **Accessibility permission** for whatever app runs the agent
  (Terminal, your IDE, etc.): System Settings → Privacy & Security →
  Accessibility. Without it the keystrokes silently do nothing.
- **Ableton Live 12** running and **frontmost**, with the material you want in
  the **Arrangement** (Export renders the arrangement timeline).
- A **`GEMINI_KEY`** (or `GEMINI_API_KEY`) in the environment, or pass
  `--api-key`. Model IDs move — override with `--model` / `GEMINI_MODEL`.
- **Node.js 18+** (global `fetch`; no npm packages).
- English Live UI and default shortcuts are assumed.

## Render — whole mix or one track

`render.mjs` focuses the Arrangement and Selects All (so the render range is the
whole arrangement), opens **File ▸ Export Audio/Video** (⇧⌘R), sets **Rendered
Track**, turns **Encode MP3** on and distracting options off, exports
**offline** (faster than realtime), and saves into a fresh temp dir. It prints
JSON.

```bash
node render.mjs                 # whole mix (Rendered Track = Main) → temp .mp3
node render.mjs --track "Bass"  # one track by name → temp .mp3
node render.mjs --out ~/renders # move the render into a chosen dir instead
```

Output on stdout:

```json
{
  "audio": "/…/ppal-Main-<stamp>.mp3",
  "created": ["/…/ppal-Main-<stamp>.mp3", "/…/ppal-Main-<stamp>.wav"]
}
```

- `audio` — the `.mp3` to analyze.
- `created` — **every** file the render produced. Live also honors its PCM
  setting, so a `.wav`/`.aiff`/`.flac` twin usually appears next to the `.mp3`;
  delete everything in `created` when you're done.

To render a specific track you need its **name** (the Rendered Track value).
Producer Pal's `ppal-read-live-set` / `ppal-read-track` will list track names.

## Analyze the rendered file

```bash
node analyze-audio.mjs /…/ppal-Main-<stamp>.mp3 \
  --prompt "Describe the timbre and flag any mix problems."
```

MP3 is the default render format because it's a fraction of a WAV's size — this
matters for upload speed and for staying under Gemini's 20 MB inline-data limit
on full songs. It does **not** change token cost (Gemini prices audio by
duration and downsamples internally, so MP3 and WAV cost the same and analyze
the same). Files under ~14 MB are sent inline; larger go through the Files API.

## End to end

```bash
OUT=$(node render.mjs --track "Bass")
MP3=$(printf '%s' "$OUT" | node -e 'process.stdin.once("data",d=>console.log(JSON.parse(d).audio))')
node analyze-audio.mjs "$MP3" --prompt "How does this bass part sound? Tone, groove, problems?"
# cleanup: delete every file the render created
printf '%s' "$OUT" | node -e 'const fs=require("fs");process.stdin.once("data",d=>JSON.parse(d).created.forEach(f=>fs.rmSync(f,{force:true})))'
```

## Gotchas

- **Keep Live frontmost** during a render — the keystrokes go to the frontmost
  app. `render.mjs` re-activates Live, but don't click away mid-render.
- **Localization/shortcuts:** the automation matches English Export-dialog
  labels and the default ⇧⌘R / ⌥2 / ⌘A shortcuts. A remapped or non-English Live
  needs adjustment.
- **Qualitative, not measurement:** Gemini describes character and flags obvious
  issues (imbalance, harshness, clipping) well, but is not a precise tempo/key/
  onset detector — measure those with DSP if you need exact numbers.
- **Rendered Track remembers its last value** across exports; `render.mjs`
  always forces it, so an earlier manual choice won't leak into your render.
