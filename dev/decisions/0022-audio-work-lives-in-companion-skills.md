# ADR-0022: Audio generation and analysis live in companion skills

- **Status:** Accepted
- **Date logged:** 2026-08-12

## Context

"Generate a kick drum" and "how does my mix sound" are two of the most common
requests Producer Pal gets, and it can't do either. The device manages audio
clips — gain, pitch, warp, samples on Simpler — but never touches audio content.

The two halves fail for different reasons, which is why the answer isn't the
same for both:

- **Analysis** is impossible from the device. The Live API exposes no audio
  content, Live has no render API (the Export dialog is UI-only), and the V8
  runtime has no filesystem and can't call an external service.
- **Generation** is not impossible. Synthesizing a sample is arithmetic and a
  WAV header. The device could technically do it.

So generation needed an actual decision, not just an admission of a platform
limit.

## Decision

Both live outside the device, in the companion Agent Skills
(`examples/skills/ableton-audio-generator`,
`examples/skills/ableton-analyze-audio`). The agent writes DSP for the specific
request and hands Producer Pal a finished sample file to load, which the
existing tools already do.

## Alternatives rejected

- **A synthesis DSL — parameters or an expression language for building
  sounds.** This is the real alternative, and the reason it loses is scope.
  [Transforms](../specs/Transforms-Spec.md) work as a DSL because MIDI
  transformation has a small vocabulary. Synthesis doesn't: every new timbre
  wants an operator the grammar doesn't have, so the DSL either stays narrow
  enough to be useless or grows until it's a programming language we also have
  to teach the model in the skills, on every conversation. An agent already
  knows how to write DSP in a language it's fluent in.
- **Execute model-supplied code in the device.** Removes the teaching problem,
  but arbitrary code inside the user's Live process is not a security boundary
  we want to own. The Direct Live API tool is already the far edge of what's
  reasonable there, and it's off by default.
- **Ship a fixed library of generators** (kick, snare, noise sweep…).
  Predictable and safe, but it answers "make a kick" and nothing past it. The
  requests that motivate this are open-ended by nature.
- **Bundle an audio library into the Max device.** No package manager in the V8
  runtime, and it would grow the device for a feature most users never touch.

## Consequences

- The capability is real but only for users on a coding agent. MCP chat clients
  can't reach it. That gap is a genuine reason to pick the
  [Agent Skill](https://producer-pal.org/guide/skills) path.
- The Limitations section on the Features page and the "Drive it from a coding
  agent" section on Extending both state this as settled, not as a roadmap item.
  If that ever reverses, both need updating along with a superseding ADR.
- The analysis skill's render step is macOS-only (AppleScript against the Export
  dialog). Nothing about this decision fixes that; it's Live's missing render
  API.
