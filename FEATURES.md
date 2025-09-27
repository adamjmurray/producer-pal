# Producer Pal Features

Producer Pal provides AI-powered tools for music production in Ableton Live.
Simply ask the AI what you want to do, and it will use these tools to help you
create.

## Transport & Playback

### Transport Control (`ppal-playback`)

- Start/stop playback in Session or Arrangement view
- Play specific scenes or clips
- Set loop points and playback position
- Control which tracks follow the Arrangement
- Stop all clips or specific track clips

## Song Management

### Read Song (`ppal-read-song`)

- Get complete Live project overview
- View all tracks, scenes, and clips at once
- See tempo, time signature, and scale settings
- Check what's playing and track states

### Update Song (`ppal-update-song`)

- Change tempo (20-999 BPM)
- Set time signature
- Configure musical scales

## Scene Operations

### Create Scene (`ppal-create-scene`)

- Add new scenes at any position
- Set scene name, color, tempo, and time signature
- Scenes can follow song tempo or have their own

### Read Scene (`ppal-read-scene`)

- View scene details and all its clips
- Check which clips are playing/triggered
- See scene tempo and time signature

### Update Scene (`ppal-update-scene`)

- Rename scenes and change colors
- Modify scene tempo and time signature
- Bulk update multiple scenes at once
- Enable/disable scene-specific tempo
- Ability to capture currently playing clips into a new scene

## Track Management

### Create Track (`ppal-create-track`)

- Add MIDI or audio tracks
- Position tracks exactly where you want
- Set initial mute/solo/arm states

### Read Track (`ppal-read-track`)

- Get detailed track information
- View all clips in Session and Arrangement
- See devices, routing options, and drum pad mappings
- Check track states (muted, soloed, armed)

### Update Track (`ppal-update-track`)

- Rename tracks and change colors
- Control mute/solo/arm states
- Configure input/output routing
- Set monitoring modes
- Bulk update multiple tracks

## Clip Creation & Editing

### Create Clip (`ppal-create-clip`)

- Generate MIDI clips with notes, velocities, and timing
- Place clips in Session slots or Arrangement timeline
- Support for probability, velocity ranges, and complex rhythms
- Auto-create scenes as needed

### Read Clip (`ppal-read-clip`)

- View clip properties and MIDI notes
- See notes in musical notation (C3, D#4, etc.)
- Check loop settings and time signatures
- Works with Session and Arrangement clips

### Update Clip (`ppal-update-clip`)

- Edit MIDI notes and timing
- Modify velocities and probability
- Change clip names and colors
- Adjust loop settings
- Update or merge note patterns
- Bulk edit multiple clips

### Custom Music Notation

Producer Pal uses a text-based music notation syntax called `bar|beat` to work
with MIDI clips. It helps LLMs translate natural language expressions of time to
the correct time positions in Ableton Live clips and the arrangement timeline.

- **Pitches**: Standard notation (C3 = middle C, F#4, Bb2, etc.)
- **Time positions**: bar|beat format (1|1 = first beat, 2|3 = bar 2, beat 3)
- **Durations**: bar:beat format (4:0 = 4 bars, 1:2 = 1 bar + 2 beats)
- **Velocity**: Values from 1-127 (or ranges like 80-100)
- **Probability**: 0.0 to 1.0 (1.0 = always plays)
- **Comments**: Include commentary using // for single lines, # for inline, or
  /\* \*/ for blocks

## Object Management

### Duplicate (`ppal-duplicate`)

- Copy tracks, scenes, or clips
- Duplicate to Session or Arrangement
- Create multiple copies at once
- Track routing options allow layering multiple MIDI clips on a single
  instrument

### Delete (`ppal-delete`)

- Remove tracks, scenes, or clips
- Bulk delete multiple objects

## View Control

### View (`ppal-select`)

- Read current selection and view state (when no arguments)
  - See selected track, scene, clip, and device
  - Check what's currently visible in Live
- Update selection and view state (when arguments provided)
  - Select specific tracks, scenes, or clips
  - Switch between Session and Arrangement views
  - Show/hide browser and detail views
  - Focus on devices or clip details

## Project Notes

### Memory (`ppal-memory`)

- Store project-specific notes and context
- Help Producer Pal understand your project goals
- AI can read and update notes (when enabled)
- Notes are saved with your Live project and persist across AI conversations

## Connection & Setup

### Initialize (`ppal-connect`)

- Connects to Ableton Live and verifies everything is working
- Shows Live Set name, tempo, and basic info
- Displays project notes if enabled
- Automatically called when you mention "Ableton" or "Producer Pal"

### Network Control

- Control Ableton Live on another computer on your network
- Configure with full URL in Claude Desktop extension settings
- Enables collaborative production and remote control workflows
