# Mutation Testing

Mutation testing validates **test efficacy**, not just coverage. The suite
already enforces 99%+ line/statement and 100% function coverage — but coverage
measures _execution_, not _fault detection_. A test can run a line and assert
nothing. Mutation testing closes that gap: it introduces small faults
("mutants") into the source and checks whether the suite fails. A **surviving
mutant** is a behavior change no test caught — a concrete test-quality gap.

Tool: [Stryker Mutator](https://stryker-mutator.io/) with the Vitest runner. See
`dev/plans/Mutation-Testing.md` for the original CI-rollout plan.

## Running

```bash
npm run mutation
```

This is **scoped to `src/notation/`** and is deliberately **not** part of
`npm run check` — a full pass takes minutes, too slow for the per-PR hot path.

- Config: `config/stryker.config.mjs`
- HTML report (gitignored): `reports/mutation/notation.html` — open it to browse
  survivors per file with the exact source diff of each mutant.
- Reruns are incremental (`reports/mutation/stryker-incremental.json`, also
  gitignored): after the first full pass, only mutants in changed files re-run.

The config reuses the project `vitest.config.ts`, so path aliases (`#src` etc.),
the test environment, and env flags all apply unchanged.
`coverageAnalysis: "perTest"` means each mutant only re-runs the tests that
cover it, not the whole ~8k-test suite — this is the main reason a run is
minutes, not hours.

## Baseline (2026-06-28, `src/notation/`)

First full pass — Stryker 9.6.1, Node 24, `coverageAnalysis: "perTest"`:

| Metric                     | Value      |
| -------------------------- | ---------- |
| **Mutation score**         | **85.45%** |
| Mutants killed             | 2921       |
| Survived                   | 489        |
| Timeout (counts as killed) | 28         |
| No coverage                | 13         |
| Errors (non-compiling)     | 0          |
| Total mutants              | 3451       |
| Wall-clock                 | 5m 45s     |
| Avg tests run per mutant   | 21.6       |

Lowest-scoring files (richest triage targets):

| File                                                                | Score | Survived |
| ------------------------------------------------------------------- | ----- | -------- |
| `transform/helpers/transform-predicate-helpers.ts`                  | 73.3% | 12       |
| `barbeat/interpreter/helpers/barbeat-interpreter-buffer-helpers.ts` | 73.9% | 17       |
| `transform/helpers/note-cut-helpers.ts`                             | 79.3% | 17       |
| `transform/transform-audio-evaluator.ts`                            | 78.7% | 64       |

Clean (100%): `barbeat-apply-v0-deletions.ts`, `barbeat-config.ts`.

## Interpreting survivors

Each survivor falls into one of three buckets — triage before acting:

1. **Real test gap** — the mutated behavior matters but nothing asserts on it.
   Add/strengthen an assertion. This is the payoff.
2. **Equivalent mutant** — the mutation produces behavior indistinguishable from
   the original (e.g. `<=` vs `<` on a bound that's never hit, reordering
   commutative ops). Not fixable; ignore. Stryker can't detect these
   automatically.
3. **Weak-but-acceptable** — defensive code, log strings, or output formatting
   where an assertion would be over-fitting. Judgement call.

`# no coverage` mutants are lines no test exercises at all — usually the easiest
wins, and a cross-check against the line-coverage gate.

## Status & next steps

This is **baseline mode**: the score is reported but `thresholds.break` is
`null`, so the run never fails. Per AJM-560 the next steps (later release) are:

- Triage the 489 survivors into the three buckets above.
- Once a defensible floor is known, set `thresholds.break` to **ratchet** the
  score like the coverage and lint-suppression gates.
- Widen `mutate` to `src/tools/` (write operations first), likely as a scheduled
  (nightly/weekly) non-blocking CI job — full-tree runtime is hours, not
  minutes. See the matrix sketch in `dev/plans/Mutation-Testing.md`.
