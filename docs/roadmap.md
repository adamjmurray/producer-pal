# Roadmap

## Upcoming

### 1.5 - Customization and Context Management

- Global context: add your own reference material and custom instructions across
  all Live projects
- Global memory: Producer Pal can adapt over time to your needs and interaction
  style
- Custom skills, system prompts, tool sets, and tool descriptions
- Task-focused personas and better optimized "small model mode" via
  customization presets

## Changelog

See [the list of releases](https://github.com/adamjmurray/producer-pal/releases)
for more detailed information.

### 1.4 - MIDI Transforms (February 2026)

Transform note and audio clip properties using math expressions:

- Ramps, curves, and LFO shapes (arrangement-relative or clip-relative)
- Randomization with arbitrary ranges, or choose from a set of values
- Swing and other timing patterns
- Context variables like note index and clip position in the arrangement

Other improvements:

- Split arrangement clips at specified positions
- Configurable Ollama API URL for remote hosting
- Improved support for creating, updating, and duplicating multiple objects
  (tracks, clips, scenes, devices) in one operation for efficiency
- Many improvements to the built-in chat UI

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
- Take lane support
- Persistent conversations in the built-in chat UI
- Chord notation and pitches as scale/chord degrees
- Voice interface
- Custom algorithm execution for MIDI generation and transformation
