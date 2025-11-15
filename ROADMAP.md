# Producer Pal Roadmap

## Released

- **0.9** - Public Beta with Claude Desktop
- **1.0** - Full feature set, multi-LLM support
- **1.1** - Built-in chat UI with direct API integrations: Google Gemini,
  OpenAI, Mistral, OpenRouter, LM Studio, Ollama, and more

## In Progress

### 1.2 - Audio Clips & Improved Clip Handling

- [x] Read/write audio clip properties: gain, pitch
- [x] Read/write warp mode and warp markers
- [ ] Ability to change clip's arrangement start time and arrangement length
  - [x] looped MIDI clips
  - [ ] looped audio clips
  - [ ] unlooped clips
- [x] Duplicate session clips to arbitrary clip slots (not just the slot
      immediately below)
- [ ] Improve the duplicate clip tool to be completely non-destructive (don't
      lose clip envelopes when "tiling" clips in the arrangement, don't
      overwrite any clips later in the timeline)

### 1.2.1

- [ ] Ability to scan a folder for audio files and create audio clips from those
      files
- [ ] Slice audio clips in the arrangement
- [ ] Improve handling of clip (and track and scene) colors by being explicit
      about how Ableton maps arbitrary RGB to a limited color pallette
- [ ] Maybe: "macro" operations to "mangle" audio clips via warp marker
      modifications and audio clip slicing + audio clip property modifications

## Planned

### 1.3 - Voice Interaction

- Speak to Producer Pal instead of typing

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

- Add device
- Delete device
- Read/write synth and effect parameters
- A/B comparison of device parameters
- ## Rack macro management
  - Add/update macro variation
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

## Future Ideas

- **Adaptive Learning**: AI learns preferences, specialized personas with
  independent memory, import/export personas
- **Extended Model Support**: HuggingFace, FireworksAI (requires CORS-bypassing
  backend proxy)
