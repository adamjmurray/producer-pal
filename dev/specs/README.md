# Specs

Specifications for the Peggy grammars and their associated parsers and
interpreters. Each spec is an index: the core syntax plus a table pointing at
per-feature files. Read the feature file you need, not the whole tree.

- [BarBeat-Spec.md](BarBeat-Spec.md) — bar|beat notation
  ([src/notation/barbeat/](../../src/notation/barbeat/)); features in
  [barbeat/](barbeat/)
- [Transforms-Spec.md](Transforms-Spec.md) — transform DSL
  ([src/notation/transform/](../../src/notation/transform/)); features in
  [transforms/](transforms/)
- [Stark-Spec.md](Stark-Spec.md) — Stark notation
  ([src/notation/stark/](../../src/notation/stark/))

These have no test guarding them — update them by hand when you change grammar
syntax.
