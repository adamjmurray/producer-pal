---
title: Features
description:
  Full feature list for Producer Pal, the Ableton MCP server that brings AI to
  Ableton Live — 26 tools for tracks, MIDI/audio clips, devices, arrangements,
  and computer-use runbooks.
---

# Features

Producer Pal is an AI-powered music production assistant for Ableton Live — an
Ableton MCP server that lets any AI read, create, and modify your Live Set. Tell
the AI what you want and it uses 26 specialized tools to read, create, and
modify tracks, clips, devices, and to drive Live's UI-only workflows (Export,
Record, Max-for-Live device loading) via computer-use runbooks.

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

- Read and write project memory — persistent notes that help the AI understand
  your goals across conversations

<!--@include: ./_generated/ppal-context-schema.md-->

## Session Tools

### 🔧 Playback (`ppal-playback`) {#ppal-playback}

- Start/stop playback in Session or Arrangement view
- Play specific scenes or clips
- Set loop points and playback position
- Jump to arrangement locators by ID or name
- Set loop start/end using locators
- Control which tracks follow the Arrangement
- Stop all clips or specific track clips

<!--@include: ./_generated/ppal-playback-schema.md-->

### 🔧 Library (`ppal-library`) {#ppal-library}

- Search Live's browser library by name, tags, content kind, device kind, or
  source category (User Library, Pack, Built-in, Cloud, Plugin)
- Also includes the user-configured sample folder when set, with results merged
  and de-duplicated against Live's library
- Sort by `use_count` (Live's persistent usage counter — surfaces what you
  actually use most), `mod_date`, or `name`
- Enumerate available tags with `action: "listTags"` so the AI can discover the
  tag vocabulary on your machine

<!--@include: ./_generated/ppal-library-schema.md-->

### 🔧 Select (`ppal-select`) {#ppal-select}

- Read current selection and view state (when no arguments)
  - Returns only non-null fields: selected track, scene, clip, device
  - Rich object shapes with IDs, types, and context (slot, path, etc.)
- Update selection and returns only relevant fields
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

- Remove tracks, return tracks, scenes, clips, or devices
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

### 🔧 Create Clip (`ppal-create-clip`) {#ppal-create-clip}

- Generate MIDI clips with notes, velocities, and timing using
  [custom notation](#custom-music-notation)
- Place clips in Session slots or Arrangement timeline
- Place arrangement clips on [take lanes](#take-lanes) with `takeLane`
- Support for probability, velocity ranges, and complex rhythms
- Apply [transforms](#transforms) to shape notes with math expressions
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
  (a different transform per clip when updating multiple)
- Change audio clip gain, pitch shift, and warp settings
- Move clips and change their length in the Arrangement
- Split arrangement clips at specified positions
- Update multiple clips at once

<!--@include: ./_generated/ppal-update-clip-schema.md-->

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
- Create, load, delete, and randomize rack macros variations
- A/B Compare with supported devices
- Control chain and drum pad mute and solo state
- Change the choke group and output MIDI note of drum chains
- Load a sample into a Simpler instrument via
  `params: [{name: "sample", value: "<path>"}]`, and set its level with
  `{name: "gainDb", value: <dB>}` (new in Live 12.4)

<!--@include: ./_generated/ppal-update-device-schema.md-->

## Advanced Tools

### 🔧 Live API (`ppal-live-api`) {#ppal-live-api}

Direct access to the
[Ableton Live Object Model](https://docs.cycling74.com/apiref/lom/) for
scripting and debugging.

**Off by default.** Producer Pal's specialized tools are tuned for reliable
results across most models. The raw Live API is low-level and can give weaker
results out of the box, so it's hidden rather than competing with the focused
tools. It's a powerful escape hatch for scripting and advanced workflows,
especially with capable coding agents. Enable it on the **Setup** tab of the
Producer Pal Max for Live device. When disabled, MCP clients and the
[REST API](/guide/rest-api) both stop seeing the tool. See the
[REST API Live API section](/guide/rest-api#live-api) for the full operation
reference and examples.

<!--@include: ./_generated/ppal-live-api-schema.md-->

## Runbook Tools {#runbook-tools}

Runbook tools return a deterministic computer-use step plan that the caller
executes via `mcp__computer-use__*`. They do not call the Live API and do not
write to disk — they are pure recipe generators. This is the bridge between
Producer Pal's LOM-level tools and Ableton workflows that live entirely in
Live's UI (Export dialog, Arrangement recording, Max-for-Live device loading).

Each tool returns `{ steps, failModes, verify, meta }` as JSON:

- `steps` — ordered list of primitives: `screenshot`, `left_click`, `key`,
  `type`, `wait`, plus `left_mouse_down`/`mouse_move`/`left_mouse_up` for drag
  composition
- `failModes` — documented failure scenarios with detect/recovery pairs
- `verify` — post-execution checks (file existence, audio length, etc.)
- `meta` — version, locale, estimated duration

The caller (any AI agent with computer-use access) is expected to consume the
JSON, run the steps, and re-invoke the tool with corrections if a failMode
fires. Producer Pal itself never touches the desktop.

### 🔧 Render Export (`ppal-render-export`) {#ppal-render-export}

- Generate a computer-use step plan that drives Ableton Live's Export
  Audio/Video dialog (`Cmd+Shift+R`)
- Format, render range, returns/master, loop, mono, normalize, and analysis-file
  toggles (bit depth, dither, and sample rate are not exposed by this runbook —
  the caller relies on Live's current dialog defaults)
- Save target is a fully qualified path (filename + extension); the recipe
  drives the macOS save sheet via `Cmd+Shift+G`
- macOS locale hint (`abletonLocale`) selects between pixel-anchor sets when
  Live's UI is not in English/German
- 8 documented `failModes` (dialog never opens, dropdown stuck, save sheet
  missing, "File exists" prompt, render-range zero, locale drift, Beta bounce
  warning, save path inexistent)

Workflow example:

```
1. ppal-update-live-set { tempo: 124 }                 → set tempo via LOM
2. ppal-render-export   { destPath, renderStart,       → returns step-plan JSON
                          renderLength, format: "wav" }
3. Agent executes steps via mcp__computer-use__*       → drives the dialog
4. Agent reads verify checks: file exists, length ≈ renderLength
```

Render-Bracket-Position (start/length) is passed to `ppal-render-export`
directly via `renderStart`/`renderLength`; if omitted, the recipe relies on
Live's current Insert Marker and Loop bracket.

| Fail mode            | Detect                                  | Recovery                                |
| -------------------- | --------------------------------------- | --------------------------------------- |
| Dialog doesn't open  | Screenshot after step 2 lacks the title | Re-focus Live, re-fire `Cmd+Shift+R`    |
| Dropdown stuck open  | Dropdown still expanded in screenshot   | Click list item (never press Escape)    |
| Save sheet missing   | No native macOS file dialog             | Render-range too short — set explicitly |
| "File exists" sheet  | Modal blocks export                     | Cancel, choose new filename             |
| Beta bounce warning  | Modal "Bounce engine" dialog            | User decision — never auto-dismiss      |
| Render length zero   | UI shows `0.0.0`                        | Pass `renderLength` explicitly          |
| Save path inexistent | Save dialog: "path does not exist"      | Re-fire `Cmd+Shift+G`, set parent dir   |
| Locale drift         | Pixel anchors miss                      | Set `abletonLocale="unknown"`, ask user |

<!--@include: ./_generated/ppal-render-export-schema.md-->

### 🔧 Record Arrangement (`ppal-record-arrangement`) {#ppal-record-arrangement}

- Generate a computer-use step plan to arm the Arrangement transport, click the
  Record button, optionally wait for a fixed duration, then stop via Spacebar
- Optional `saveAfter` step: `none`, `save` (existing path), or `save-as`
  (drives `Cmd+Shift+S` with explicit save path)
- Pre-flight assertion: `view: 'arrangement'` emits a screenshot anchor so the
  caller can verify Live is in Arrangement view before recording. The recipe
  never auto-presses Tab — Tab is a toggle and would be unsafe; the caller
  dispatches Tab if needed
- Locale-aware: shortcut-driven where possible, pixel anchors fall back to the
  same `abletonLocale` hint as the Export tool

Workflow example:

```
1. ppal-update-track { ids: "<id>", arm: true }     → arm target track via LOM
2. ppal-record-arrangement { durationSeconds: 32,   → returns step-plan JSON
                              saveAfter: "save" }
3. Agent executes: click Record button, wait 32s, Spacebar stops, Cmd+S
4. Caller checks verify.transportShouldBeStopped + setDirty
```

`durationSeconds` is what triggers the recipe to emit the wait + Spacebar-stop
steps. Without it the recipe leaves the transport running and the caller is
expected to stop it manually — `saveAfter` is then a no-op.

| Fail mode                       | Detect                           | Recovery                                                  |
| ------------------------------- | -------------------------------- | --------------------------------------------------------- |
| No armed track                  | Empty arrangement                | Call `ppal-update-track { ids:"<id>", arm:true }` first   |
| Record button click miss        | Record lamp stays gray           | Re-click button                                           |
| Save dialog despite `save`      | First-save case                  | Caller falls back to `save-as`                            |
| Recording keeps running         | Record lamp still red after Stop | Second Spacebar or click Record button again              |
| Locale drift                    | Pixel anchors miss               | Set `abletonLocale="unknown"`                             |
| `savePath` missing on `save-as` | `meta.notes` flags it            | No save steps emitted; re-invoke with explicit `savePath` |
| Session view still active       | Tab needed — but Tab is a toggle | Recipe screenshot-verifies before Tab                     |

<!--@include: ./_generated/ppal-record-arrangement-schema.md-->

### 🔧 Load Max-for-Live Device (`ppal-load-m4l-device`) {#ppal-load-m4l-device}

- Generate a computer-use step plan that opens Live's Browser, navigates to a
  Max-for-Live category (`max-instrument`, `max-audio-effect`,
  `max-midi-effect`, or `user`), locates an `.amxd` device by name, and drags it
  onto a target track
- Drag primitives encode the Welle-3 Settle-Timing lesson: 0.55s pause after
  `mouse_down`, 0.35s pause before `mouse_up` — `left_click_drag` is too fast
  for Browser→Track drops and routinely misses
- Optional explicit `dropX`/`dropY` overrides the computed track-header pixel
  for non-standard track-list layouts
- Returns the same `{steps, failModes, verify, meta}` envelope; `verify` echoes
  the expected device-name and category so the caller can cross- check against
  `ppal-read-device` after the drop

Workflow example:

```
1. ppal-create-track { type: "midi" }      → create empty track via LOM
2. ppal-load-m4l-device { category: "max-instrument", deviceName: "Producer_Pal" }
3. Agent executes drag: browser → track header
4. ppal-read-track                          → verify device added
```

| Fail mode                    | Detect                   | Recovery                              |
| ---------------------------- | ------------------------ | ------------------------------------- |
| Browser pane closed          | No browser visible       | `Cmd+Alt+B` shortcut to toggle        |
| Category click misses        | Labels shift with scroll | Scroll category list to top first     |
| Drop on empty timeline       | Wrong track-header pixel | Supply explicit `dropX`/`dropY`       |
| `.amxd` not in category      | Search returns empty     | Switch category (`user` if user lib)  |
| Live shows compilation modal | M4L is recompiling       | Wait and surface — never auto-dismiss |
| Macro defaults differ        | Out of scope             | `ppal-update-device` after load       |

<!--@include: ./_generated/ppal-load-m4l-device-schema.md-->

### 🔧 Open Device Window (`ppal-open-device-window`) {#ppal-open-device-window}

- Generate a computer-use step plan that opens a device's floating plugin editor
  window (VST/AU/Max-for-Live) in Live's Device View — the Live API cannot pop a
  plugin window, so this is a UI gesture
- Compose with `ppal-select` (devicePath) FIRST so Live scrolls the device into
  the Device View; this recipe only emits the show-window click + verify
- `verify` is vision-only — no Live API exposes a plugin window's open state, so
  confirmation is via the post-click screenshot
- A single click toggles the plugin window (recon-verified against
  ValhallaVintageVerb AU); the default click anchor is recon-verified but
  set-dependent (x depends on device order/scroll — surfaced in `meta.notes`).
  Inspect the selection screenshot and pass explicit `editX`/`editY` when the
  Device-View layout differs (supplied as a pair — a half-override throws)
- Native Live devices have no floating window (they live inline in the Device
  View); filter them out via the device `type` from `ppal-read-live-set` /
  `ppal-read-device`
- Returns the same `{steps, failModes, verify, meta}` envelope

Workflow example:

```
1. ppal-read-live-set { include: ["tracks","devices"] }  → find the device path
2. ppal-select { devicePath: "t0/d1" }                    → scroll device into view (LOM)
3. ppal-open-device-window { devicePath: "t0/d1" }        → returns step-plan JSON
4. Agent executes: screenshot, click show-window button, screenshot
```

| Fail mode                          | Detect                           | Recovery                                              |
| ---------------------------------- | -------------------------------- | ----------------------------------------------------- |
| Native device has no window        | Device type is a built-in        | No-op — do not run this recipe for native devices     |
| Window opens behind Live           | No floating window in screenshot | Raise via `open_application` / app switcher           |
| Device not selected / off-screen   | Wrong device highlighted         | Run `ppal-select` on the devicePath first             |
| Click misses show-window toggle    | No editor and no visual change   | Unfold/scroll device, supply explicit `editX`/`editY` |
| Set-dependent layout shifts anchor | Click hits wrong device          | Pass explicit `editX`/`editY` from the screenshot     |

<!--@include: ./_generated/ppal-open-device-window-schema.md-->

## Custom Music Notation {#custom-music-notation}

Producer Pal uses a text-based music notation syntax called `bar|beat` to work
with MIDI clips. Used by [Create Clip](#ppal-create-clip),
[Update Clip](#ppal-update-clip), and [Read Clip](#ppal-read-clip). It helps
LLMs translate natural language expressions of time to the correct time
positions in Ableton Live clips and the arrangement timeline.

- **Pitches**: Standard notation (C3 = middle C, F#4, Bb2, etc.)
- **Time positions**: bar|beat format (1|1 = first beat, 2|3 = bar 2, beat 3)
- **Durations**: bar:beat format (4:0 = 4 bars, 1:2 = 1 bar + 2 beats)
- **Velocity**: Values from 1-127 (or ranges like 80-100)
- **Probability**: 0.0 to 1.0 (1.0 = always plays)
- **Bar copying**: Copy bars with `@2=1` (bar 1→2), ranges with `@2-8=1` (bar
  1→bars 2-8), or tile patterns with `@3-10=1-2` (repeat 2-bar pattern across
  bars 3-10)

## Transforms {#transforms}

Apply complex changes to clips using math expressions via
[Create Clip](#ppal-create-clip), [Update Clip](#ppal-update-clip), and
[Duplicate](#ppal-duplicate). When updating or duplicating multiple clips at
once, each clip or copy can get its own transform:

- **Transform MIDI notes**: velocity, pitch, timing, duration, probability
- **Transform audio clips**: gain, pitch shift
- **Shapes**: LFO waveforms (sine, tri, saw), ramps, curves, randomization with
  arbitrary ranges, choose from sets of values (e.g. chord notes)
- **Context variables**: Access note order (`note.index`), clip metadata
  (`clip.duration`, `clip.index`, `clip.position`, `clip.barDuration`) in
  expressions
- **Selectors**: Target specific pitch ranges (e.g., `C3:`, `C3-C5:`) or time
  ranges (e.g., `1|1-2|4:`), or both in either order (e.g., `C3 1|1-2|4:` or
  `1|1-2|4 C3:`)

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
- **One Drum Rack per track.** Drum Racks work in nested structures, but tracks
  with multiple Drum Racks only use the first one's drum map. Use one Drum Rack
  per track for predictable results.

## Small Model Mode {#small-model-mode}

Adapts Producer Pal for less capable AI models by returning simplified
[skills](#skills) and removing advanced parameters from tool schemas. This is an
ongoing R&D effort aimed at making [local models](/installation/choose-local)
viable for completely offline, free, and private usage. Enable it in the
[Chat UI](/guide/chat-ui) settings or with `--small-model-mode` on the command
line.

## Skills {#skills}

The [Connect tool](#ppal-connect) returns a skill set that teaches the AI how to
use Producer Pal's [custom notation](#custom-music-notation),
[transforms](#transforms), device paths, and other conventions. Two variants are
available depending on [small model mode](#small-model-mode):

<!--@include: ./_generated/skills-standard.md-->

<!--@include: ./_generated/skills-basic.md-->
