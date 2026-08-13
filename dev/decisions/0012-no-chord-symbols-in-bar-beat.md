# ADR-0012: No chord symbols in bar|beat

- **Status:** Accepted
- **Date logged:** 2026-07-03

## Context

Stark supports chord symbols (`Cm7`, `G7/B`, `Fmaj9`) on its `chords:` line,
realized into MIDI pitches by the notation-agnostic
`src/notation/chords/chord-symbols.ts`. That module's docstring anticipated
bar|beat adopting them later, so the question came up.

The motivation was parity alone — "stark has it" — not evidence that models
write worse harmony in bar|beat without symbols. Two facts frame the answer:

- **Symbols are input-only sugar.** A serializer never emits them, because
  naming a set of notes is ambiguous. Read-back is always the literal notes, so
  a symbol is a lossy shorthand for one canonical voicing, never the source of
  truth.
- **bar|beat already expresses chords fully.** Pitches sharing a time position
  are a chord (`1|1 C3 E3 G3`), with per-note velocity, duration, and
  probability and an exact round-trip.

## Decision

No chord symbols in bar|beat. They stay Stark-only. `chord-symbols.ts` remains
notation-agnostic so a future notation could adopt it, but its docstring now
says bar|beat is deliberately excluded rather than implying a TODO.

## Alternatives rejected

- **Bare symbols like stark's** — not viable. bar|beat is a flat token stream
  with octave-bearing pitch tokens, and the common numeric qualities collide
  head-on: `C7`, `C9`, `C6`, `C5`, `C13`, `G7` are each a valid note+octave
  _and_ a chord symbol. Stark escapes this only because its `chords:` header
  declares context; bar|beat has no line headers.
- **Symbols behind a sigil (`=Cmaj7`)** — the only lexically clean path, but it
  invents bar|beat-specific syntax that diverges from stark, adds grammar
  surface and a token to teach, and buys only an input convenience that literal
  simultaneous notes already cover with more expressiveness.

## Consequences

- `chord-symbols.ts` stays imported only by `stark-interpreter.ts`.
- The "a symbol can't capture a specific voicing" worry never applies here —
  bar|beat users just write the notes.
- **Revisit trigger:** concrete evidence that models, especially small ones,
  produce materially worse harmony in bar|beat than they would with symbols. If
  reopened, start from the sigil design; the open questions are the glyph, the
  register anchor (stark uses C2 = 48), and whether a symbol inherits the
  current `v`/`n`/`p` state like a note run.
