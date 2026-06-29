# ADR-0003: Deliberately duplicate the note-value grammar

- **Status:** Accepted
- **Date logged:** 2026-06-28

## Context

The note-value lexer — durations (`n/4`), `±n` beat offsets, the off-grid
`n<beats>/4` escape, and `Nbar` forms — appears in three places: the two Peggy
grammars (`barbeat-grammar.peggy`, `transform-grammar.peggy`) and the regexes in
`src/notation/barbeat/time/barbeat-time.ts`. This is textbook DRY violation and
an obvious target for "extract a shared fragment."

## Decision

Keep the duplication on purpose. Do **not** extract a shared grammar fragment.
The contract is held instead by parity tests
(`note-value-grammar-parity.test.ts`, `note-value-denominator-parity.test.ts`)
that assert all sites agree across multiple meters.

## Alternatives rejected

- **Shared Peggy fragment** — Peggy has no import/rule-sharing mechanism, so
  this isn't actually available without a build-time codegen layer we'd have to
  invent and maintain.
- **Route the per-note hot path through the generated parser** — measured as too
  slow; the per-note path is performance-sensitive and the regexes exist
  precisely to stay off the parser.

## Consequences

- DRY is enforced by **test**, not by **structure**: changing one parse site
  without the others is a red build, and any new parse site must be registered
  in the parity tests.
- `dev/Coding-Standards.md` and `AGENTS.md` carry the rule; this ADR carries the
  reasoning so the duplication isn't "cleaned up" by a well-meaning refactor.
- Revisit if Peggy gains rule-sharing, or if the hot path stops being hot.
