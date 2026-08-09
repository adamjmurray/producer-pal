---
title: Features
description:
  Full feature list for Producer Pal, the Ableton MCP server that brings AI to
  Ableton Live — 22 tools for tracks, MIDI/audio clips, devices, and
  arrangements.
---

# Features

Producer Pal is an AI-powered music production assistant for Ableton Live — an
Ableton MCP server that lets any AI read, create, and modify your Live Set. Tell
the AI what you want and it uses more than 20 specialized tools to work with
tracks, clips, devices, and more in your Live Set.

It works with virtually any AI, including its
[built-in Chat UI](/guide/chat-ui), desktop apps like
[Claude Desktop](/installation/claude-desktop) and
[Codex](/installation/codex-app), CLI tools, and web apps.

[Get started →](/installation)

## Core Tools

### 🔧 Connect (`ppal-connect`) {#ppal-connect}

- Establish the connection with Ableton Live (required before using other tools)
- Summarizes the state of the current Live Set
- Returns a [skill set](#skills) that teaches the AI how to use Producer Pal
  effectively. Standard skills cover the full feature set.
  [Small model mode](#small-model-mode) provides simplified skills and schemas
  for less capable models.

<!--@include: ./_generated/ppal-connect-schema.md-->

### 🔧 Context (`ppal-context`) {#ppal-context}

- Read and write the three [context layers](/guide/context): project context
  (notes about this Live Set), global context (preferences that apply to every
  project), and memory (facts AI records about you as you work)

<!--@include: ./_generated/ppal-context-schema.md-->

## Session Tools

### 🔧 Playback (`ppal-playback`) {#ppal-playback}

- Start/stop playback in Session or Arrangement view
- Play specific scenes or clips
- Set loop points and playback position
- Jump to arrangement locators by ID or name
- Set loop start/end using locators
- Playback always follows the Arrangement (no per-track override)
- Stop all clips or specific clips

<!--@include: ./_generated/ppal-playback-schema.md-->

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
- Find samples that _sound_ like a seed sample with `action: "findSimilar"`, or
  group library samples with identical audio (re-shipped duplicates) with
  `action: "findDuplicates"` — both can be narrowed with the search filters

<!--@include: ./_generated/ppal-library-schema.md-->

### 🔧 Select (`ppal-select`) {#ppal-select}

- Read current selection and view state (when no arguments)
  - Returns only non-null fields: selected track, scene, clip, device
  - Rich object shapes with IDs, types, and context (slot, path, etc.)
- Update selection and return only relevant fields
  - Select any object by ID (auto-detects track/scene/clip/device)
  - Select tracks by index/category, scenes by index
  - Select clips by slot position (e.g., `0/3`)
  - Select devices by path (e.g., `t0/d1`)
  - Switch between Session and Arrangement views
  - Auto-switches to session view for scene/clipSlot selection
  - Detail views auto-managed: clip detail opens on clip selection, device
    detail on device selection

<!--@include: ./_generated/ppal-select-schema.md-->

## Action Tools

### 🔧 Delete (`ppal-delete`) {#ppal-delete}

- Remove tracks, return tracks, scenes, clips, devices, or drum pads
- Bulk delete multiple objects

<!--@include: ./_generated/ppal-delete-schema.md-->

### 🔧 Duplicate (`ppal-duplicate`) {#ppal-duplicate}

- Copy tracks, scenes, clips, or devices
- Create multiple copies at once
- Copy clips anywhere in the Session, Arrangement, or from Session to
  Arrangement
  - Position in the Arrangement by bar|beat or locator
  - Auto-tile clips to fill longer arrangement durations
- Apply [transforms](#transforms) to each duplicated clip (e.g. transpose
  copies, vary velocities) without a separate update step
- Stack MIDI variations on [take lanes](#take-lanes) with `takeLane: "new"` +
  transforms — audition alternates at the same arrangement position
- Copy devices to any track, return track, or rack chain
- Route duplicated tracks to source instrument for MIDI layering

Note: Return tracks and devices on return tracks cannot be duplicated (Live API
limitation).

<!--@include: ./_generated/ppal-duplicate-schema.md-->

## Live Set Tools

### 🔧 Read Live Set (`ppal-read-live-set`) {#ppal-read-live-set}

- Get complete Live project overview
- View all tracks, scenes, and clips at once
- See tempo, time signature, and scale settings
- View arrangement locators with times and names
- Check what's playing and track states

<!--@include: ./_generated/ppal-read-live-set-schema.md-->

### 🔧 Update Live Set (`ppal-update-live-set`) {#ppal-update-live-set}

- Change tempo, time signature, scale
- Create, rename, or delete arrangement locators

<!--@include: ./_generated/ppal-update-live-set-schema.md-->

## Track Tools

### 🔧 Create Track (`ppal-create-track`) {#ppal-create-track}

- Add MIDI, audio, or return tracks
- Position tracks exactly where you want
- Set initial mute/solo/arm states

<!--@include: ./_generated/ppal-create-track-schema.md-->

### 🔧 Read Track (`ppal-read-track`) {#ppal-read-track}

- Get detailed track information
- View all clips in Session and Arrangement
- List [take lanes](#take-lanes) and their clips (with the `arrangement-clips`
  include)
- See devices, routing options, and drum pad mappings
- Check track states (muted, soloed, armed)
- View mixer properties: gain, pan, panning mode, and send levels

<!--@include: ./_generated/ppal-read-track-schema.md-->

### 🔧 Update Track (`ppal-update-track`) {#ppal-update-track}

- Change track gain (volume), panning, and send levels
- Change mute, solo, arm, I/O routings, and monitoring state
- Change track name and color
- Update multiple tracks at once

<!--@include: ./_generated/ppal-update-track-schema.md-->

## Scene Tools

### 🔧 Create Scene (`ppal-create-scene`) {#ppal-create-scene}

- Add new scenes at any position
- Set scene name, color, tempo, and time signature
- Scenes can follow song tempo or have their own
- Ability to capture currently playing clips into a new scene

<!--@include: ./_generated/ppal-create-scene-schema.md-->

### 🔧 Read Scene (`ppal-read-scene`) {#ppal-read-scene}

- View scene details and all its clips
- Check which clips are playing/triggered
- See scene tempo and time signature

<!--@include: ./_generated/ppal-read-scene-schema.md-->

### 🔧 Update Scene (`ppal-update-scene`) {#ppal-update-scene}

- Change scene name, color, tempo, and time signature
- Update multiple scenes at once

<!--@include: ./_generated/ppal-update-scene-schema.md-->

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
  [custom notation](#custom-music-notation)
- Place clips in Session slots or Arrangement timeline
- Place arrangement clips on [take lanes](#take-lanes) with `takeLane`
- Support for probability, velocity ranges, and complex rhythms
- Apply [transforms](#transforms) to shape notes with math expressions
- Create audio clips from a sample file with `sampleFile`, and choose whether
  Live warps it with `warping` (see [Audio Clips](#audio-clips))
- Auto-create scenes as needed

<!--@include: ./_generated/ppal-create-clip-schema.md-->

### 🔧 Read Clip (`ppal-read-clip`) {#ppal-read-clip}

- Get detailed info about any clip in Session or Arrangement
- Read MIDI notes in [custom notation](#custom-music-notation) (C3, D#4, etc.)
- Get audio clip gain, pitch, warp settings, and sample info

<!--@include: ./_generated/ppal-read-clip-schema.md-->

### 🔧 Update Clip (`ppal-update-clip`) {#ppal-update-clip}

- Change clip name, color, and loop settings
- Add/remove MIDI notes using [custom notation](#custom-music-notation)
- Apply [transforms](#transforms) to modify existing notes and audio properties
  (use `clip.index`/`clipseq()` for per-clip variation when updating multiple)
- Change audio clip gain, pitch shift, and warp settings (see
  [Audio Clips](#audio-clips))
- Move clips and change their length in the Arrangement
- Split arrangement clips at specified positions
- Update multiple clips at once

<!--@include: ./_generated/ppal-update-clip-schema.md-->

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

<!--@include: ./_generated/ppal-create-device-schema.md-->

### 🔧 Read Device (`ppal-read-device`) {#ppal-read-device}

- Get detailed info about any device, including inside rack chains and drum pad
  chains
- List device parameter names and values (the state of knobs, dials, etc)

<!--@include: ./_generated/ppal-read-device-schema.md-->

### 🔧 Update Device (`ppal-update-device`) {#ppal-update-device}

- Change device name
- Change device parameter values (control knobs, dials, etc)
- Update multiple devices at once
- Move devices anywhere else in the Live Set, including into racks / wrapping in
  a new rack
- Create, load, delete, revert, and randomize rack macro variations
- A/B Compare with supported devices
- Control chain and drum pad mute and solo state
- Change the choke group and output MIDI note of drum chains
- Load a sample into a Simpler instrument (see
  [Create Device](#ppal-create-device) above)

<!--@include: ./_generated/ppal-update-device-schema.md-->

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

<!--@include: ./_generated/ppal-live-api-schema.md-->

## MIDI Notation {#custom-music-notation}

Producer Pal gives the AI a text-based music notation to compose in, rather than
raw MIDI note data. Used by [Create Clip](#ppal-create-clip),
[Update Clip](#ppal-update-clip), and [Read Clip](#ppal-read-clip). It helps
LLMs translate natural language expressions of time to the correct time
positions in Ableton Live clips and the arrangement timeline.

Three notations are available, chosen by a global device setting:

- **[`bar|beat`](/features/midi-notation#bar-beat)** — the default. Compact and
  expressive: pitches are names (`C3`, `F#4`), time is `bar|beat` (`1|1`,
  `2|3`), durations are note values (`n/4`, `n/8`), plus velocity ranges,
  probability, and bar copying.
- **[MIDI JSON](/features/midi-notation#midi-json)** — notes as a compact JSON
  array. The most exact, and the easiest for coding agents to generate and
  parse.
- **[Stark](/features/midi-notation#stark)** — a literal, round-trippable
  notation with chord symbols and event-based drum lines, friendly to small and
  local models.

[Read the full notation guide →](/features/midi-notation)

## Transforms {#transforms}

Apply complex changes to clips using math expressions via
[Create Clip](#ppal-create-clip), [Update Clip](#ppal-update-clip), and
[Duplicate](#ppal-duplicate). Transforms work the same way in every notation.
When updating or duplicating multiple clips at once, one transform string
broadcasts across every clip/copy — use `clip.index` arithmetic or `clipseq()`
inside the string for per-clip variation:

- **Transform MIDI notes**: velocity, pitch, timing, duration, probability
- **Transform audio clips**: gain, pitch shift
- **Shapes**: LFO waveforms (`sin`, `cos`, `tri`, `saw`, `square`), ramps,
  curves, randomization with arbitrary ranges, choose from sets of values (e.g.
  chord notes)
- **Context variables**: Access note order (`note.index`), clip metadata
  (`clip.duration`, `clip.index`, `clip.position`) in expressions
- **Selectors**: Target specific pitch ranges (e.g., `C3:`, `C3-C5:`) or time
  ranges (e.g., `1|1-2|4:`), or both in either order (e.g., `C3 1|1-2|4:` or
  `1|1-2|4 C3:`)

[Read the full transforms guide →](/features/midi-notation#transforms)

## Take Lanes {#take-lanes}

Live's take lanes stack alternate versions of an arrangement clip at the same
position — only the active take plays. They're the natural way to audition
variations side by side without cluttering the timeline.

- Target a lane with `takeLane` on [Create Clip](#ppal-create-clip) and
  [Duplicate](#ppal-duplicate): `0` (or omit) = main lane, `1+` = that lane
  (auto-created up to it), `"new"` = append a fresh lane.
- Generate variations with a few [Duplicate](#ppal-duplicate) calls using
  `takeLane: "new"` plus [transforms](#transforms) to vary each copy.
- Name a newly created lane with `takeLaneName`.
- [Read Track](#ppal-read-track) lists take lanes (with the `arrangement-clips`
  include).
- Limits: 8 take lanes per track. Duplicating to a take lane is MIDI-only and
  recreates the clip from notes, so envelope automation isn't preserved. Once
  placed, take-lane clips are append-only — they can't be split, moved, resized,
  deleted, or promoted back to the main lane through tools, and Producer Pal
  can't pick the active take. All of that stays in Live's UI. Expand the
  take-lane arrow on a track header to see them.

## Network Control

Control Ableton Live from another computer on your local network, no extra setup
required. For fully remote control, use
[web tunnels](/installation/web-tunnels).

## Limitations

- **Automation and envelopes are not supported.** Producer Pal cannot read,
  create, or edit arrangement automation or clip envelopes — parameter values
  that change over time. Track and device parameters like volume, pan, sends,
  and knobs can be set to static values, but not automated.
- **VST/AU plug-in internals can't be controlled directly.** Producer Pal can
  open or close a plug-in's editor window, but it cannot read or set the
  parameters inside a third-party VST/AU plug-in. To control them, map the
  parameters onto the Live plug-in device using Live's
  [Configure mode](https://www.ableton.com/live-manual/12/working-with-instruments-and-effects/#plug-in-configure-mode)
  (expand the device, click "Configure", then click the controls you want in the
  plug-in's window); Producer Pal can then set those mapped parameters like any
  other device parameter. You map them yourself — up to 128 parameters, and not
  every plug-in parameter is mappable, so pick the ones that matter most.
- **Audio content can't be analyzed or generated.** Producer Pal can manage
  audio clips — set gain, pitch, and warp settings, change clip length, arrange
  clips in the Arrangement, and load and manage samples on Simpler instruments
  (including Drum Rack pads) — but it cannot listen to, analyze, or transcribe
  the audio itself (no detecting notes, key, or tempo from a waveform; no
  audio-to-MIDI), nor synthesize audio from scratch. These are common requests
  and are under consideration for a future release.
- **One Drum Rack per track.** Drum Racks work in nested structures, but tracks
  with multiple Drum Racks only use the first one's drum map. Use one Drum Rack
  per track for predictable results.

## Small Model Mode {#small-model-mode}

Adapts Producer Pal for less capable AI models by returning simplified
[skills](#skills) and removing advanced parameters from tool schemas. This is an
ongoing R&D effort aimed at making [local models](/installation/choose-local)
viable for completely offline, free, and private usage. Enable it on the
[device's Setup tab](/guide/device#behavior), in the [Chat UI](/guide/chat-ui)
settings, or via the [`--small-model-mode` flag](/guide/npx-cli#flags) — like
[notation](/features/midi-notation), it's a global device setting that applies
to MCP clients too. It's also the biggest reduction in what a conversation
costs; see [Optimizing](/guide/optimizing#small-model-mode) for the trade-off.

## Choosing a Toolset {#toolset}

You don't have to run every tool. Withholding one drops its schema _and_ the
part of the [skills](#skills) that teaches it, so a narrower toolset makes every
conversation cheaper — `read-only` alone cuts the schemas and skills by 62%.
Worth doing if you only ever use part of Producer Pal, or if you're running a
[small/local model](/installation/choose-local) that does better with a short
tool list. See [Optimizing](/guide/optimizing) for the numbers and the other
levers.

::: info Counting the tools

There are **21 tools on by default**. Two more are experimental and opt-in:
[Direct Live API](#ppal-live-api) and [Subagent](#subagents). The Chat UI counts
all 23, so it reads `21/23` out of the box. An MCP client sees 22 — Subagent is
client-side and never appears in `listTools`.

:::

Where you set it depends on the client:

- **[Chat UI](/guide/chat-ui#tools)** — the Tools tab, per conversation and per
  [preset](/guide/chat-ui#presets).
- **MCP clients via [`npx producer-pal`](/guide/npx-cli#toolset)** — the
  `--tools` and `--disable-tools` flags. Run `npx producer-pal --list-tools` for
  the group names and the tools your device currently offers.
- **[Claude Desktop](/installation/claude-desktop)** — the extension's **Tools**
  and **Disable tools** settings.
- **[REST API](/guide/rest-api#per-request-toolset)** — the
  `x-producer-pal-disabled-tools` header, per request. This is also what the
  [Agent Skill](/guide/skills)'s `--disable-tools` flag sends.

These are per client, unlike [notation](/features/midi-notation) and
[small model mode](#small-model-mode): narrowing one client's toolset leaves the
Chat UI and everything else alone. Each of the clients above keeps
`ppal-connect`, since it is how the AI connects and receives the skills — only
the raw header lets you drop it.

## Subagents {#subagents}

In the [Chat UI](/guide/chat-ui#tools), AI can hand a self-contained task to a
nested assistant working in the same Live Set — plan a track's arrangement, then
delegate each part and check the results. Independent tasks run in parallel, and
a subagent can be given follow-up work rather than replaced by a fresh one.

The point is cost and context as much as speed: a worker's transcript never
enters the main conversation, only its final answer, and each worker can run a
cheaper model with a narrower toolset than the assistant directing it. That
pairing is what [presets](/guide/chat-ui#presets) are for — a named bundle of
provider, model, tool set, and notation, with one designated as what subagents
run as. This is experimental and off by default.

[Set up subagents →](/guide/chat-ui#tools)

## Skills {#skills}

The [Connect tool](#ppal-connect) returns a skill set that teaches the AI how to
use Producer Pal's [notation](/features/midi-notation),
[transforms](/features/midi-notation#transforms), device paths, and other
conventions. It's sent to external MCP clients in the `ppal-connect` result and
used by the built-in [Chat UI](/guide/chat-ui) on every conversation.

The exact text depends on the active [notation](/features/midi-notation) and on
[small model mode](#small-model-mode) — six combinations in all — so rather than
reproduce them here:

- **Read them** in the Chat UI's [Skills tab](/guide/context#skills) →
  **Preview**, which assembles the whole document for any notation and model
  size, with your own overrides applied. A ★ marks the combination your current
  settings use, and a size readout shows what it costs you per conversation.
- **Change them** — every fragment can be overridden or dropped. See
  [Customizing Skills](/guide/customizing-skills).
- **Browse the source** in
  [`src/skills/`](https://github.com/adamjmurray/producer-pal/tree/main/src/skills)
  on GitHub.

### Agent Skill (for coding agents) {#agent-skill}

Not to be confused with the skills above: an **[Agent Skill](/guide/skills)** is
the portable `SKILL.md` convention that Claude Code, Codex CLI, and Gemini CLI
share. Producer Pal ships one — a drop-in folder that drives the
[REST API](/guide/rest-api), so a coding agent can control Ableton Live with no
MCP client at all.

It stays a thin bootstrap rather than a copy of the guidance: it tells the agent
to call [`ppal-connect`](#ppal-connect) first, which returns the same skill set
described above. So the two fit together — the Agent Skill is _how_ a coding
agent reaches Producer Pal, and the skills it loads on connect are _what_ it
learns. New tools and skill updates land in that response automatically, and the
`SKILL.md` never needs to change.

[Set up the Agent Skill →](/guide/skills)
