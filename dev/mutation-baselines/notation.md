# Mutation baseline — 2026-07-14, `src/notation/`

Current full pass — Stryker 9.6.1, Node 24, `coverageAnalysis: "perTest"`:

| Metric                     | Value      |
| -------------------------- | ---------- |
| **Mutation score**         | **86.90%** |
| Mutants killed             | 3846       |
| Survived                   | 577        |
| Timeout (counts as killed) | 53         |
| No coverage                | 11         |
| Errors (non-compiling)     | 0          |
| Total mutants              | 4487       |
| Wall-clock                 | 7m 31s     |
| Avg tests run per mutant   | 25.6       |

The gate is **ratcheted**: `thresholds.break = 86` in the config, so a run fails
(exit 1) if the score drops below 86% — ~1 point of headroom below the current
score for run-to-run timeout-classification variance (a timeout counts as
killed, so it nudges the score). Raise the floor as the score climbs; never
lower it without triaging the regression.

Lowest-scoring files (remaining triage targets):

| File                                                                | Score | Survived |
| ------------------------------------------------------------------- | ----- | -------- |
| `barbeat/interpreter/helpers/barbeat-interpreter-buffer-helpers.ts` | 78.5% | 14       |
| `transform/transform-audio-evaluator.ts`                            | 78.7% | 64       |
| `barbeat/serializer/helpers/barbeat-serializer-drum.ts`             | 81.2% | 26       |
| `stark/stark-serializer.ts`                                         | 82.7% | 33       |

These are **not** cheap wins: the survivors cluster on `± *_EPSILON` boundary
flips (killing them over-fits to a ~1e-9 / 0.001 slack), warning/error message
strings, and equivalent mutants (e.g. a `.sort()` that is provably a no-op
because its input is already ascending). Triage before acting.

Clean (100%): `apply-v0-deletions.ts`.

## Gaps closed

**2026-07-14** — `chords/chord-symbols.ts` jumped **73.3% → 96.7%**. A
golden-spec table test now asserts every one of the ~44 chord qualities resolves
to the correct intervals — 24 qualities (`min6`, `m7b5`'s cousins, all the
9/11/13 extensions, …) were reachable but unasserted, so blanking their interval
rows survived. Targeted tests also cover the slash-bass-equals-root octave drop
and invalid-root rejection. `stark/stark-serializer.ts` gained an unsorted-input
test: `walkLine` sorts notes by start time, but every prior test already fed
sorted input, so the sort was untested.

| Gap (now killed)                                           | Test added in              |
| ---------------------------------------------------------- | -------------------------- |
| 24 unasserted chord qualities → interval spec              | `chord-symbols.test.ts`    |
| Slash bass equal to the root drops an octave (`>=` vs `>`) | `chord-symbols.test.ts`    |
| Invalid root letter with an accidental is rejected         | `chord-symbols.test.ts`    |
| Serializer sorts unsorted input by start time              | `stark-serializer.test.ts` |

**2026-06-28** — first triage closed three bucket-1 survivors:
`resolveSplitPoints` de-dupe + ascending sort of cut points, the
`MAX_NOTE_PIECES` clamp boundary, and the `validateBufferedState` `buffered > 0`
guard (in `transform-split-note-op.test.ts` and
`barbeat-interpreter-helpers.test.ts`).
