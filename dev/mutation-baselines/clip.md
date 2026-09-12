# Mutation baseline — 2026-07-15, `src/tools/clip/`

Fifth and largest write-op domain triaged (`create` / `read` / `update` clip
tools plus arrangement operations, in-clip code execution, and the shared clip
helpers) — this completes the write-op tier. Full pass — Stryker 9.6.1, Node 24,
`coverageAnalysis: "perTest"`:

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
baseline (338 survivors), killing ~297 mutants with test-only changes — no
product code touched. This was by far the biggest domain (28 mutated files, 1787
mutants — more than `track` + `session` + `actions` combined) yet finished with
the **highest** final score of the five write-op domains, because the clip
helpers are mostly pure functions with tight, directly-unit-testable contracts.

One scope-config change accompanied the tests: `toolDomain()` in
`config/mutation-scopes.mjs` now excludes `*-disabled.ts`, the build-time
substitution stubs rolldown swaps in when a feature flag is off (e.g.
`ENABLE_CODE_EXEC`). Tests run with the feature enabled, so the stubs are never
imported — 14 all-`NoCoverage` mutants that can never be killed.
`vitest.config.ts` already coverage-excludes them; this mirrors that exclusion.

Per-file scores after triage (files with remaining survivors; 12 more files hit
100%):

| File                                 | Score  | Survived | Notes                                   |
| ------------------------------------ | ------ | -------- | --------------------------------------- |
| `update-clip-arrangement-optimizer`  | 90.32% | 6        | merge-group length boundary (bkt 2)     |
| `update-clip-notes-helpers`          | 91.82% | 9        | redundant fast-path guards (bkt 2)      |
| `create-clip-loop-helpers`           | 93.02% | 6        | loop-region default equivalents         |
| `update-clip.ts`                     | 93.75% | 6        | toSlot dual-return + split integ.       |
| `create-clip-audio-helpers`          | 95.45% | 1        | arrangementStart null-guard (bkt 2)     |
| `update-clip-properties-helpers`     | 96.47% | 3        | setEndFirst redundant operands          |
| `read-clip-helpers`                  | 97.30% | 2        | dead `=== ""` clause (bkt 2)            |
| `code-exec-helpers`                  | 97.75% | 2        | view-branch guards (weak, need LiveAPI) |
| `read-clip.ts`                       | 98.31% | 3        | `?? "barbeat"` fallthrough (bkt 2)      |
| 7 more (`create-clip.ts`, timing, …) | 98–99% | 1 each   | isolated equivalents (bkt 2)            |

The remaining 45 survivors are overwhelmingly **bucket 2 (equivalent)**. The
recurring shapes:

- **Redundant fast-path guards** (`update-clip-notes-helpers` L201/L309/L353):
  an early `existingNotes.length === 0` / `preTransformString == null` short-
  circuit duplicating a guard `applyTransforms` already performs internally, so
  forcing it changes nothing observable.
- **Merge-group length boundaries** (`update-clip-arrangement-optimizer`):
  `>= 1` / `< 1` on group lengths the merge loop can only ever enter with ≥1
  element.
- **Dual null-returns** (`update-clip.ts` `parseToSlotParam`, since moved to
  `resolveMoveDestination` in `update-clip-session-helpers.ts`): the
  `toSlot == null` early return and the `slots.length === 0` return converge on
  the same `null`.
- **Never-nullish fallbacks / never-equal bounds** across create/read helpers:
  `?? "barbeat"` (both branches fall through `resolveNotation`), the
  `"arrangement" → ""` view string never surfaced in a result, `color` /
  `arrangementStart` null-guards behind a `setAll` that already skips null.

The only weak-not-equivalent leftovers are the arrangement-splitting branch in
`update-clip.ts` (L353) and the `buildCodeLocationContext` view guards
(`code-exec-helpers` L221/L225) — reachable but low-value defensive paths left
for a future integration pass.

## Gaps closed (clip)

Same `undefined`-valued-property gotcha as the device pass (see above): a
`buildClipProperties` `if (clipName)` guard forced to `true` writes
`name: undefined`, which a `.name` → `toBeUndefined()` assertion cannot
distinguish from an absent property. Fixed with `not.toHaveProperty("name")`.

| Gap (now killed)                                                    | Test strengthened / added                          |
| ------------------------------------------------------------------- | -------------------------------------------------- |
| Loop/unlooped arrangement clip property math (43 mutants, 0 → 100%) | `arrangement-unlooped-helpers.test.ts`             |
| `buildClipPropertiesToSet` boundary/loop-flag matrix                | `update-clip-properties.test.ts`                   |
| Loop-region defaults + transform normalization (create)             | `create-clip-loop-helpers.test.ts`, `-transform`   |
| Note transform / timing / audio helper conditionals + warns         | `update-clip-notes-helpers.test.ts`, `-timing`     |
| read-clip warp-marker + notation-resolution branches                | `read-clip-coverage.test.ts`, `read-clip-helpers`  |
| In-clip code-exec helper guards + deadline / scale-mask             | `code-exec-helpers-coverage.test.ts`, `scale-mask` |
| create-clip name/color distribution + take-lane resolution          | `create-clip-*.test.ts` (basic/advanced/…)         |
| Empty `clipName` must not write a `name` property                   | `create-clip-advanced.test.ts`                     |
