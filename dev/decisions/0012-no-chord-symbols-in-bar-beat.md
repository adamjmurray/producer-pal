# ADR-0012: No chord symbols in bar|beat

- **Status:** Accepted
- **Date logged:** 2026-07-03

## Decision

Chord symbols (`Cm7`, `G7/B`) stay Stark-only. bar|beat already expresses chords
fully: notes at the same time position are a chord (`1|1 C3 E3 G3`), with
per-note velocity, duration and probability, and an exact round-trip. A symbol
is input-only shorthand (a serializer can't name notes back unambiguously), so
it adds nothing bar|beat can't already say. `chord-symbols.ts` stays
notation-agnostic but is imported only by `stark-interpreter.ts`.

## Rejected

- **Bare symbols like Stark's.** bar|beat has no line headers, so `C7`, `C9`,
  `C6`, `C5`, `C13` and `G7` are each both a valid note+octave and a chord
  symbol. Stark avoids this only because its `chords:` header sets the context.
- **Symbols behind a sigil (`=Cmaj7`).** Lexically clean, but it adds
  bar|beat-only syntax, grammar surface and something to teach, for an input
  convenience literal notes already cover.

## Revisit if

Models, especially small ones, write materially worse harmony in bar|beat than
they would with symbols. Start from the sigil design. Open questions: the glyph,
the register anchor (Stark uses C2 = 48), and whether a symbol inherits the
current `v`/`n`/`p` state.
