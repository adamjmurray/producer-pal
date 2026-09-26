# Specs

Specifications for the Peggy grammars and their associated parsers and
interpreters. Each spec folder's README is an index: the core syntax plus a
table pointing at per-feature files. Read the feature file you need, not the
whole tree.

- [barbeat/](barbeat/README.md) — bar|beat notation
  ([src/notation/barbeat/](../../src/notation/barbeat/))
- [transforms/](transforms/README.md) — transform DSL
  ([src/notation/transform/](../../src/notation/transform/))
- [stark-spec.md](stark-spec.md) — Stark notation
  ([src/notation/stark/](../../src/notation/stark/))

These have no test guarding them — update them by hand when you change grammar
syntax.
