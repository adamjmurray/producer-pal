# Roadmap

## Next

### 2.3

In consideration:

- Improved Drum Rack support
- Continue to improve performance
- Continues standardizing tool interfaces on path-based locators for Live
  objects
- Fetch model options from Ollama and LM Studio/Bionic servers instead of
  hard-coding

## Changelog

See [the list of releases](https://github.com/adamjmurray/producer-pal/releases)
for more detailed information.

### 2.2 - Performance and paths (August 2026)

- Producer Pal no longer leaks Live API objects, so Ableton stays fast over a
  long session instead of slowing down and filling its log file
- Drum kit, Live Set, and arrangement operations do a fraction of the work they
  did — heavy arrangement edits could freeze Live
- One shorthand syntax locates anything in a Live Set: `t2/s3` is a clip slot,
  `t2/l0` a take lane, `t1/d0/pC1` a drum pad. `path` replaces `slot`, and clip
  results report it — **breaking** for anything reading `slot` or `trackIndex`
- Every id param is just `id`, and a param sent as `null` reads as unset
- Drum Racks: copy a pad, delete a single chain, read and write chain mixers,
  and nested racks work
- Copy or move a clip to another track in the arrangement, and split arrangement
  clips at song positions
- Calls that run long report what landed instead of failing outright
- Built-in chat: the input is a markdown editor, and the per-turn tool-step
  budget is 25 and configurable

### 2.1 - Delegation (August 2026)

- Subagents: the built-in chat can delegate self-contained tasks to nested
  assistants that run in parallel, and be resumed for follow-up work
- Presets: named bundles of provider, model, tool set, and notation — including
  what subagents run as
- Skills fragments can be switched off individually, and are dropped
  automatically for tools you've turned off
- Notation and the tool set are pinned to each conversation
- Project context is backed up next to your Live Set, so it survives a device
  upgrade
- Audio clips: control warping when creating a clip, and correct timing for
  unwarped clips
- Voice mode on GPT Realtime 2.1, with cheaper transcription

### 2.0 - Personalization (July 2026)

- Global context: add your own reference material and custom instructions across
  all Live projects
- Global memory: Producer Pal can adapt over time to your needs and interaction
  style
- Customize the built-in skills and the built-in chat's system instructions
- Alternative MIDI syntaxes
- Context manager in the built-in chat UI for working with all the above

### 1.4 - MIDI Transforms, REST API, and Live API Access (February 2026)

MIDI transforms: math expressions for transforming note properties

- Ramps, curves, and LFO shapes (arrangement-relative or clip-relative)
- Randomization with arbitrary ranges, or choose from a set of values
- Helpers: `swing()`, `quant()`, `legato()`, `seq()`, `clipseq()`, `step()`,
  `wrap()`, `reflect()`
- Context variables like note index and clip position in the arrangement

REST API and agent skills:

- HTTP-based tool calls without MCP setup
- Drop-in agent skill for Claude Code, Codex CLI, Gemini CLI, and other
  SKILL.md-compatible runtimes

New tools and broader Live API coverage:

- `ppal-library` for searching the Live Library: samples, MIDI clips, and
  installed plugins (filterable by category, type, and folder)
- `ppal-live-api` for direct Live API access to cover gaps in specialized tools
- Simpler sample loading via `ppal-update-device` (requires Live 12.4+)
- Device-specific parameter control for 9 native devices (Drift, Wavetable,
  Simpler, Meld, Compressor, EQ Eight, Hybrid Reverb, Roar, Spectral Resonator),
  with auto-discovered device-specific actions and degree (°) unit display
- Take lane support

Other improvements:

- Split arrangement clips at specified positions
- Multi-object create / update / duplicate operations. `transforms` on
  update-clip and duplicate is a single string broadcast across every clip/copy
  — use `clip.index` arithmetic or `clipseq()` inside the string for per-clip
  variation, or make separate calls for structurally-distinct edits.
- Per-project notes: improved UI, now always enabled by default (disable the
  `ppal-context` tool to prevent AI edits)
- Configurable Ollama and LM Studio URLs for remote hosting
- Experimental voice control in the chat UI (OpenAI realtime and Google Gemini
  Live), with adjustable voice volume up to 125%
- Many built-in chat UI improvements: conversation history, token usage
  reporting, grouped tool calls, message editing, encrypted API keys, a
  "Continue" button to resume long tasks, and more

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
  (since absorbed into `ppal-library`)
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
