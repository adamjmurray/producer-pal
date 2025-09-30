# Producer Pal Roadmap

Rough plans that are subject to change.

## 1.0

- Support Producer Pal with LLMs other than Claude
- Optimize performance by reducing AI context window usage

## 1.x / 2.0

In no particular order:

### General Features

- Arrangement clip length modification support
- Version update notifications in the UI

### Behavior Customization

- Custom global Producer Pal prompt ("global notes"?) across all Live Sets using
  file storage (e.g. ~/Documents/Producer Pal/settings) exposed via the
  `ppal-connect` and `ppal-memory` tools. Can be AI-writable (e.g. ask AI to
  remember a rule across all of your Live projects)
- Large UI editor in a popup window for project and global notes. Markdown
  support.
- Tool/parameter description overrides to completely customize how Producer Pal
  behaves, for R&D and tuning the behavior for specific AI models.

### Advanced MIDI Manipulation

- Randomize velocity and timing when creating and updating clips
- Shuffle and groove support (non-random timing manipulation)
- MIDI pattern generators and transformers (pre-defined algorithms the LLM can
  use)
- Run sand-boxed LLM-generated JavaScript code to generate and transform MIDI
  (LLM-generated algorithms)

## Maybe Later

### Built-in Chat UI

- Add e.g. a Gemini API key and start chatting directly from the Max for Live
  device via a popup window.

### Device Control

- Read and write device parameters
- Randomize instrument rack macros
- Store and recall rack variations
- Insert devices into tracks whenever the Live API supports it

### Adaptive Learning System

- AI learns from your production patterns to remember your preferences and past
  corrections
- Create specialized personas (Jazz Producer, Techno Minimalist, etc.) with
  independent memory and preferences
- Import/export memory/personas for sharing or backup

### Enhanced Notation

- Percussion-specific notation (e.g., `X...x...` for 16th note patterns)
- Chord progression notation

### Microtonal support

- Support working with scales with more than 12 notes per octave, such as 19-EDO

## Version History

See [Releases](https://github.com/adamjmurray/producer-pal/releases) for
detailed changelog of past versions.
