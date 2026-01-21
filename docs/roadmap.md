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

## Changelog

### 1.3 - Device Control (December 2025 - January 2026)

- Full device control: add/delete/move native devices on any track, read/write
  parameters, insert into rack chains
- Rack macro and variation management
- A/B comparison for device parameters
- Arrangement locator support
- MIDI clip quantization support

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

## Planned Features

### 1.4 - Modulation

Enhance `ppal-create-clip`, `ppal-update-clip`, and `ppal-transform-clips` tool
with more flexible modulation features:

- Apply ramps and curves to MIDI velocity, audio gain and other properties
- Randomize velocity and timing
- Apply timing patterns like swing

### 1.5 - Code Execution

- Sandboxed JavaScript for algorithmic composition and transformation

### 1.6 - Customization

- Custom skills, system prompts, tool descriptions, and task-focused personas
  for experimentation and local model optimization

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
- Groove support
- Speak to Producer Pal instead of typing with:
  - Google Gemini
  - OpenAI ChatGPT
  - Others? Wisprflow? AssemblyAI?
  - Bidirectional / TTS: Gemini Live API, OpenAI Live API
