# Roadmap

[Get Involved](#get-involved) · [In Progress](#in-progress) ·
[Planned Features](#planned-features) · [Changelog](#changelog)

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

## Planned Features

### 1.4 - Modulation

Enhance `ppal-create-clip`, `ppal-update-clip`, and `ppal-transform-clips` tool
with more flexible modulation features:

- Apply ramps and curves to MIDI velocity, audio gain and other properties
- Randomize velocity and timing
- Shuffle and groove support

This is destructive modulation applied by modifying clip properties and the
notes inside MIDI clips. It is not live modulations such as Max for Live LFOs,
however, that could possibly be supported too via device control features.

### 1.5 - Code Execution

- Sandboxed JavaScript for algorithmic composition and transformation

### 1.6 - Customization

- Override the Producer Pal skills, system prompt (for the chat UI), and MCP
  tool descriptions for experimentation and local model optimization purposes.
- Provide different personas for different tasks (focus on project setup with
  track/device editing, focus on MIDI editing, focus on arrangement, etc) and
  make it easy to switch between them for more focus / local model optimization

### 1.7 - Harmony

- Chord notation
- Pitches as scale/chord degrees (instead of absolute pitches)
- Microtonal support

### 1.8 - Audio Editing and Synthesis

- Reverse audio clips
- Generate audio files on demand from a selection of synthesis algorithms and
  arrange them as audio clips or use them in Drum Racks/Simpler/Sampler
- Generate novel DSP algorithms

### 1.x - Misc

- Take lane support
- Speak to Producer Pal instead of typing with:
  - Google Gemini
  - OpenAI ChatGPT
  - Others? Wisprflow? AssemblyAI?
- Bidirection / TTS: Gemini Live API, OpenAI Live API

## Changelog

### 1.3.3 - Move devices, Rack chain support (December 2025)

- Support moving/reordering devices
- Support inserting devices into arbitrary rack chains, creating new chains as
  needed
- Read samples in Simpler devices (which can then be used to create audio clips)
- Change thinking & randomness settings per message in the built-in chat UI

### 1.3.2 - Rack macros & variations, AB comparison, Arrangement locators (December 2025)

- Rack macro and variation management
- A/B comparison for device parameters
- Arrangement locator support

### 1.3.1 - maintenance (December 2025)

- Auto-recover from rate limit errors in the built-in chat UI

### 1.3.0 - Device Control (December 2025)

- Add native Live devices (built-in instruments, MIDI effects, audio effects) to
  any track (audio/midi, return, master)
- Delete devices
- Read/write device parameters

### 1.2 - Audio clip and mixer support (November 2025)

- Audio clip support with a `read-samples` tool to scan folders for samples
- Track mixer control: gain, panning, and sends
- Arrangement clip positioning and length control
- Experimental `ppal-transform-clips` tool for slicing, shuffling, and
  randomizing clips

### 1.1 - Built-in chat UI (November 2025)

Direct API integrations for Google Gemini, OpenAI, Mistral, OpenRouter, LM
Studio, Ollama, and more.

### 1.0 - Support for more LLMs (October 2025)

Expanded features and support for multiple AI platforms.

### 0.9 - Public Beta with Claude Desktop (July 2025)

Initial public release with Claude Desktop support.
