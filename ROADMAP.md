# Producer Pal Roadmap

Rough plans that are subject to change.

## 1.0 Release

- Streamline tool descriptions to reduce AI context window usage
- Document ways Producer Pal can be used with LLMs other than Claude

## 1.1 - Fill in Feature Gaps

- Arrangement clip length modification support

## 1.2 - Device Control

- Read and write device parameters
- Randomize instrument rack macros
- Store and recall rack variations

### Later Device Control Features

- Insert devices into tracks whenever the Live API supports it

## 1.5 - Enhanced Customization

### Persistent Global Context

Going beyond the memory tool and Live project-specific notes

- Persistent Producer Pal instructions across all Live Sets using file system
  storage (~/Documents/Producer Pal/)
- Tool instruction override system for power users to completely customize how
  Producer Pal works

## 1.x - Tech Debt & Misc

- ID-based operations for better state sync when objects move
- Cleaner, more consistent response formats for duplicate operations

## 2.0 - Adaptive Learning

### Memory System

- AI learns from your production patterns to remember your preferences and past
  corrections
- Import/export memory for sharing or backup

## 2.1 - Personas

### Multiple AI Personalities

- Create specialized personas (Jazz Producer, Techno Minimalist, etc.)
- Each persona maintains independent memory and preferences
- Switch personas based on project needs
- Share personas with other producers

## Future Ideas

### Enhanced Notation

- Percussion-specific notation (e.g., `X...x...` for 16th note patterns)
- Chord progression notation

### Advanced Composition

- Randomization tools for velocity, timing, and shuffle
- Pattern generation algorithms
- Auto-arrangement suggestions
- Microtonal support

### Production Features

- Audio clip manipulation and warping control
- Automation curve creation and editing
- MIDI effect chain management
- Mix assistant features

### Installation & Setup

- Version update notifications in the UI
- Streamlined installation - Claude Desktop extension installs Max device
  automatically
- Automatic updates

## Version History

See [Releases](https://github.com/adamjmurray/producer-pal/releases) for
detailed changelog of past versions.
