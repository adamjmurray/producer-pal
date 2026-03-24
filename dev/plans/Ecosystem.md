# Producer Pal Ecosystem

## Vision

Producer Pal 1.5 is the platform release. After 1.5.x stabilizes, the core
enters maintenance mode — bug fixes and Live API evolution only. Innovation
happens through extensions, not PRs to the main repo.

The goal: a vibrant ecosystem where people create and share extensions to
Producer Pal, and the core repo is not the bottleneck.

## Core Boundary

**Producer Pal Core is Ableton Live control via MCP.** Each tool directly wraps
one or more Live API calls, with two exceptions: `ppal-connect` (connection
handshake and default skill delivery) and `ppal-context` (project/global memory,
dynamic skill loading, file access for e.g. audio sample search). These are
infrastructure tools that support the LLM's use of the Live API tools. No
external dependencies beyond standard LLM interfaces.

**Design principle: efficiency.** The core does the most with the fewest tools
and tokens. This is why there are ~20 tools instead of 50, and why tools like
`ppal-update-clip` handle MIDI, audio, arrangement, and session in one place.
This must be balanced against the complexity of the interface so the AI doesn't
struggle to use the tool correctly.

**What belongs in core:**

- Tools that map directly to Live API calls
- Bug fixes and reliability improvements
- Tool and skill description improvements for better LLM behavior — if you find
  tweaks to the default skills or tool/arg descriptions that work better, these
  can be adopted into the core
- Evaluations and documentation
- Targeted optimizations to reduce cost and improve efficiency — whether for
  small local models, subscription quotas, or pay-as-you-go cloud APIs (no major
  overhauls or breaking changes without very careful consideration)
- Notation refinements — bar|beat and MIDI transform grammars can be iterated
  on, including alternate notations that work better with smaller models
- Support for new Live API surface area as it becomes available

**What does NOT belong in core:**

- Anything requiring external services (audio analysis, generative algorithms,
  online APIs) — these are companion MCP servers
- Anything that can be achieved by teaching the LLM better patterns — these are
  skills or context customizations

### Not Yet in Core

Some Live API features are intentionally deferred:

- **Take lanes** — Limited API support, unclear AI value at this time
- **Grooves** — Very limited API support
- **Tuning systems** — Very limited API support

These features do not appear to be worth the added complexity at this time. This
will be re-evaluated as the Live API evolves.

**Device-specific features** (EQ 8 curves, Wavetable parameters, etc.) may
belong in core if they can be rolled into existing device tools in a
backward-compatible way, or by coordinating breaking changes in a minor/major
version update. Needs investigation to understand the trade-offs before
committing.

## Extension Types

### 1. Context Customization

Everything that shapes LLM behavior without adding new tools or code. Delivered
through `ppal-context` and global configuration.

| Customization                  | What it does                                            |
| ------------------------------ | ------------------------------------------------------- |
| Custom system instructions     | Your own guidance for the LLM (web UI users especially) |
| Skills                         | Override defaults or add new workflow knowledge         |
| Tool/arg description overrides | Tune how the LLM interprets tools for your workflow     |
| Tool combination presets       | Curated tool sets for focused tasks                     |

These could eventually be bundled into named personas — pre-configured
combinations of instructions, skills, and tool settings for specific tasks — but
that's speculative and would only happen if the individual pieces prove useful
first.

**Who it's for:** Anyone who can write clear instructions. No code required.

**Token cost:** On-demand only. Skills load via the same deferred pattern as
`ppal-context` — zero cost until needed.

**Distribution:** Files in a folder. The device UI or config points at a
community directory. No registry needed initially.

**Planned for:** 1.5.0

### 2. Workflows

Pre-defined sequences of tool calls that execute without LLM reasoning in the
loop. The LLM chooses the right workflow and fills in parameters — execution is
mechanical.

**Why this exists:** Some operations are well-understood sequences where LLM
creativity adds nothing and unreliability adds risk. "Set up a standard drum
rack track with a 4-bar loop" is always: create track, add Drum Rack, create
clip. The LLM shouldn't re-derive this every time.

**How it relates to skills:** Skills teach the LLM _how_ to do something and it
still makes each tool call. Workflows _are_ the tool calls — the LLM triggers
them but doesn't improvise the steps. Real-world experience with skills in 1.5.0
will reveal where the gap is and inform the workflow design.

**Open design questions (to be resolved before implementation):**

- Execution model: who runs workflows? A tool? An engine?
- Parameter format: JSON templates? Something more structured?
- Composition: can workflows reference other workflows?
- Discovery: same menu pattern as skills?

**Planned for:** 1.5.x (after context customization is stable)

### 3. Companion MCP Servers

Separate MCP servers that add entirely new tool domains. The LLM sees all
connected servers and combines them naturally.

**Examples:** audio analysis, generative algorithms, sample management, hardware
integration, external DAW bridges.

**Built from `max-mcp-template`:** Starter project with Node for Max / V8
architecture, message passing, and Live API abstractions. The template is the
key enabler for the ecosystem.

**Shared libraries:** Bar|beat notation parsing, chunking protocol, Live API
convenience wrappers. These become the interoperability vocabulary between
companion servers — not just a convenience, but what makes the ecosystem
coherent.

**Who it's for:** Developers comfortable with Node/Max development.

**Distribution:** Own repos, own release cycles. Listed on an ecosystem page on
producer-pal.org.

## Summary

| Type                  | What it is            | Who makes it | Barrier to entry |
| --------------------- | --------------------- | ------------ | ---------------- |
| Context customization | LLM behavior shaping  | Writers      | Lowest           |
| Workflows             | Deterministic recipes | Authors      | Low              |
| Companion servers     | New MCP tool domains  | Developers   | Highest          |

## Timeline

- **1.5.0** — Context customization: custom instructions, skills (override +
  add), tool description overrides, tool presets
- **1.5.x** — Workflows, once the customization foundation is stable and
  real-world usage has informed the design
- **Post-1.5** — Core enters maintenance mode. Bug fixes and Live API evolution
  only. The ecosystem carries the innovation.

Core stability benefits everyone: extensions don't break when core doesn't
change. The core repo is not the bottleneck — writers share skills, developers
build companion servers, and innovation happens at the edges.

**Backward compatibility commitment:** Starting with 1.5, breaking changes
require at least a minor version bump (e.g., 1.6 or 2.0). Patch releases are
always backward-compatible. This gives extension authors a stable foundation to
build on.

## Next Steps

1. Implement context customization in `ppal-context` (1.5.0)
2. Ship `max-mcp-template` — the ecosystem enabler
3. Investigate device-specific features for backward-compatible core additions
4. Design workflow format and execution model (informed by 1.5.0 experience)
5. Publish ecosystem guide on producer-pal.org
