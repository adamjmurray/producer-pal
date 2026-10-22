# Mutation baseline — 2026-07-15, `src/tools/clip/`

`create` / `read` / `update` clip tools plus arrangement operations, in-clip
code execution, and the shared clip helpers (28 mutated files, the biggest
domain). Full pass — Stryker 9.6.1, Node 24, `coverageAnalysis: "perTest"`:

| Metric                     | Value      |
| -------------------------- | ---------- |
| **Mutation score**         | **97.48%** |
| Mutants killed             | 1741       |
| Survived                   | 45         |
| Timeout (counts as killed) | 1          |
| No coverage                | 0          |
| Total mutants              | 1787       |
| Wall-clock                 | 2m 0s      |

Gate: `break: 96` (`TOOL_DOMAIN_BREAKS.clip`), ~1.5 points below the score for
timeout-classification variance. Triage lifted the score from an **80.23%**
baseline (338 survivors) by killing ~297 mutants with test-only changes. It
finished with the highest score of the write-op domains because the clip helpers
are mostly pure functions with tight, directly testable contracts.

Scope change: `toolDomain()` in `config/mutation-scopes.mjs` excludes
`*-disabled.ts`, the build-time stubs rolldown swaps in when a feature flag is
off (e.g. `ENABLE_CODE_EXEC`). Tests run with the feature on, so the stubs are
never imported: 14 all-`NoCoverage` mutants that can never be killed.
`vitest.config.ts` already coverage-excludes them.

Per-file scores after triage (files with remaining survivors; 12 more hit 100%):

| File                                     | Score  | Survived | Notes                                   |
| ---------------------------------------- | ------ | -------- | --------------------------------------- |
| `update-clip-arrangement-overwrite-plan` | 90.32% | 6        | merge-group length boundary (bkt 2)     |
| `note-updates`                           | 91.82% | 9        | redundant fast-path guards (bkt 2)      |
| `clip-data-preparation`                  | 93.02% | 6        | loop-region default equivalents         |
| `update-clip.ts`                         | 93.75% | 6        | toSlot dual-return + split integ.       |
| `audio-clip-creation`                    | 95.45% | 1        | arrangementStart null-guard (bkt 2)     |
| `clip-properties-to-set`                 | 96.47% | 3        | setEndFirst redundant operands          |
| `clip-resolution`                        | 97.30% | 2        | dead `=== ""` clause (bkt 2)            |
| `code-execution-context`                 | 97.75% | 2        | view-branch guards (weak, need LiveAPI) |
| `read-clip.ts`                           | 98.31% | 3        | `?? "barbeat"` fallthrough (bkt 2)      |
| 7 more (`create-clip.ts`, timing, …)     | 98–99% | 1 each   | isolated equivalents (bkt 2)            |

(`update-clip-arrangement-overwrite-plan` was removed when update-clip moved to
the shared write pipeline.)

The remaining survivors are overwhelmingly bucket 2 (equivalent):

- **Redundant fast-path guards** in `note-updates`: an early
  `existingNotes.length === 0` / `preTransformString == null` short-circuit
  duplicating a guard `applyTransforms` already performs.
- **Merge-group length boundaries**: `>= 1` / `< 1` on group lengths the merge
  loop can only enter with at least one element.
- **Dual null-returns** (the `toSlot` parser, now `resolveMoveDestination` in
  `move-destinations.ts`): the `toSlot == null` return and the
  `slots.length === 0` return converge on the same `null`.
- **Never-nullish fallbacks / never-equal bounds**: `?? "barbeat"` (both
  branches fall through `resolveNotation`), the `"arrangement" → ""` view string
  never surfaced in a result, and `color` / `arrangementStart` null-guards
  behind a `setAll` that already skips null.

The only weak-but-not-equivalent leftovers are the arrangement-splitting branch
in `update-clip.ts` and the `code-execution-context` view guards: reachable, low
value, left for an integration pass.

What changed (test-only): loop/unlooped arrangement property math
(`unlooped-lengthening.test.ts`, 43 mutants, 0 → 100%); the
`buildClipPropertiesToSet` boundary/loop-flag matrix; loop-region defaults and
transform normalization on create; note transform, timing and audio helper
conditionals and warnings; read-clip warp-marker and notation branches; in-clip
code-exec guards, deadline and scale-mask; create-clip name/color distribution
and take-lane resolution.

Lesson: the `undefined`-valued-property gotcha from `device.md` applies here
too. A `buildClipProperties` `if (clipName)` guard forced to `true` writes
`name: undefined`, which a `.name` → `toBeUndefined()` assertion can't tell from
an absent property. Use `not.toHaveProperty("name")`.
