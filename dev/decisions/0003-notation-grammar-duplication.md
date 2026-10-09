# ADR-0003: Deliberately duplicate the note-value grammar

- **Status:** Accepted
- **Date logged:** 2026-06-28

## Decision

The note-value lexer (durations, `±n` offsets, the `n<beats>/4` escape,
`<count>bar`) is written out three times: in both Peggy grammars and as regexes
in `src/notation/barbeat/time/barbeat-time.ts`. Keep it that way. Parity tests
hold the sites in step (`note-value-grammar-parity.test.ts`,
`note-value-denominator-parity.test.ts`). A new parse site must be added to
them.

The sites are intentionally not byte-identical: the grammars reject leading-zero
denominators, while the regexes accept a lone `0` so it reaches a per-site
divide-by-zero message. Stark's `DrumPitchName` is duplicated the same way
(`stark-interpreter.ts`, `drum-pitch-name-grammar-parity.test.ts`).

## Rejected

- **A shared Peggy fragment.** Peggy can't share rules, so this means inventing
  a build-time codegen step.
- **Routing the per-note path through the parser.** Too slow. The regexes exist
  to keep the hot path off the parser.

## Revisit if

Peggy gains rule sharing, or the hot path stops being hot.
