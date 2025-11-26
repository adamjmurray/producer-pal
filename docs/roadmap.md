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

### 1.2.2 - More Audio Clips & Improved Clip Handling + Track Mixer Support

- Mixer support: reading and writing track gain and panning
- Ability to scan a folder for audio files and create audio clips from those
  files
- Better handling for Live's color palette by warning when an arbitrary RGB
  color (set on a Track, Scene, or Clip) is mapped to a different value in the
  palette

## Planned

### 1.x - Miscellaneous Improvements

- Read and write mixer send amounts

### 1.3 - Voice Interaction

Bidirectional voice interface: Speak to Producer Pal instead of typing, via:

- Google Gemini
- Maybe: OpenAI (so far, this works best during prototyping, but costs money per
  interaction i.e. it is not covered by a flat-rate subscription plan)
- Local/other options?

This might get deferred in favor or working on device support and MIDI
modulation, because Live 12.3 is out with better device support in the Live API.

### 1.4 - Modulation

Replace or extend the `ppal-transform-clips` tool with more flexible modulation
features:

- Apply ramps and curves to MIDI velocity, audio gain and other properties
- Randomize velocity and timing
- Shuffle and groove support

This is destructive modulation applied by modifying clip properties and the
notes inside MIDI clips. It is not live modulations such as Max for Live LFOs,
however, that could possibly be supported too via device control features.

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
