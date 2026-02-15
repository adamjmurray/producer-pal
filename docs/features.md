# Features

Producer Pal provides AI-powered tools for music production in Ableton Live.
Simply ask the AI what you want to do, and it will use these tools to help you
create.

## Connection & Setup

### Session Management (`ppal-session`)

- Establish the connection with Ableton Live (required before using other tools)
- Summarizes the state of the current Live Set
- Provides the AI with a Producer Pal skill set that adapts to different AI
  model capabilities
- Read and write project memory — persistent notes that help the AI understand
  your goals across conversations
- Search configured sample folder for audio files by filename or path

### Built-in Chat UI

- Control Producer Pal with its built-in text-based interface
- Compatible with Google Gemini, OpenAI, and OpenAI-compatible online services
  (Mistral, OpenRouter, etc)
- Compatible with local SLMs (Ollama, LM Studio)

### Network Control

- Control Ableton Live with another computer on your network for collaborative
  production and remote control workflows

## Transport & Playback

### Transport Control (`ppal-playback`)

- Start/stop playback in Session or Arrangement view
- Play specific scenes or clips
- Set loop points and playback position
- Jump to arrangement locators by ID or name
- Set loop start/end using locators
- Control which tracks follow the Arrangement
- Stop all clips or specific track clips

## Live Set Management

### Read Live Set (`ppal-read-live-set`)

- Get complete Live project overview
- View all tracks, scenes, and clips at once
- See tempo, time signature, and scale settings
- View arrangement locators with times and names
- Check what's playing and track states

### Update Live Set (`ppal-update-live-set`)

- Change tempo, time signature, scale
- Create, rename, or delete arrangement locators

## Scene Operations

### Create Scene (`ppal-create-scene`)

- Add new scenes at any position
- Set scene name, color, tempo, and time signature
- Scenes can follow song tempo or have their own
- Ability to capture currently playing clips into a new scene

### Read Scene (`ppal-read-scene`)

- View scene details and all its clips
- Check which clips are playing/triggered
- See scene tempo and time signature

### Update Scene (`ppal-update-scene`)

- Change scene name, color, tempo, and time signature
- Update multiple scenes at once

## Track Management

### Create Track (`ppal-create-track`)

- Add MIDI, audio, or return tracks
- Position tracks exactly where you want
- Set initial mute/solo/arm states

### Read Track (`ppal-read-track`)

- Get detailed track information
- View all clips in Session and Arrangement
- See devices, routing options, and drum pad mappings
- Check track states (muted, soloed, armed)
- View mixer properties: gain, pan, panning mode, and send levels

### Update Track (`ppal-update-track`)

- Change track gain (volume), panning, and send levels
- Change mute, solo, arm, I/O routings, and monitoring state
- Change track name and color
- Update multiple tracks at once

## Device Management

### Create Device (`ppal-create-device`)

- Add native Live devices (instruments, MIDI effects, audio effects)
- Place devices on any track type: MIDI, audio, return, or master
- Position devices at a specific index in the device chain
- Create devices inside rack chains or drum pads using path notation
- List the native Live devices

### Read Device (`ppal-read-device`)

- Get detailed info about any device, including inside rack chains and drum pad
  chains
- List device parameter names and values (the state of knobs, dials, etc)

### Update Device (`ppal-update-device`)

- Change device name
- Change device parameter values (control knobs, dials, etc)
- Update multiple devices at once
- Move devices anywhere else in the Live Set, including into racks / wrapping in
  a new rack
- Create, load, delete, and randomize rack macros variations
- A/B Compare with supported devices
- Control chain and drum pad mute and solo state
- Change the choke group and output MIDI note of drum chains

## Clip Creation & Editing

### Create Clip (`ppal-create-clip`)

- Generate MIDI clips with notes, velocities, and timing
- Place clips in Session slots or Arrangement timeline
- Support for probability, velocity ranges, and complex rhythms
- Auto-create scenes as needed

### Read Clip (`ppal-read-clip`)

- Get detailed info about any clip in Session or Arrangement
- Read MIDI notes in musical notation (C3, D#4, etc.)
- Get audio clip gain, pitch, warp settings, sample info

### Update Clip (`ppal-update-clip`)

- Change clip name, color, and loop settings
- Add/remove MIDI notes and change note pitch, timing, velocity, and probability
- Change audio clip gain, pitch shift, warp settings, and warp markers
- Move clips and change their length in the Arrangement
- Split arrangement clips at specified positions
- Update multiple clips at once

### Custom Music Notation

Producer Pal uses a text-based music notation syntax called `bar|beat` to work
with MIDI clips. It helps LLMs translate natural language expressions of time to
the correct time positions in Ableton Live clips and the arrangement timeline.

- **Pitches**: Standard notation (C3 = middle C, F#4, Bb2, etc.)
- **Time positions**: bar|beat format (1|1 = first beat, 2|3 = bar 2, beat 3)
- **Durations**: bar:beat format (4:0 = 4 bars, 1:2 = 1 bar + 2 beats)
- **Velocity**: Values from 1-127 (or ranges like 80-100)
- **Probability**: 0.0 to 1.0 (1.0 = always plays)
- **Bar copying**: Copy bars with `@2=1` (bar 1→2), ranges with `@2-8=1` (bar
  1→bars 2-8), or tile patterns with `@3-10=1-2` (repeat 2-bar pattern across
  bars 3-10)

### Transforms

Apply complex changes to clips using math expressions:

- **Transform MIDI notes**: velocity, pitch, timing, duration, probability
- **Transform audio clips**: gain, pitch shift
- **Shapes**: LFO-like waveforms (sine, tri, saw), linear and exponential ramps
  for fades, randomization (rand, choose) for humanization
- **Context variables**: Access note order (`note.index`), clip metadata
  (`clip.duration`, `clip.index`, `clip.position`), and time signature info
  (`bar.duration`) in expressions
- **Selectors**: Target specific pitch ranges (e.g., `C3:`, `C3-C5:`) or time
  ranges (e.g., `1|1-2|4:`), or both in either order (e.g., `C3 1|1-2|4:` or
  `1|1-2|4 C3:`)

## Object Management

### Duplicate (`ppal-duplicate`)

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

### Delete (`ppal-delete`)

- Remove tracks, return tracks, scenes, clips, or devices
- Bulk delete multiple objects

## Selection State and View Control

### Select (`ppal-select`)

- Read current selection and view state (when no arguments)
  - See selected track, scene, clip, and device
  - Check what's currently visible in Live
- Update selection and view state (when arguments provided)
  - Select specific tracks, scenes, or clips
  - Switch between Session and Arrangement views
  - Show/hide browser and detail views
  - Focus on devices or clip details
