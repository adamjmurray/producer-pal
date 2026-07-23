---
name: analyze-audio
description:
  Render audio out of Ableton Live (export the Main mix or a track over a time
  range, or bounce a clip to a new audio track) and analyze it with Google's
  Gemini API. Use when the user wants to hear/analyze how something sounds,
  render a mixdown or stem, or get feedback on timbre, mix, or arrangement.
  macOS only. Requires the producer-pal skill for the bounce mode.
---

# Analyze Audio

Get audio **out** of Ableton Live and hand it to an audio-capable LLM for
feedback. Ableton exposes no Live API for rendering, so this skill drives Live's
menus/dialogs with AppleScript (macOS accessibility automation), then analyzes
the resulting `.wav` with Gemini.

**Why a skill and not a Producer Pal tool?** Rendering needs UI automation and
analysis needs an API key + network — neither fits the Max-for-Live runtime
(`child_process` is banned there, and it has no secrets story). A coding-agent
skill runs in an environment that has both.

## Prerequisites

- **macOS.** The render step is AppleScript GUI automation; there is no
  cross-platform path yet.
- **Accessibility permission** for whatever app runs the agent (Terminal, your
  IDE, etc.): System Settings → Privacy & Security → Accessibility. Without it,
  the keystrokes/clicks silently do nothing.
- **Ableton Live 12** running and frontmost. `Bounce to New Track` is a Live 12
  feature.
- **`GEMINI_API_KEY`** in the environment (or pass `--api-key`). Model IDs move
  — override with `--model` / `GEMINI_MODEL`.
- **Node.js 18+** (global `fetch`; no npm packages).
- For **bounce mode only**: the **`producer-pal`** skill (this skill calls its
  sibling `../producer-pal/ppal.mjs` to detect the new track).

## How it works

The guiding principle is **poll for the completion artifact, never sleep** — an
offline render takes an unknown amount of time, so we fire the UI action and
then wait for the concrete result (the file on disk, or the new track).

### Export mode — Main mix or a track, over a time range

```bash
# Render with the Export dialog's current settings (most reliable):
node render.mjs --mode export --out ~/renders

# Also set the Rendered Track and time range (experimental — see status below):
node render.mjs --mode export --track Main --start 1.1.1 --length 4.0.0 --out ~/renders
```

`render.mjs` opens File → Export Audio/Video (`⇧⌘R`), commits, drives the
standard macOS save panel (`⌘⇧G` + a unique filename), then polls the filesystem
until the `.wav` appears and its size is stable. It prints the absolute `.wav`
path on stdout. `--track Main` renders the whole mix; a track name renders that
track. Export renders **offline** (faster than realtime).

### Bounce mode — clip → new audio track

```bash
# Select the target clip in Live first (or have Producer Pal select it), then:
node render.mjs --mode bounce            # leaves the new audio track in the Set
node render.mjs --mode bounce --cleanup  # deletes the new track after reporting it
```

Fires Edit → Bounce to New Track (`⌘B`), polls Producer Pal until a new track
appears, and reads that track's audio clip `file_path`. `--cleanup` removes the
track afterward (for a pure analysis pass that shouldn't alter the Set).

### Analyze the rendered file

```bash
node analyze-audio.mjs ~/renders/ppal-export-Main-<stamp>.wav \
  --prompt "Describe the timbre and flag any mix problems."
```

Small files are sent inline; larger renders go through Gemini's Files API.
Output is the model's text analysis on stdout.

### End to end

```bash
WAV=$(node render.mjs --mode export --track Main --start 1.1.1 --length 8.0.0 --out ~/renders)
node analyze-audio.mjs "$WAV" --prompt "How's the arrangement and mix over these 8 bars?"
```

## Prototype status

This is a **first pass**. What's solid vs. what needs a live spike:

- **Solid:** the reliability model (artifact polling), the macOS save panel
  automation (`⌘⇧G` + filename + Save — a standard `NSSavePanel`), unique
  filenames to dodge the overwrite sheet, and the Gemini upload/analyze paths.
- **Needs a live spike (marked `VERIFY-FIRST` / `SPIKE` in the code):**
  - Ableton's **custom Export dialog** internals — setting the Rendered Track
    popup and the Render Start/Length fields is index-based and unverified.
    Whether those fields inherit the Arrangement time selection (so they could
    be pre-set via `ppal-live-api` instead of typed) is the key open question.
    Until then, prefer the no-`--track`/`--start`/`--length` form and configure
    the dialog once by hand.
  - **Bounce mode:** whether `⌘B` renders offline or realtime for your device
    chains, its exact clip-vs-track scope, and the `ppal-read-track` /
    delete-track tool shapes used to find and clean up the new track.

## Gotchas

- **Localization/shortcuts:** the AppleScript matches English UI text (`Export`,
  `Save`) and the default `⇧⌘R` / `⌘B` shortcuts. Remapped shortcuts or a
  non-English Live will need adjustment.
- **Large renders:** a full Main-mix export can be tens of MB; those route
  through the Files API automatically. Expect analysis to be **qualitative** —
  Gemini describes character and flags obvious issues but is not a precise
  tempo/key/onset detector.
- **Keep Live frontmost** during a render; the keystrokes go to the frontmost
  app.
