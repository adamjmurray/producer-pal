---
title: Ableton MCP Tool Reference
description:
  Every Producer Pal tool with its full parameter schema — tracks, scenes, MIDI
  and audio clips, devices, arrangement, library, and playback.
head:
  - - meta
    - property: og:title
      content: Ableton MCP Tool Reference — Producer Pal
  - - meta
    - property: og:description
      content:
        Full parameter schemas for all of Producer Pal's Ableton Live tools —
        clips, tracks, scenes, devices, arrangement, library, and playback.
---

# Tool Reference

Every Producer Pal tool and its parameters. For what Producer Pal can do in
plain terms, start with [Features](/features).

The AI picks these tools and fills in the parameters itself — you don't call
them by hand. Read this when you want to know exactly what a tool accepts, or
when you're driving Producer Pal from the [REST API](/guide/rest-api) or the
[Agent Skill](/guide/skills).

## Core Tools

### 🔧 Connect (`ppal-connect`) {#ppal-connect}

- Summarizes the state of the current Live Set
- Returns a [skill set](/features#skills) and [context](/guide/context) that
  teach the AI how to use Producer Pal effectively. Standard skills cover the
  full feature set. [Small model mode](/features#small-model-mode) provides
  simplified skills and schemas for less capable models.
- Call it first when a model is driving Producer Pal — that's how the AI learns
  the notation and conventions. A plain REST script can skip it.

<!--@include: ../_generated/ppal-connect-schema.md-->

### 🔧 Context (`ppal-context`) {#ppal-context}

- Read and write the three [context layers](/guide/context): project context
  (notes about this Live Set), global context (preferences that apply to every
  project), and memory (facts AI records about you as you work)

<!--@include: ../_generated/ppal-context-schema.md-->

## Session Tools

### 🔧 Playback (`ppal-playback`) {#ppal-playback}

- Start/stop playback in Session or Arrangement view
- Play specific scenes or clips
- Set loop points and playback position
- Jump to arrangement locators by ID or name
- Set loop start/end using locators
- Playback always follows the Arrangement (no per-track override)
- Stop all clips or specific clips

<!--@include: ../_generated/ppal-playback-schema.md-->

### 🔧 Library (`ppal-library`) {#ppal-library}

::: warning Requires Live 12.4+

The library tools require Ableton Live 12.4 or later. On older versions they
return an error explaining the requirement. Use the version of Max bundled with
Live, or make sure your standalone Max is up to date. See
[Troubleshooting](/support/troubleshooting) for details.

:::

- Search Live's browser library by name, tags, content kind, device kind, or
  source category (User Library, Pack, Built-in, Cloud, Plugin, or your sample
  folder)
- Also includes the user-configured sample folder when set, with results merged
  and de-duplicated against Live's library
- Sort by `use_count` (Live's persistent usage counter — surfaces what you
  actually use most), `mod_date`, or `name`
- Enumerate available tags with `action: "listTags"` so the AI can discover the
  tag vocabulary on your machine, or browse Live's category taxonomy (Sounds,
  Drums, Genres, …) with `action: "listCategories"`
- Run many filtered searches in one call with `action: "searchBatch"` — results
  grouped per query, so the AI can assemble a whole drum kit in one round trip
- List the VST/VST3/AU plug-ins Live knows about with `action: "listPlugins"`
  (filter by query, vendor, format, device kind, or subcategory)
- Rank samples by audio similarity to a seed sample with `action: "findSimilar"`
  — Live's own similarity index, not Producer Pal listening — or group library
  samples with identical audio (re-shipped duplicates) with
  `action: "findDuplicates"` — both can be narrowed with the search filters

<!--@include: ../_generated/ppal-library-schema.md-->

### 🔧 Select (`ppal-select`) {#ppal-select}

- Read current selection and view state (when no arguments)
  - Returns only non-null fields: selected track, scene, clip, device
  - Rich object shapes with IDs, types, and context (path, etc.)
- Update selection and return only relevant fields
  - Select any object by ID (auto-detects track/scene/clip/device)
  - Select tracks by index/category, scenes by index
  - Select by path: a session position (e.g., `t0/s3`), a track (`t0`), a return
    track (`rt0`), the master track (`mt`), a scene (`s3`), or a device (e.g.,
    `t0/d1`)
  - Switch between Session and Arrangement views
  - Auto-switches to session view for scene/clipSlot selection
  - Detail views auto-managed: clip detail opens on clip selection, device
    detail on device selection

<!--@include: ../_generated/ppal-select-schema.md-->

## Action Tools

### 🔧 Delete (`ppal-delete`) {#ppal-delete}

- Remove tracks, return tracks, scenes, clips, devices, or drum pads
- Bulk delete multiple objects

<!--@include: ../_generated/ppal-delete-schema.md-->

### 🔧 Duplicate (`ppal-duplicate`) {#ppal-duplicate}

- Copy tracks, scenes, clips, or devices
- Create multiple copies at once
- Copy clips anywhere in the Session, Arrangement, or from Session to
  Arrangement
  - Position in the Arrangement by bar|beat or locator
  - Auto-tile clips to fill longer arrangement durations
- Apply [transforms](/features#transforms) to each duplicated clip (e.g.
  transpose copies, vary velocities) without a separate update step
- Stack MIDI variations on [take lanes](/features#take-lanes) with
  `toPath: "t2/l+"` + transforms — audition alternates at the same arrangement
  position
- Copy devices to any track, return track, or rack chain
- Route duplicated tracks to source instrument for MIDI layering

Note: Return tracks and devices on return tracks cannot be duplicated (Live API
limitation).

<!--@include: ../_generated/ppal-duplicate-schema.md-->

## Live Set Tools

### 🔧 Read Live Set (`ppal-read-live-set`) {#ppal-read-live-set}

- Get complete Live project overview
- View all tracks and scenes at once, with a clip count per track (clip contents
  come from [Read Track](#ppal-read-track), [Read Scene](#ppal-read-scene), and
  [Read Clip](#ppal-read-clip))
- See tempo, time signature, and scale settings
- View arrangement locators with times and names
- Check what's playing and track states

<!--@include: ../_generated/ppal-read-live-set-schema.md-->

### 🔧 Update Live Set (`ppal-update-live-set`) {#ppal-update-live-set}

- Change tempo, time signature, scale
- Create, rename, or delete arrangement locators

<!--@include: ../_generated/ppal-update-live-set-schema.md-->

## Track Tools

### 🔧 Create Track (`ppal-create-track`) {#ppal-create-track}

- Add MIDI, audio, or return tracks
- Position tracks exactly where you want
- Set initial mute/solo/arm states

<!--@include: ../_generated/ppal-create-track-schema.md-->

### 🔧 Read Track (`ppal-read-track`) {#ppal-read-track}

- Get detailed track information
- View all clips in Session and Arrangement
- List [take lanes](/features#take-lanes) and their clips (with the
  `arrangement-clips` include)
- See devices, routing options, and drum pad mappings
- Check track states (muted, soloed, armed)
- View mixer properties: gain, pan, panning mode, and send levels

<!--@include: ../_generated/ppal-read-track-schema.md-->

### 🔧 Update Track (`ppal-update-track`) {#ppal-update-track}

- Change track gain (volume), panning, and send levels
- Change mute, solo, arm, I/O routings, and monitoring state
- Change track name and color
- Update multiple tracks at once

<!--@include: ../_generated/ppal-update-track-schema.md-->

## Scene Tools

### 🔧 Create Scene (`ppal-create-scene`) {#ppal-create-scene}

- Add new scenes at any position
- Set scene name, color, tempo, and time signature
- Scenes can follow song tempo or have their own
- Ability to capture currently playing clips into a new scene

<!--@include: ../_generated/ppal-create-scene-schema.md-->

### 🔧 Read Scene (`ppal-read-scene`) {#ppal-read-scene}

- View scene details and all its clips
- Check which clips are playing/triggered
- See scene tempo and time signature

<!--@include: ../_generated/ppal-read-scene-schema.md-->

### 🔧 Update Scene (`ppal-update-scene`) {#ppal-update-scene}

- Change scene name, color, tempo, and time signature
- Update multiple scenes at once

<!--@include: ../_generated/ppal-update-scene-schema.md-->

## Clip Tools

::: info Parameters shown use the default notation

The `notes` parameter on Create Clip and Update Clip is rewritten to match the
active [notation](/features/midi-notation). The tables below show it in
`bar|beat`, the default — see [MIDI Notation](/features/midi-notation#bar-beat)
for how it reads under [MIDI JSON](/features/midi-notation#midi-json) and
[Stark](/features/midi-notation#stark).

:::

### 🔧 Create Clip (`ppal-create-clip`) {#ppal-create-clip}

- Generate MIDI clips with notes, velocities, and timing using
  [custom notation](/features#custom-music-notation)
- Place clips in Session slots or Arrangement timeline
- Place arrangement clips on [take lanes](/features#take-lanes) with a `t0/l1`
  or `t0/l+` path
- Support for probability, velocity ranges, and complex rhythms
- Apply [transforms](/features#transforms) to shape notes with math expressions
- Create audio clips from a sample file with `sampleFile`, and choose whether
  Live warps it with `warping` (see [Audio Clips](#audio-clips))
- Auto-create scenes as needed

<!--@include: ../_generated/ppal-create-clip-schema.md-->

### 🔧 Read Clip (`ppal-read-clip`) {#ppal-read-clip}

- Get detailed info about any clip in Session or Arrangement
- Read MIDI notes in [custom notation](/features#custom-music-notation) (C3,
  D#4, etc.)
- Get audio clip gain, pitch, warp settings, and sample info

<!--@include: ../_generated/ppal-read-clip-schema.md-->

### 🔧 Update Clip (`ppal-update-clip`) {#ppal-update-clip}

- Change clip name, color, and loop settings
- Add/remove MIDI notes using [custom notation](/features#custom-music-notation)
- Apply [transforms](/features#transforms) to modify existing notes and audio
  properties (use `clip.index`/`clipseq()` for per-clip variation when updating
  multiple)
- Change audio clip gain, pitch shift, and warp settings (see
  [Audio Clips](#audio-clips))
- Move clips and change their length in the Arrangement
- Split arrangement clips at specified positions
- Update multiple clips at once

<!--@include: ../_generated/ppal-update-clip-schema.md-->

### Audio Clips {#audio-clips}

A new audio clip's region comes from its sample, so `start`, `length`,
`firstStart`, and `looping` are MIDI-only on Create Clip and are ignored (with a
warning) alongside a `sampleFile`. `timeSignature` and the audio properties —
`gainDb`, `pitchShift`, `warpMode`, `warping` — do apply. On Update Clip,
`start` and `length` reshape an existing audio clip's region normally.

**Warping.** When you create an audio clip, Live decides for itself whether to
warp the sample, following your **Loop/Warp Short Samples** preference — which
no API can read, so the same call can land differently on two machines. Pass
`warping: false` to play the file exactly as recorded or rendered. Omit it and
Live still decides, but the result reports which way it went.

`warping: false` means the same thing on Create Clip and Update Clip: reset the
region to the whole file and turn looping off, which is what Live does
underneath. Two consequences on Update Clip:

- It erases a `start`/`length` sent in the same call. Reshape the region in a
  follow-up call.
- `looping: true` forces warping back on, so it vetoes a `warping: false` sent
  alongside it, and warns that it did.

**Unwarped clips are measured against the sample.** Live switches a clip's
markers from beats to seconds when warping is off, and reports an unwarped
session clip's `length` as though it were still warped. Producer Pal measures
the region from the markers instead, so a 1.2-second one-shot reads as the beats
it really occupies at your tempo rather than as 1.2 beats — which is also what
keeps [Duplicate](#ppal-duplicate) from tiling copies over audio that's still
sounding.

## Device Tools

### 🔧 Create Device (`ppal-create-device`) {#ppal-create-device}

- Add native Live devices (instruments, MIDI effects, audio effects)
- Place devices on any track type: MIDI, audio, return, or master
- Position devices at a specific index in the device chain
- Create devices inside rack chains or drum pads using path notation
- List the native Live devices
- Load a sample into a Simpler instrument via
  `params: [{name: "sample", value: "<path>"}]`, and set its level with
  `{name: "gainDb", value: <dB>}` (new in Live 12.4)

<!--@include: ../_generated/ppal-create-device-schema.md-->

### 🔧 Read Device (`ppal-read-device`) {#ppal-read-device}

- Get detailed info about any device, including inside rack chains and drum pad
  chains
- List device parameter names and values (the state of knobs, dials, etc)
- See a rack chain's own volume, pan, and sends when they're not at default

<!--@include: ../_generated/ppal-read-device-schema.md-->

### 🔧 Update Device (`ppal-update-device`) {#ppal-update-device}

- Change device name
- Change device parameter values (control knobs, dials, etc)
- Update multiple devices at once
- Move devices anywhere else in the Live Set, including into racks / wrapping in
  a new rack
- Create, load, delete, revert, and randomize rack macro variations
- A/B Compare with supported devices
- Control chain and drum pad mute and solo state
- Set a rack chain's own volume, pan, and send levels
- Change the choke group and output MIDI note of drum chains
- Move a drum pad to another pad, keeping its chain trim, choke group, and
  devices together
- Load a sample into a Simpler instrument (see
  [Create Device](#ppal-create-device) above)

<!--@include: ../_generated/ppal-update-device-schema.md-->

## Advanced Tools

### 🔧 Live API (`ppal-live-api`) {#ppal-live-api}

Direct access to the
[Ableton Live Object Model](https://docs.cycling74.com/apiref/lom/) for
scripting and debugging.

**Off by default.** Producer Pal's specialized tools are tuned for reliable
results across most models; the raw Live API is low-level and can give weaker
results out of the box, so it's hidden rather than competing with them. It's a
powerful escape hatch for scripting and advanced workflows, especially with
capable coding agents. Enable it on the **Setup** tab of the Producer Pal Max
for Live device, or programmatically via `POST /config` (the `npx producer-pal`
MCP server also accepts a `--live-api` flag). See the REST API's
[Live API section](/guide/rest-api#live-api) for the full operation reference
and examples.

<!--@include: ../_generated/ppal-live-api-schema.md-->
