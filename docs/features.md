# Features

Producer Pal is an AI-powered music production assistant for Ableton Live. Tell
the AI what you want and it uses 20 specialized tools to read, create, and
modify tracks, clips, devices, and more in your Live Set.

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
- Search configured sample folder for audio files by filename or path

<!--@include: ./_generated/ppal-context-schema.md-->

## Transport Tools

### 🔧 Playback (`ppal-playback`) {#ppal-playback}

- Start/stop playback in Session or Arrangement view
- Play specific scenes or clips
- Set loop points and playback position
- Jump to arrangement locators by ID or name
- Set loop start/end using locators
- Control which tracks follow the Arrangement
- Stop all clips or specific track clips

<!--@include: ./_generated/ppal-playback-schema.md-->

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

## Device Tools

### 🔧 Create Device (`ppal-create-device`) {#ppal-create-device}

- Add native Live devices (instruments, MIDI effects, audio effects)
- Place devices on any track type: MIDI, audio, return, or master
- Position devices at a specific index in the device chain
- Create devices inside rack chains or drum pads using path notation
- List the native Live devices

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

<!--@include: ./_generated/ppal-update-device-schema.md-->

## Clip Tools

### 🔧 Create Clip (`ppal-create-clip`) {#ppal-create-clip}

- Generate MIDI clips with notes, velocities, and timing using
  [custom notation](#custom-music-notation)
- Place clips in Session slots or Arrangement timeline
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
- Change audio clip gain, pitch shift, and warp settings
- Move clips and change their length in the Arrangement
- Split arrangement clips at specified positions
- Update multiple clips at once

<!--@include: ./_generated/ppal-update-clip-schema.md-->

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
- Copy devices to any track, return track, or rack chain
- Route duplicated tracks to source instrument for MIDI layering

Note: Return tracks and devices on return tracks cannot be duplicated (Live API
limitation).

<!--@include: ./_generated/ppal-duplicate-schema.md-->

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
[Create Clip](#ppal-create-clip) and [Update Clip](#ppal-update-clip):

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

## Network Control

Control Ableton Live from another computer on your local network, no extra setup
required. For fully remote control, use
[web tunnels](/installation/web-tunnels).

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
