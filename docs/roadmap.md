# Roadmap

## Released

### 0.9 - Public Beta with Claude Desktop

Initial public release with Claude Desktop support.

### 1.0 - Fleshed out feature set, multi-LLM support

Expanded features and support for multiple AI platforms.

### 1.1 - Built-in chat UI

Direct API integrations for Google Gemini, OpenAI, Mistral, OpenRouter, LM
Studio, Ollama, and more.

### 1.2 - Audio Clips & Improved Clip Handling

#### 1.2.0

- Read and write audio-specific clip properties: gain, pitch, warp mode, warp
  markers
- Change clips' arrangement start time and arrangement length
- Duplicate (session or arrangement) clips to arbitrary arrangement positions
  and lengths (e.g. looping clips loop to fill up extra space)
- Duplicate session clips to arbitrary clip slots

#### 1.2.1

- Added an experimental tool `ppal-transform-clips` that can:
  - slice up arrangement clips
  - randomly reorder arrangement clips
  - randomize various clip parameters
- Use dB units when reading and writing audio clip gain (instead of the
  normalized 0-1 range that has no relation to meaningful dB values)

## In Progress

### 1.2.x - More Audio Clips & Improved Clip Handling + Track Mixer Support

- Support for reading and writing track gain and panning
- Ability to scan a folder for audio files and create audio clips from those
  files
- Improve handling of clip (and track and scene) colors by being explicit about
  how Ableton maps arbitrary RGB to a limited color palette

## Planned

### 1.3 - Voice Interaction

Bidirectional voice interface: Speak to Producer Pal instead of typing, via:

- Google Gemini
- Maybe: OpenAI
- Local/other options?

### 1.4 - Modulation

- Apply ramps and curves to MIDI velocity and other properties
- Randomize velocity and timing
- Shuffle and groove support

### 1.5 - Device Control

Requires Live 12.3 to be released for add/delete device capabilities in the Live
API

- Add device
- Delete device
- Read/write synth and effect parameters
- A/B comparison of device parameters
- Rack macro variation management
  - Select macro variation
  - Save macro variation
  - Delete macro variation
  - Randomize macros

### 1.6 - Code Execution

- Sandboxed JavaScript for algorithmic composition and transformation

### 1.7 - Audio Synthesis

- Generate audio files on demand from a selection of synthesis algorithms and
  arrange them as audio clips or use them in Drum Racks/Simpler/Sampler
- Reverse audio clips - If this is still not directly possible in the API,
  generate the reversed audio sample on demand

### 1.8 - Harmony

- Chord notation
- Pitches as scale/chord degrees (instead of absolute pitches)
- Microtonal support
