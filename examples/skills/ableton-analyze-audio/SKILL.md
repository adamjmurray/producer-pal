---
name: ableton-analyze-audio
description: >-
  Listen to audio with Google's Gemini API and report on how it sounds: timbre,
  mix balance, arrangement, obvious problems. Works on any audio file; to get
  one out of Ableton Live first, use the ableton-export-audio skill. Use when
  the user wants feedback on how a track, mix, or clip actually sounds. Needs a
  GEMINI_API_KEY; any platform, no Ableton involved.
---

# Ableton: Analyze Audio

`analyze-audio.mjs` sends an audio file to Gemini with a prompt and prints the
answer. It has nothing to do with Live; the file can come from anywhere.

**Getting audio out of Live:** use `ableton-export-audio` (installed alongside
this skill as `../ableton-export-audio/export-audio.mjs`). It bounces the mix, a
track, or one Session clip to an MP3 and prints the path. Read its SKILL.md for
the prerequisites (macOS, Accessibility permission) and the dry-by-default and
whole-arrangement behavior that shape how you prompt below.

**Why a skill and not a Producer Pal tool?** Analysis needs an API key +
network, which the Max-for-Live runtime has no story for. A coding-agent skill
runs in an environment that does.

## Prerequisites

- A **`GEMINI_API_KEY`** (or `GEMINI_KEY`) in the environment, or pass
  `--api-key`. Defaults to `gemini-3.6-flash`; model IDs move, so override with
  `--model` / `GEMINI_MODEL` if that one is gone.
- **Not in the environment? Look for a `.env`** in the project root before
  asking the user for a key, and grep it for the name rather than assuming one —
  `grep -iE 'gemini|google' .env`. Projects spell it `GEMINI_KEY`,
  `GEMINI_API_KEY`, `GOOGLE_API_KEY`, and worse. Pass what you find as
  `--api-key`, or export it under a name the script knows.
- Network access. Node.js 18+ (global `fetch`; no npm packages).

## Analyze a file

```bash
node analyze-audio.mjs /…/ppal-Main-<stamp>.mp3 \
  --prompt "Say where the audible material starts and ends, then describe the timbre and flag any mix problems."
```

**Writing your own `--prompt` replaces the default one**, which asks the model
where the audible material starts and ends. A Live export is padded with silence
to the arrangement's length, so keep that instruction in any prompt you write —
otherwise timings in the answer are relative to a mostly-empty file, and a
silent render (wrong track, muted, plays nowhere in the arrangement) looks like
a bad analysis instead of an obvious mistake.

MP3 is the right input format: a fraction of a WAV's size, which matters for
upload speed and for staying under Gemini's 20 MB inline-data limit on full
songs. It does **not** change token cost (Gemini prices audio by duration and
downsamples internally, so MP3 and WAV cost the same and analyze the same).

### Asking more than one question

Files under ~14 MB are sent inline and cost nothing but the request. Bigger ones
are uploaded to Gemini's Files API first, and `--upload` forces that for a small
file too. Either way **each run is one question** — reusing an upload saves the
transfer, not the conversation; the model never sees the previous answer.

An upload isn't deleted for you. The script prints its `files/<id>` on stderr,
and you use it like a rendered file: reuse, then clean up.

```bash
node analyze-audio.mjs render.mp3 --upload            # prints "Uploaded as files/abc…"
node analyze-audio.mjs --file-uri files/abc --prompt "Now just the drums — how do they sit?"
node analyze-audio.mjs --delete files/abc             # done with it
```

Storage is free (20 GB per project) and Google drops an upload after 48 h, so a
missed cleanup costs nothing — but it does leave the user's music on Google's
servers until then. For a single question, skip all of this: the plain form
uploads nothing when the file is small.

**Keep the audio file until the user is finished with it.** Any surprise in an
answer is worth a direct follow-up (see Gotchas), and that only costs a second
request — unless you deleted the audio, in which case it costs another render.

## End to end with Live

```bash
EXPORT=../ableton-export-audio/export-audio.mjs   # relative to this skill folder
OUT=$(node "$EXPORT" --track "Bass")
MP3=$(printf '%s' "$OUT" | node -e 'process.stdin.once("data",d=>console.log(JSON.parse(d).audio))')
node analyze-audio.mjs "$MP3" --prompt "Say where the audible material starts and ends. How does this bass part sound? Tone, groove, problems?"
# cleanup, once the user has no more questions about it: delete every file the export created
printf '%s' "$OUT" | node -e 'const fs=require("fs");process.stdin.once("data",d=>JSON.parse(d).created.forEach(f=>fs.rmSync(f,{force:true})))'
```

A track exports **dry** unless you pass `--with-returns`; ask about the mix with
returns on, and about a sound in isolation with them off.

## Gotchas

- **Qualitative, not measurement:** Gemini describes character and flags obvious
  issues (imbalance, harshness, clipping) well, but is not a precise detector of
  tempo, key, or onsets — measure those with DSP if you need exact numbers.
- **Open description invents instrumentation.** Asked to describe a drum stem,
  the model added a bass part and vocal stabs that weren't in it — then said "no
  vocal stabs" when asked directly. The default prompt pushes back on this, but
  check anything surprising with a yes/no question before acting on it.
- **You own the cleanup.** Delete an exported temp file (`created`) and any
  upload (`--delete`) when the **user** is done with the audio, not the moment
  the first answer prints. A follow-up question needs that file, and
  re-exporting to answer one is minutes of UI automation.
