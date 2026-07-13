# Roadmap

## Upcoming

### 2.0.x - Personalization and Extensibility

- Global context: add your own reference material and custom instructions across
  all Live projects
- Global memory: Producer Pal can adapt over time to your needs and interaction
  style
- Custom skills, system prompts, tool sets, and tool descriptions
- Workflows: pre-defined tool call sequences for reliable, repeatable operations
- Alternative MIDI syntaxes
- Context manager in the built-in chat UI for working with all the above

See [Extending Producer Pal](/extending) for more on the extension model.

## Changelog

See [the list of releases](https://github.com/adamjmurray/producer-pal/releases)
for more detailed information.

### 1.4 - MIDI Transforms, REST API, and Live API Access (February–May 2026)

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

## Beyond 2.0

After 2.0, the core stabilizes — future core changes focus on bug fixes and
supporting new Live API features as they become available. New capabilities will
come through [extensions](/extending): community skills, workflows, and
companion MCP servers.

**Core features under consideration:**

- Audio synthesis
- Audio analysis
