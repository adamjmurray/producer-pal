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
- [ ] Slice audio clips in the arrangement

## Planned

### 1.3 - Voice Interaction

- Speak to Producer Pal instead of typing

### 1.4 - Modulation

- Apply ramps and curves to MIDI velocity and other properties
- Randomize velocity and timing
- Shuffle and groove support

### 1.5 - Device Control

- Read/write synth and effect parameters
- Add devices

### 1.6 - Code Execution

- Sandboxed JavaScript for algorithmic composition and transformation

### 1.7 - Harmony

- Chord notation
- Pitches as scale/chord degrees (instead of absolute pitches)
- Microtonal support

## Future Ideas

- **Adaptive Learning**: AI learns preferences, specialized personas with
  independent memory, import/export personas
- **Extended Model Support**: HuggingFace, FireworksAI (requires CORS-bypassing
  backend proxy)
