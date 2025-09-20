# Producer Pal Roadmap

Rough plans that are subject to change.

## 1.0 Release

- Support Producer Pal with LLMs other than Claude
- Optimize by reducing AI context window usage

## Likely

### General Features

- Arrangement clip length modification support

### Persistent Global Context

Beyond the ppal-memory tool and Live project-specific notes

- Custom global Producer Pal prompt across all Live Sets using file storage
  (e.g. ~/Documents/Producer Pal/settings)
- Tool/parameter description overrides to completely customize how Producer Pal
  works

### Advanced MIDI Manipulation

- Randomization of velocity and timing
- Shuffle and groove features
- Pattern generation algorithms
- Ability to run sand-boxed JavaScript code to generate/modify MIDI clips

### Installation & Setup

- Version update notifications in the UI
- Automatic updates
- Streamlined installation - Claude Desktop extension installs Max device
  automatically

## Maybe

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
