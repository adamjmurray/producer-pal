---
name: ableton-export-audio
description: >-
  Export audio out of Ableton Live to a file: bounce the whole mix, render a
  single track as a stem, or render one Session clip. Drives Live's Export
  dialog with AppleScript, since Live has no render API. Use when the user wants
  a mixdown, a stem, a bounce, or an audio file of what they've got, and as the
  first step of any listen-and-give-feedback loop. macOS + Ableton Live 12 only.
  No API key.
---

# Ableton: Export Audio

Ableton exposes no Live API for rendering, so `export-audio.mjs` drives **File ▸
Export Audio/Video** with AppleScript (macOS accessibility automation) and
prints where the file landed. Pair it with `ableton-analyze-audio` to hand the
file to an audio-capable LLM.

**Non-destructive.** Export never alters the Set. `--session` is the one
exception: it adds a temp track and deletes it again in the same run, leaving
your own tracks untouched. By default the file goes to a temp dir; pass
`--out <dir>` to put it somewhere the user keeps.

## Prerequisites

- **macOS** with **Accessibility permission** for whatever app runs the agent
  (Terminal, your IDE, etc.): System Settings → Privacy & Security →
  Accessibility. Without it the keystrokes silently do nothing.
- **Ableton Live 12** running and **frontmost**. Export renders the arrangement
  timeline, so Arrangement material works directly; a Session clip needs
  `--session` (below).
- English Live UI and default shortcuts are assumed.
- **`--session` only:** the Producer Pal device loaded, since staging the clip
  goes through its REST API on port 3350 (`PPAL_PORT` to override). Nothing else
  in this skill needs it.
- Node.js 18+, no npm packages.

## Usage

`export-audio.mjs` focuses the Arrangement and Selects All (so the render range
is the whole arrangement), opens the Export dialog (⇧⌘R), sets **Rendered
Track**, turns **Encode MP3** on and every other option off, exports **offline**
(faster than realtime), and saves into a fresh temp dir. It prints JSON.

```bash
node export-audio.mjs                 # whole mix (Rendered Track = Main) → temp .mp3
node export-audio.mjs --track "Bass"  # one track by name → temp .mp3
node export-audio.mjs --track "Drums" --session 0   # its Session clip in scene 0
node export-audio.mjs --track "Bass" --with-returns # include send/master processing
node export-audio.mjs --out ~/renders # move the render into a chosen dir instead
```

**A track renders dry by default.** Live's **Include Return and Main Effects**
is off, so a stem has its own devices but no send reverb/delay and no master
chain — it can sound very different from what the user hears. Add
`--with-returns` when the question is about the mix; leave it off to judge a
sound in isolation. Either way the script forces the setting, so a value left
over from a previous export can't change your render.

**Expect silence in the output.** Every render — whole mix, single track, or
Session clip — covers the **entire arrangement length**. Live's Render
Start/Length fields can't be set by UI automation, so the only way to establish
a range is Select All. A track that only plays in the last chorus, or a short
Session clip, therefore comes back mostly silent. Harmless (silence costs almost
nothing as MP3), and nothing trims it — the script has no way to know where the
music is. Never read the file's duration as the material's duration, and tell
anything that listens to the file to report where the audible material starts
and ends.

**MP3 only.** It's a fraction of a WAV's size, which matters when the file goes
on to an LLM (upload speed, inline-data limits). Encode PCM is forced off, so
Live's lossless twin isn't written. For a lossless bounce, export by hand.

Output on stdout:

```json
{
  "audio": "/…/ppal-Main-<stamp>.mp3",
  "created": ["/…/ppal-Main-<stamp>.mp3"]
}
```

- `audio` — the `.mp3`.
- `created` — **every** file the render produced. Normally just the `.mp3`.
  Still delete everything in `created` rather than just `audio` when cleaning
  up.

To render a specific track you need its **name** (the Rendered Track value).
Producer Pal's `ppal-read-live-set` / `ppal-read-track` will list track names.

### Session clips

Export can only render the arrangement, so `--session <sceneIndex>` puts the
clip there first: it duplicates the track, deletes the copy's inherited
arrangement clips, duplicates the wanted Session clip to `1|1`, renders the
copy, and deletes it. **The user's own track is never modified**, and the temp
track is removed even when the render fails.

Take the scene index from `ppal-read-track` — a Session clip's `path` is
`t<track>/s<scene>`, so `"t0/s3"` is scene **3**.

**One clip per render.** Several clips laid end to end would leave no way to
tell which audio came from which clip. To cover a few, call the script once per
clip — ask the user which ones if it isn't obvious.

## Gotchas

- **Keep Live frontmost** during a render — the keystrokes go to the frontmost
  app. The script re-activates Live, but don't click away mid-render.
- **Localization/shortcuts:** the automation matches English Export-dialog
  labels and the default ⇧⌘R / ⌥2 / ⌘A shortcuts. A remapped or non-English Live
  needs adjustment.
- **You delete the audio, the script deletes the track.** The script leaves
  every rendered file on disk — that's its output. A temp render is yours to
  clean up (`created`) once the **user** is done with it, not the moment you've
  used it: re-rendering is minutes of UI automation. The temp track from
  `--session` is the script's own responsibility and is always removed.
- **`PPAL-RENDER-TEMP-<6 hex>` is a reserved track-name pattern.** `--session`
  deletes any track matching it before and after rendering, which also clears
  leftovers from a crashed run. The random suffix is what keeps that sweep from
  ever matching a real track.
- **Export settings are sticky**, so the script forces all of them — Rendered
  Track, Include Return and Main Effects, Encode MP3/PCM, Normalize, Convert to
  Mono and the rest. What you last chose by hand can't leak into a render, and
  equally, a render leaves those toggles changed in the dialog.
