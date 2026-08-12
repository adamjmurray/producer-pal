---
title: Features
description:
  Full feature list for Producer Pal, the Ableton MCP server that brings AI to
  Ableton Live — 21 tools for tracks, MIDI/audio clips, devices, and
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
[ChatGPT](/installation/chatgpt-app), CLI tools, and web apps. Coding agents can
use the portable [Agent Skill](/guide/skills) instead of MCP, and the
[REST API](/guide/rest-api) exposes the same tools over plain HTTP with no AI in
the loop.

[Get started →](/installation)

## What It Can Do

- **Tracks and mixing** — add MIDI, audio, and return tracks; set gain, pan,
  sends, routing, monitoring, mute/solo/arm, names, and colors.
  [Track tools →](/features/tools#track-tools)
- **MIDI clips** — write and edit notes in a
  [text notation](#custom-music-notation) built for language models, with
  velocity ranges, probability, and complex rhythms, then reshape them with
  [transforms](#transforms). [Clip tools →](/features/tools#clip-tools)
- **Audio clips** — place samples, set gain, pitch shift, and warp settings,
  reshape the region, and arrange them on the timeline. Producer Pal manages
  audio but can't listen to it — see [Limitations](#limitations).
  [Clip tools →](/features/tools#clip-tools)
- **Arrangement** — place, move, split, and tile clips along the timeline, work
  with locators, and stack alternates on [take lanes](#take-lanes).
  [Duplicate →](/features/tools#ppal-duplicate)
- **Session view** — create scenes, capture what's playing into a new one, and
  give a scene its own tempo and time signature.
  [Scene tools →](/features/tools#scene-tools)
- **Devices and instruments** — add and control native Live instruments and
  effects, build Drum Racks and Simpler instruments from samples, move devices
  into racks, and drive macro variations. Third-party VST/AU plug-ins need a
  mapping step first — see [Limitations](#limitations).
  [Device tools →](/features/tools#device-tools)
- **Library** — search Live's browser by name or tag, browse its category
  taxonomy, rank samples by similarity to a seed sample, and list installed
  plug-ins (Live 12.4+). Your own sample folder is searched by name.
  [Library →](/features/tools#ppal-library)
- **Playback** — start and stop Session or Arrangement playback, launch clips
  and scenes, set loop points, and jump to locators.
  [Playback →](/features/tools#ppal-playback)
- **Project settings and overview** — read every track and scene in one call,
  with a clip count per track; change tempo, time signature, and scale.
  [Live Set tools →](/features/tools#live-set-tools)
- **Context & memory** — project notes, global preferences, and memory the AI
  builds as you work. [Context & Memory →](/guide/context)

Every tool, with its full parameter list:
**[Tool Reference →](/features/tools)**

## MIDI Notation {#custom-music-notation}

Producer Pal gives the AI a text-based music notation to compose in, rather than
raw MIDI note data. Used by [Create Clip](/features/tools#ppal-create-clip),
[Update Clip](/features/tools#ppal-update-clip), and
[Read Clip](/features/tools#ppal-read-clip). It helps LLMs translate natural
language expressions of time to the correct time positions in Ableton Live clips
and the arrangement timeline.

Three notations are available. The device setting picks the default, and a
client can [override it per request](/guide/rest-api#per-request-notation):

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
[Create Clip](/features/tools#ppal-create-clip),
[Update Clip](/features/tools#ppal-update-clip), and
[Duplicate](/features/tools#ppal-duplicate). Transforms work the same way in
every notation. When updating or duplicating multiple clips at once, one
transform string broadcasts across every clip/copy — use `clip.index` arithmetic
or `clipseq()` inside the string for per-clip variation:

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

- Target a lane with `takeLane` on
  [Create Clip](/features/tools#ppal-create-clip) and
  [Duplicate](/features/tools#ppal-duplicate): `0` (or omit) = main lane, `1+` =
  that lane (auto-created up to it), `"new"` = append a fresh lane.
- Generate variations with a few [Duplicate](/features/tools#ppal-duplicate)
  calls using `takeLane: "new"` plus [transforms](#transforms) to vary each
  copy.
- Name a newly created lane with `takeLaneName`.
- [Read Track](/features/tools#ppal-read-track) lists take lanes (with the
  `arrangement-clips` include).
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
[notation](/features/midi-notation), that's a global default MCP clients pick up
too, and a single client can
[override it per request](/guide/rest-api#per-request-small-model-mode). It's
also the biggest reduction in what a conversation costs; see
[Optimizing](/guide/optimizing#small-model-mode) for the trade-off.

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
[Direct Live API](/features/tools#ppal-live-api) and [Subagent](#subagents). The
Chat UI counts all 23, so it reads `21/23` out of the box. An MCP client sees 21
— Subagent is client-side and never appears in `listTools`, and Direct Live API
is only registered when the device flag is on (which makes it 22).

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

All of these are per client, so narrowing one client's toolset leaves the Chat
UI and everything else alone — as do the
[notation and small-model-mode headers](/guide/rest-api#per-request-settings)
that travel with it. Each of the clients above keeps `ppal-connect`, since it is
how the AI connects and receives the skills — only the raw header lets you drop
it.

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

The [Connect tool](/features/tools#ppal-connect) returns a skill set that
teaches the AI how to use Producer Pal's [notation](/features/midi-notation),
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
to call [`ppal-connect`](/features/tools#ppal-connect) first, which returns the
same skill set described above. So the two fit together — the Agent Skill is
_how_ a coding agent reaches Producer Pal, and the skills it loads on connect
are _what_ it learns. New tools and skill updates land in that response
automatically, and the `SKILL.md` never needs to change.

[Set up the Agent Skill →](/guide/skills)
