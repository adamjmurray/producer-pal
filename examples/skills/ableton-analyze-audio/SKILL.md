---
name: ableton-analyze-audio
description: >-
  Get audio out of Ableton Live and optionally hand it to an audio-capable LLM.
  Two halves that work independently: render/bounce/export the whole mix or a
  single track to a file (macOS UI automation, no API key needed), and analyze
  any audio file with Google's Gemini API (needs a key, works on files from
  anywhere). Use when the user wants a mixdown, a stem, or a bounce of what
  they've got — or wants feedback on how something actually sounds, its timbre,
  mix, or arrangement. Rendering is macOS + Ableton Live 12 only.
---

# Ableton: Render and Analyze Audio

Get audio **out** of Ableton Live and hand it to an audio-capable LLM for
feedback. Ableton exposes no Live API for rendering, so `render.mjs` drives
Live's Export dialog with AppleScript (macOS accessibility automation), then
`analyze-audio.mjs` sends the result to Gemini.

**The two scripts stand alone.** Use `render.mjs` by itself whenever the user
wants a bounce, a stem, or a mixdown on disk — no API key or analysis involved.
Use `analyze-audio.mjs` by itself on any audio file, wherever it came from; it
has nothing to do with Live. Together they're the loop below.

**Why a skill and not a Producer Pal tool?** Rendering needs UI automation and
analysis needs an API key + network — neither fits the Max-for-Live runtime
(`child_process` is banned there, and it has no secrets story). A coding-agent
skill runs in an environment that has both.

**Non-destructive.** Export never alters the Set. `--session` is the one
exception: it adds a temp track and deletes it again in the same run, leaving
your own tracks untouched. By default the render goes to a temp file that you
delete after analysis; pass `--out <dir>` to keep it.

## Prerequisites

Split by half — a missing Gemini key does not block a render, and rendering's
macOS requirement does not block analyzing a file you already have.

**To render (`render.mjs`):**

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

**To analyze (`analyze-audio.mjs`):**

- A **`GEMINI_API_KEY`** (or `GEMINI_KEY`) in the environment, or pass
  `--api-key`. Defaults to `gemini-3.6-flash`; model IDs move, so override with
  `--model` / `GEMINI_MODEL` if that one is gone.
- **Not in the environment? Look for a `.env`** in the project root before
  asking the user for a key, and grep it for the name rather than assuming one —
  `grep -iE 'gemini|google' .env`. Projects spell it `GEMINI_KEY`,
  `GEMINI_API_KEY`, `GOOGLE_API_KEY`, and worse. Pass what you find as
  `--api-key`, or export it under a name the script knows.
- Network access. Any platform; no Ableton involved.

**Both:** Node.js 18+ (global `fetch`; no npm packages).

## Render — whole mix, one track, or one Session clip

`render.mjs` focuses the Arrangement and Selects All (so the render range is the
whole arrangement), opens **File ▸ Export Audio/Video** (⇧⌘R), sets **Rendered
Track**, turns **Encode MP3** on and every other option off, exports **offline**
(faster than realtime), and saves into a fresh temp dir. It prints JSON.

```bash
node render.mjs                 # whole mix (Rendered Track = Main) → temp .mp3
node render.mjs --track "Bass"  # one track by name → temp .mp3
node render.mjs --track "Drums" --session 0   # its Session clip in scene 0
node render.mjs --track "Bass" --with-returns # include send/master processing
node render.mjs --out ~/renders # move the render into a chosen dir instead
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
music is, so **the analysis prompt asks the model to report that** (see below).
Never read the file's duration as the material's duration.

Output on stdout:

```json
{
  "audio": "/…/ppal-Main-<stamp>.mp3",
  "created": ["/…/ppal-Main-<stamp>.mp3"]
}
```

- `audio` — the `.mp3` to analyze.
- `created` — **every** file the render produced. Normally just the `.mp3`: the
  script turns **Encode PCM** off, so Live's lossless twin isn't written. Still
  delete everything in `created` rather than just `audio`.

To render a specific track you need its **name** (the Rendered Track value).
Producer Pal's `ppal-read-live-set` / `ppal-read-track` will list track names.

### Session clips

Export can only render the arrangement, so `--session <sceneIndex>` puts the
clip there first: it duplicates the track, deletes the copy's inherited
arrangement clips, duplicates the wanted Session clip to `1|1`, renders the
copy, and deletes it. **The user's own track is never modified**, and the temp
track is removed even when the render fails.

Take the scene index from `ppal-read-track` — a clip's `slot` is
`trackIndex/sceneIndex`, so `"0/3"` is scene **3**.

**One clip per render.** Several clips laid end to end would leave the analysis
no way to tell which audio came from which clip. To cover a few, call the script
once per clip — ask the user which ones if it isn't obvious.

## Analyze the rendered file

```bash
node analyze-audio.mjs /…/ppal-Main-<stamp>.mp3 \
  --prompt "Say where the audible material starts and ends, then describe the timbre and flag any mix problems."
```

**Writing your own `--prompt` replaces the default one**, which asks the model
where the audible material starts and ends. Since a render is padded with
silence, keep that instruction in any prompt you write — otherwise timings in
the answer are relative to a mostly-empty file, and a silent render (wrong
track, muted, plays nowhere in the arrangement) looks like a bad analysis
instead of an obvious mistake.

MP3 is the default render format because it's a fraction of a WAV's size — this
matters for upload speed and for staying under Gemini's 20 MB inline-data limit
on full songs. It does **not** change token cost (Gemini prices audio by
duration and downsamples internally, so MP3 and WAV cost the same and analyze
the same).

### Asking more than one question

Files under ~14 MB are sent inline and cost nothing but the request. Bigger ones
are uploaded to Gemini's Files API first, and `--upload` forces that for a small
file too. Either way **each run is one question** — reusing an upload saves the
transfer, not the conversation; the model never sees the previous answer.

An upload isn't deleted for you. The script prints its `files/<id>` on stderr,
and you use it like the rendered file: reuse, then clean up.

```bash
node analyze-audio.mjs render.mp3 --upload            # prints "Uploaded as files/abc…"
node analyze-audio.mjs --file-uri files/abc --prompt "Now just the drums — how do they sit?"
node analyze-audio.mjs --delete files/abc             # done with it
```

Storage is free (20 GB per project) and Google drops an upload after 48 h, so a
missed cleanup costs nothing — but it does leave the user's music on Google's
servers until then. For a single question, skip all of this: the plain form
uploads nothing when the file is small.

**Keep the rendered file until the user is finished with it.** Any surprise in
an answer is worth a direct follow-up (see Gotchas), and that only costs a
second request — unless you deleted the audio, in which case it costs another
render.

## End to end

```bash
OUT=$(node render.mjs --track "Bass")
MP3=$(printf '%s' "$OUT" | node -e 'process.stdin.once("data",d=>console.log(JSON.parse(d).audio))')
node analyze-audio.mjs "$MP3" --prompt "Say where the audible material starts and ends. How does this bass part sound? Tone, groove, problems?"
# cleanup, once the user has no more questions about it: delete every file the render created
printf '%s' "$OUT" | node -e 'const fs=require("fs");process.stdin.once("data",d=>JSON.parse(d).created.forEach(f=>fs.rmSync(f,{force:true})))'
```

## Gotchas

- **Keep Live frontmost** during a render — the keystrokes go to the frontmost
  app. `render.mjs` re-activates Live, but don't click away mid-render.
- **Localization/shortcuts:** the automation matches English Export-dialog
  labels and the default ⇧⌘R / ⌥2 / ⌘A shortcuts. A remapped or non-English Live
  needs adjustment.
- **Qualitative, not measurement:** Gemini describes character and flags obvious
  issues (imbalance, harshness, clipping) well, but is not a precise detector of
  tempo, key, or onsets — measure those with DSP if you need exact numbers.
- **Open description invents instrumentation.** Asked to describe a drum stem,
  the model added a bass part and vocal stabs that weren't in it — then said "no
  vocal stabs" when asked directly. The default prompt pushes back on this, but
  check anything surprising with a yes/no question before acting on it.
- **You delete the audio, the script deletes the track.** `render.mjs` leaves
  every rendered file on disk — that's its output — so clean up `created`, and
  any upload (`--delete`), when the **user** is done with the audio: not the
  moment the first answer prints. A follow-up question needs that file, and
  re-rendering to answer one is minutes of UI automation to recover something
  you just threw away. The temp track from `--session` is the script's own
  responsibility and is always removed.
- **`PPAL-RENDER-TEMP-<6 hex>` is a reserved track-name pattern.** `--session`
  deletes any track matching it before and after rendering, which also clears
  leftovers from a crashed run. The random suffix is what keeps that sweep from
  ever matching a real track.
- **Export settings are sticky**, so the script forces all of them — Rendered
  Track, Include Return and Main Effects, Encode MP3/PCM, Normalize, Convert to
  Mono and the rest. What you last chose by hand can't leak into a render, and
  equally, a render leaves those toggles changed in the dialog.
