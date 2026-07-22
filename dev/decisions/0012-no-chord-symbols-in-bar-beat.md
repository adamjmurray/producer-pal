# ADR-0012: No chord symbols in bar|beat

- **Status:** Accepted
- **Date logged:** 2026-07-03

## Context

Stark supports chord **symbols** (`Cm7`, `G7/B`, `Fmaj9`) on its `chords:` line:
a root + quality + optional slash bass that the shared, notation-agnostic
`src/notation/chords/chord-symbols.ts` realizes into concrete MIDI pitches
(closed, root position, stacked from a register default; slash bass gives
inversions). That module's docstring anticipated adopting the same in bar|beat
"later," so the question came up: should bar|beat get chord symbols too?

The stated motivation was purely parity — "stark has it" — not evidence that a
model produces worse harmony in bar|beat without symbols.

Two facts frame the answer:

- **Chord symbols are input-only sugar.** A serializer never emits them (naming
  a set of notes is ambiguous and would fight the notations' literal
  round-trip); read-back is always the realized literal notes. So a symbol is a
  lossy _input_ shorthand for **one** canonical voicing, never the source of
  truth.
- **bar|beat already expresses chords fully.** Pitches sharing a time position
  are a chord (`1|1 C3 E3 G3`), with per-note velocity/duration/probability and
  exact round-trip. Nothing about harmony is _missing_ that symbols would add —
  they would only be a faster way to type common shapes.

## Decision

Do not add chord symbols to bar|beat. They stay Stark-only. `chord-symbols.ts`
remains notation-agnostic so a _future_ notation could adopt it, but bar|beat is
intentionally excluded — its docstring says so rather than implying a TODO.

## Alternatives rejected

- **Bare symbols like stark (`Cmaj7`, `C7`)** — not viable. bar|beat is a flat
  token stream with **octave-bearing** pitch tokens (`C7` = note C in octave 7),
  and the common numeric chord qualities collide head-on: `C7`, `C9`, `C6`,
  `C5`, `C13`, `G7` are each simultaneously a valid note+octave token _and_ a
  chord symbol. Stark avoids this only because its `chords:` line header
  declares context up front; bar|beat has no line headers to disambiguate
  against.
- **Symbols behind a sigil (`=Cmaj7`, `$G7/B`)** — the only lexically clean
  path, but rejected: it invents a bar|beat-specific syntax that diverges from
  stark's clean bare form, adds grammar surface and a token to teach (including
  to small models), and buys only an input convenience that bar|beat's literal
  simultaneous notes already cover with strictly more expressiveness.

## Consequences

- `src/notation/chords/chord-symbols.ts` stays imported only by
  `stark-interpreter.ts`; its docstring now states bar|beat is deliberately out.
- The "full voicing/inversion is hard to encode in a symbol" worry that prompted
  this never applies: bar|beat users needing a specific voicing write literal
  notes; there is no symbol layer trying (and failing) to capture it.
- **Revisit trigger:** concrete evidence that models — especially small ones —
  produce materially worse harmony in bar|beat than they would with symbols. If
  reopened, the sigil path above is the design starting point, and the remaining
  decisions are the sigil glyph, the register anchor (stark uses C2 = 48), and
  confirming a symbol inherits the current `v`/`n`/`p` state like a note run.
