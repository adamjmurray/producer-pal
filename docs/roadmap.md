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

### 1.5 - Customization and Optimization

- Custom skills, system prompts, and tool descriptions
- Global context: add your own reference material and custom instructions across
  all Live projects
- Task-focused personas to reduce context window usage

## Changelog

### 1.4 - MIDI Transforms (February 2026)

Transform note and audio clip properties using math expressions:

- Ramps, curves, and LFO shapes (arrangement-relative or clip-relative)
- Randomization with arbitrary ranges, or choose from a set of values
- Swing and other timing patterns
- Context variables like note index and clip position in the arrangement

Other improvements:

- Split arrangement clips at specified positions
- Configurable Ollama API URL for remote hosting

### 1.3 - Device Control (January 2026)

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

## Future Features

- Support new Live API features as they become available
- Take lane and groove support
- Persistent conversations in the built-in chat UI
- Chord notation and pitches as scale/chord degrees
- Voice interface
- Custom algorithm execution for MIDI generation and transformation
