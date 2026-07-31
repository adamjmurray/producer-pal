# ADR-0003: Deliberately duplicate the note-value grammar

- **Status:** Accepted
- **Date logged:** 2026-06-28

## Context

The note-value lexer — durations (`n/4`), `±n` beat offsets, the off-grid
`n<beats>/4` escape, and `Nbar` forms — is written out three times: in both
Peggy grammars (`barbeat-grammar.peggy`, `transform-grammar.peggy`) and as
regexes in `src/notation/barbeat/time/barbeat-time.ts`. It looks like an obvious
target for "extract a shared fragment."

## Decision

Keep the duplication. Parity tests hold the sites in agreement instead:
`note-value-grammar-parity.test.ts` runs one corpus through all six parse sites
across several meters, and `note-value-denominator-parity.test.ts` locks the
serializer's denominator lists.

## Alternatives rejected

- **Share a Peggy fragment** — Peggy has no import or rule-sharing mechanism, so
  this would mean inventing and maintaining a build-time codegen step.
- **Route the per-note path through the parser** — measured as too slow. The
  regexes exist precisely to stay off the parser in hot paths.

## Consequences

- DRY is enforced by test, not by structure. Changing one parse site without the
  others is a red build, and a new parse site has to be added to the parity
  tests.
- The sites are intentionally not byte-identical: the grammars reject
  leading-zero denominators, while the regexes accept a lone `0` so it reaches a
  per-site divide-by-zero message.
- Stark's `DrumPitchName` is duplicated the same way as a regex in
  `stark-interpreter.ts`, locked by `drum-pitch-name-grammar-parity.test.ts`.
- Revisit if Peggy gains rule sharing, or if the hot path stops being hot.
