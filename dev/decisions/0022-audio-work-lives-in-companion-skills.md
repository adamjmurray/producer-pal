# ADR-0022: Audio generation and analysis live in companion skills

- **Status:** Accepted
- **Date logged:** 2026-08-12

## Decision

Producer Pal manages audio clips (gain, pitch, warp, samples on Simpler) but
never touches audio content. Generating a sample and analyzing audio both live
outside the device, in the companion Agent Skills (`examples/skills/`
`ableton-audio-generator`, `ableton-export-audio`, `ableton-analyze-audio`). The
agent writes DSP for the request and hands Producer Pal a finished file to load.

The two halves differ. Analysis is impossible from the device: the Live API
exposes no audio content, Live has no render API, and V8 has no filesystem.
Generation is possible (a sample is arithmetic and a WAV header), so it needed a
real decision.

This is stated as settled in the Features and Extending docs. Reversing it means
updating both.

## Rejected

- **A synthesis DSL.** Transforms work as a DSL because MIDI transformation has
  a small vocabulary. Every new timbre wants an operator the grammar lacks, so
  the DSL stays uselessly narrow or grows into a language we then teach the
  model on every conversation. An agent already writes DSP fluently.
- **Running model-supplied code in the device.** Arbitrary code inside the
  user's Live process is a security boundary we don't want to own.
- **A fixed library of generators (kick, snare, sweep).** Answers "make a kick"
  and nothing past it.
- **Bundling an audio library into the device.** No package manager in V8, and
  it grows the device for a feature most users never touch.

## Revisit if

Live gets a render API, or MCP chat clients need audio generation without a
coding agent.
