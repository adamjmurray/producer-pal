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

| File                                                      | Score | Survived |
| --------------------------------------------------------- | ----- | -------- |
| `barbeat/interpreter/helpers/interpreter-buffer-state.ts` | 78.5% | 14       |
| `transform/transform-audio-evaluator.ts`                  | 78.7% | 64       |
| `barbeat/serializer/helpers/barbeat-serializer-drum.ts`   | 81.2% | 26       |
| `stark/stark-serializer.ts`                               | 82.7% | 33       |

These are **not** cheap wins: the survivors cluster on `± *_EPSILON` boundary
flips (killing them over-fits to a ~1e-9 / 0.001 slack), warning/error message
strings, and equivalent mutants (e.g. a `.sort()` that is provably a no-op
because its input is already ascending). Triage before acting.

Clean (100%): `apply-v0-deletions.ts`.

## What changed

- **2026-07-14**: `chords/chord-symbols.ts` went **73.3% → 96.7%**. A
  golden-spec table test now asserts all ~44 chord qualities resolve to the
  right intervals (24 were reachable but unasserted, so blanking their rows
  survived), plus the slash-bass-equals-root octave drop and invalid-root
  rejection. `stark/stark-serializer.ts` gained an unsorted-input test: its sort
  by start time was untested because every earlier test fed sorted input.
- **2026-06-28**: the first triage closed three bucket-1 survivors:
  `resolveSplitPoints` de-dupe and ascending sort, the `MAX_NOTE_PIECES` clamp
  boundary, and the `validateBufferedState` `buffered > 0` guard.
