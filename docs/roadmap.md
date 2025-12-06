# Roadmap

## Get Involved

I maintain the core tools and roadmap, but there's room to collaborate:

- **Testing & evaluations** — automated end-to-end testing, LLM comparisons
- **Small model optimization** — help make Ollama/LM Studio work better
- **Voice interaction** — experimental bidirectional voice chat
- **Documentation** — improvements and tutorials
- **Bug reports** — especially reproducible LLM tool misuse

Open a
[GitHub Discussion](https://github.com/adamjmurray/producer-pal/discussions) or
reach out directly.

## Released

### 0.9 - Public Beta with Claude Desktop

Initial public release with Claude Desktop support.

### 1.0 - Fleshed out feature set, multi-LLM support

Expanded features and support for multiple AI platforms.

### 1.1 - Built-in chat UI

Direct API integrations for Google Gemini, OpenAI, Mistral, OpenRouter, LM
Studio, Ollama, and more.

### 1.2 - Audio clip and mixer support enhanced track/clip management

- Create audio clips
- A new `read-samples` tool can scan a folder (if you choose to allow it) for
  audio files and create audio clips from those samples
- Read and write audio clip properties: gain, pitch, warp mode, warp markers
- Read and write track mixer properties for gain, panning (including standard
  stereo panning and split L/R panning modes), and sends
- Change clip arrangement start time and arrangement length
- Create return tracks
- Create multiple tracks at once with independent names and colors
- Create or duplicate clips to multiple arbitrary arrangement positions and clip
  slots (e.g. for quickly laying out audio clips in the arrangement)
- Added an experimental tool `ppal-transform-clips` that can, slice up
  arrangement clips, randomly reorder slices, and randomize various parameters
  across multiple clips

### 1.3.0 - Device Control

- Add native Live devices (built-in instruments, MIDI effects, audio effects) to
  any track (audio/midi, return, master)
- Delete devices
- Read/write device parameters

## In Progress

### v1.3.1

- Rack macro variation management
  - Select macro variation
  - Create/update macro variation
  - Delete macro variation
  - Randomize macros

### v1.3.2

- A/B comparison of device parameters

## Planned

### 1.4 - Modulation

Replace or extend the `ppal-transform-clips` tool with more flexible modulation
features:

- Apply ramps and curves to MIDI velocity, audio gain and other properties
- Randomize velocity and timing
- Shuffle and groove support

This is destructive modulation applied by modifying clip properties and the
notes inside MIDI clips. It is not live modulations such as Max for Live LFOs,
however, that could possibly be supported too via device control features.

### 1.5 - Voice Interaction

Bidirectional voice interface: Speak to Producer Pal instead of typing, via:

- Google Gemini
- Maybe: OpenAI (so far, this works best during prototyping, but costs money per
  interaction i.e. it is not covered by a flat-rate subscription plan)
- Local/other options?

### 1.6 - Code Execution

- Sandboxed JavaScript for algorithmic composition and transformation

### 1.7 - Audio Synthesis

- Generate audio files on demand from a selection of synthesis algorithms and
  arrange them as audio clips or use them in Drum Racks/Simpler/Sampler
- Reverse audio clips - If this is still not directly possible in the API,
  generate the reversed audio sample on demand

### 1.8 - Harmony

- Chord notation
- Pitches as scale/chord degrees (instead of absolute pitches)
- Microtonal support
