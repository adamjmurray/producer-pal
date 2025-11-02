# Producer Pal Roadmap

Rough plans that are subject to change.

## 1.x / 2.0

In no particular order:

### MIDI Manipulation

- Randomize velocity and timing when creating and updating clips
- Shuffle and groove support (non-random timing manipulation)
- MIDI pattern generators and transformers (pre-defined algorithms the LLM can
  use)
- Run sand-boxed LLM-generated JavaScript code to generate and transform MIDI
  (LLM-generated algorithms)

### Audio Clip Support

Functionality will be very limited due to general lack of audio clip support in
the Live API, but the following should be possible:

- Read and update audio clip properties:
  - name
  - color
  - gain
  - pitch shift
  - warp mode
  - warp enabled
  - start/end/loop position
  - anything else the Live API supports
- Add and move (and remove?) warp markers in audio clips
- Split an Arrangement audio clip (i.e. duplicate, adjust lengths, reassemble)

### Improved Built-in Chat

- Edit and resend any previous message
- Change model settings mid-chat

### Voice Interaction

Allow for controlling Ableton Live by simply talking:

- Realtime bi-directional audio-chat
- Auto-transcribe-and-send (VAD) with text-to-speech responses

### Behavior Customization

- Customizable "Producer Pal Skills" to adjust Producer Pal's behavior globally
  across all Live Sets
- A large markdown-based UI editor in a popup window for project notes and the
  skills

### General Features

- Arrangement clip length modification support
- Stop/restart MCP server when Producer Pal Max for Live device is
  disabled/re-enabled (easy kill switch)
- Version update notifications in the UI

## Future Ideas

### Device Control

- Read and write device parameters
- Randomize instrument rack macros
- Store and recall rack variations
- Insert devices into tracks whenever the Live API supports it

### Microtonal support

- Support working with scales with other than 12 notes per octave, such as
  19-EDO

### Adaptive Learning System

- AI (optionally) automatically learns from your conversations to remember your
  preferences and project goals
- Completely open: rewrite or delete memories as you see fit
- Create specialized personas (Jazz Producer, Techno Minimalist, etc.) with
  independent memory systems (skills + memory?)
- Import/export personas for sharing or backup

### Additional Model Support

- Support for additional providers in the built-in chat UI, such as HuggingFace
  and FireworksAI. This requires a backend LLM proxy because CORS rules block
  direct API calls to these platforms from the web UI
