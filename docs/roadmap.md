# Roadmap

[Get Involved](#get-involved) · [In Progress](#in-progress) ·
[Planned Features](#planned-features) · [Changelog](#changelog)

## Get Involved

I maintain the core tools and roadmap, but there's room to collaborate:

- **Bug reports** — especially reproducible LLM tool misuse
- **Small model optimization** — help make Ollama/LM Studio work better
- **Documentation** — improvements and tutorials
- **Evaluations** — automated end-to-end behavior comparisons of different LLMs
  and small model mode vs normal mode (basic framework is in place, needs a lot
  more evals, and manual verification of eval effectiveness and eval results)
- **Voice interaction** — experimental bidirectional voice chat

Open a
[GitHub Discussion](https://github.com/adamjmurray/producer-pal/discussions) or
reach out directly.

## In Progress

### 1.4.x - More Transforms

- Apply curves
- More flexible randomization: arbitrary min and max, randomly choose between a
  set of choices (e.g. the notes of a chord)
- More note properties available as variables (e.g. note.index within the MIDI
  clip, clip.arrangementStart)
- Ability to apply LFOs relative to the arrangement start instead of clip start
- Code execution feature for the AI to generate custom algorithms for transforms
  and MIDI note generation

Also planned: Optimizations for better (local) small language model support, and
longer conversations in general.

## Changelog

### 1.4 - MIDI Transforms

Enhance the `ppal-create-clip` and `ppal-update-clip` tools with flexible MIDI
transform features:

- Apply ramps and LFO shapes to velocity, start time, duration, pitch, audio
  gain and other note and audio properties
- Randomize velocity and timing (and any of the other properties)
- Apply timing patterns like swing to MIDI
- Combine multiple transforms with mathematical expressions
- Changes are applied directly to MIDI clips (the notes are modified). The
  results can be easily seen and edited by hand.

Also:

- Split arrangement clips at the given position(s)
- Support running Ollama on another computer (Ollama API URL is no longer
  hard-coded to localhost)

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

### 1.1 - Built-in chat UI (November 2025)

Direct API integrations for Google Gemini, OpenAI, Mistral, OpenRouter, LM
Studio, Ollama, and more.

### 1.0 - Support for more LLMs (October 2025)

Expanded features and support for multiple AI platforms.

### 0.9 - Public Beta with Claude Desktop (July 2025)

Initial public release with Claude Desktop support and a focus on MIDI clip
manipulation and basic Live Set management.

## Planned Features

### 1.5 - Customization and Small Model Optimization

- Custom skills, system prompts, tool descriptions, and task-focused personas
  for experimentation and local model optimization
- Make different personas to focus on different types of tasks, for better
  results and less context window usage
- Evaluation tools for comparing adjustments to customization settings

### 1.6 - Harmony

- Chord notation
- Pitches as scale/chord degrees of the current chord (instead of absolute
  pitches)
- Microtonal support

### 1.x - Miscellaneous Features

- Take lane support
- Groove support
- Support new Live API features as they become available
- Persist conversations from the built-in chat UI and continue them later
- Voice interface: Speak to Producer Pal instead of typing
