# Producer Pal Roadmap

Rough plans that are subject to change.

## 1.0 (almost done!)

- Testing & Stabilization

## 1.x / 2.0

In no particular order:

### General Features

- Arrangement clip length modification support
- Stop/restart MCP server when Producer Pal Max for Live device is
  disabled/re-enabled (easy kill switch)
- Version update notifications in the UI

### Behavior Customization

- Customizable "Producer Pal Skills" to adjust Producer Pal's behavior globally
  across all Live Sets
- A large markdown-based UI editor in a popup window for project notes and the
  skills

### Advanced MIDI Manipulation

- Randomize velocity and timing when creating and updating clips
- Shuffle and groove support (non-random timing manipulation)
- MIDI pattern generators and transformers (pre-defined algorithms the LLM can
  use)
- Run sand-boxed LLM-generated JavaScript code to generate and transform MIDI
  (LLM-generated algorithms)

### Built-in Chat

- Setup an API key or point at a local LM Studio server and chat directly from
  the Max for Live device via a popup window

## Future Ideas

### Device Control

- Read and write device parameters
- Randomize instrument rack macros
- Store and recall rack variations
- Insert devices into tracks whenever the Live API supports it

### Microtonal support

- Support working with scales with other than 12 notes per octave, such as
  19-EDO

### Adaptive Learning System

- AI (optionally) automatically learns from your conversations to remember your
  preferences and project goals
- Completely open: rewrite or delete memories as you see fit
- Create specialized personas (Jazz Producer, Techno Minimalist, etc.) with
  independent memory systems (skills + memory?)
- Import/export personas for sharing or backup
