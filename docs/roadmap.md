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

## In Progress

### 1.4 - MIDI Transforms

Enhance the `ppal-create-clip` and `ppal-update-clip` tools with flexible MIDI
transform features:

- Apply ramps, curves, and LFO shapes to MIDI velocity, start time, duration,
  and other note properties
- Apply timing patterns like swing
- Randomize velocity and timing
- Changes are applied directly to MIDI clips (the notes are modified). The
  results can be easily seen and edited by hand.

## Changelog

### 1.3 - Device Control (December 2025 - January 2026)

- Full device control: add/delete/move native devices on any track, read/write
  parameters, insert into rack chains
- Rack macro and variation management
- A/B comparison for device parameters

Also added support for:

- Arrangement locators
- MIDI clip quantization

### 1.2 - Audio clip, mixer, and improved Arrangement support (November 2025)

- Audio clip support with a `read-samples` tool to scan folders for samples
- Track mixer control: gain, panning, and sends
- Arrangement clip positioning and length control
- Experimental clip slicing, shuffling, and randomizing features (since removed
  or integrated into `ppal-update-clip`)

### 1.1 - Built-in chat UI (November 2025)

Direct API integrations for Google Gemini, OpenAI, Mistral, OpenRouter, LM
Studio, Ollama, and more.

### 1.0 - Support for more LLMs (October 2025)

Expanded features and support for multiple AI platforms.

### 0.9 - Public Beta with Claude Desktop (July 2025)

Initial public release with Claude Desktop support and a focus on MIDI clip
manipulation and basic Live Set management.

## Planned Features

### 1.5 - Code Execution

- Sandboxed JavaScript for algorithmic composition and transformation

### 1.6 - Customization

- Custom skills, system prompts, tool descriptions, and task-focused personas
  for experimentation and local model optimization

### 1.7 - Harmony

- Chord notation
- Pitches as scale/chord degrees of the current chord (instead of absolute
  pitches)
- Microtonal support

### 1.8 - Audio Editing and Synthesis

- Reverse audio clips
- Generate audio files on demand from a selection of synthesis algorithms and
  arrange them as audio clips or use them in Drum Racks/Simpler/Sampler
- Generate novel DSP algorithms

### 1.x - Misc

- Take lane support
- Groove support
- Persist conversations from the built-in chat UI and continue them later
- Voice interface: Speak to Producer Pal instead of typing
