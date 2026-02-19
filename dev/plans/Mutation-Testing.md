# Mutation Testing Plan

## Goal

Audit test quality across the codebase using mutation testing to catch weak or
missing assertions — especially after the mock registry migration which touched
83 test files.

## What Is Mutation Testing?

Mutation testing systematically modifies source code (flips conditionals,
removes calls, changes values) and checks that tests catch each mutation. A
"surviving" mutant means tests pass despite the change — indicating a gap in
assertions.

## Tool: Stryker Mutator

[Stryker](https://stryker-mutator.io/) supports Vitest and TypeScript. It
integrates with CI and produces HTML reports showing surviving mutants per file.

## Effort Estimate

- **Mutatable lines:** ~30-40% of ~20k LOC is actual logic (not imports, types,
  string literals, config objects) → ~6k-8k lines
- **Mutants generated:** ~5-8 per mutatable line → ~35k-60k mutants
- **Per-mutant time:** Stryker only runs covering tests per mutant, not the full
  suite. With ~5.5s wall clock and good parallelism, ~0.5-1.5s average per
  mutant after filtering
- **Total:** roughly 8-20 hours for a full run

Not viable per-commit, but feasible overnight or on a schedule. Stryker's
`--incremental` mode on subsequent runs only re-tests mutants in changed files,
which would be fast enough for PR-level checks.

## Practical Strategy

### Phase 1: Calibrate with a single module

```bash
npx stryker run --mutate 'src/notation/**/*.ts'
```

This gives real numbers for mutant count and per-mutant timing to extrapolate
from. The notation module is a good candidate: self-contained, pure logic, and
has known-good test coverage.

### Phase 2: CI integration with scheduled matrix

GitHub Actions is free for public repos (unlimited minutes). The constraint is a
**6-hour hard cap per job** on GitHub-hosted runners.

Split the codebase into module groups running as parallel matrix jobs:

```yaml
on:
  schedule:
    - cron: "0 3 * * 1" # Weekly Monday 3am UTC

jobs:
  mutation-test:
    strategy:
      fail-fast: false
      matrix:
        mutate:
          - "src/notation/**/*.ts"
          - "src/tools/clip/**/*.ts"
          - "src/tools/track/**/*.ts"
          - "src/tools/device/**/*.ts"
          - "src/tools/operations/**/*.ts"
          - "src/tools/{scene,control,live-set,workflow}/**/*.ts"
    steps:
      - run: npx stryker run --mutate '${{ matrix.mutate }}'
      # Upload HTML report as artifact
```

Each matrix entry runs in parallel with its own 6-hour window. With 4-6 groups,
total wall-clock time would be the slowest module (likely 2-3 hours), well under
the cap.

### Phase 3: Incremental on PRs

After the first full run, use `--incremental` mode to only re-test mutants in
changed files. This brings per-PR runs down to minutes, making it viable as a
non-blocking CI check.

## Priority Areas

Focus mutation testing on high-risk areas first:

1. **Write operations** (`update-*`, `create-*`, `delete`) — incorrect
   assertions here could mask bugs that modify Live Sets
2. **Recently migrated test files** — the 83 files touched in the mock registry
   migration are the most likely to have weakened assertions
3. **Arrangement operations** — complex logic with edge cases around clip
   splitting, tiling, and boundary detection

## Alternative: Lightweight One-Time Audit

Before investing in Stryker, a lighter-weight check: script that compares
assertion counts between `main` and `dev` for each migrated test file. Files
where assertion count dropped significantly are candidates for manual review.
