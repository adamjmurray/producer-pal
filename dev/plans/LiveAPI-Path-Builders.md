# LiveAPI Path Builders — Full Codebase Adoption

## Problem

Hardcoded Live API path strings like `"live_set tracks 0 devices 1"` and
`` `live_set tracks ${trackIndex}` `` are scattered throughout the codebase —
both production code and tests. These are bug-prone (typos, inconsistent
formatting), hard to refactor, and lack type safety. The `livePath` builder
already exists as a test helper but should be promoted to a shared production
module and adopted everywhere.

## Current State (as of 2026-02-14)

### Phase 0: Productize the Builder — DONE

- Moved `src/test/helpers/live-api-path-builders.ts` →
  `src/shared/live-api-path-builders.ts` and updated all 69 importing files
- Expanded API: `returnTrack()` and `masterTrack()` now return chainable
  `TrackPath`; added `DevicePath.chain()`, `.returnChain()`, `.drumPad()` with
  `ChainPath` for arbitrary nesting depth; added `livePath.liveSet` and
  `livePath.view.*` constants
- `LiveAPI.from()` and `parseIdOrPath()` now accept `PathLike` objects directly
- 35 tests with 100% coverage in `src/shared/live-api-path-builders.test.ts`
- Coding standard added to `AGENTS.md` and `dev/Coding-Standards.md` (includes
  full API reference)

---

## Phase 1: Production Source Code (~65 instances, ~30 files) — DONE

All hardcoded path strings in production source files replaced with `livePath`
builders across 3 batches (1a, 1b, 1c).

### Batch 1a: Path Construction + View Paths (~31 instances, 6 files) — DONE

Adopted `livePath` builders in `select-helpers.ts`, `select.ts`,
`device-path-to-live-api.ts`, `device-path-helpers.ts`,
`device-chain-creation-helpers.ts`, and `read-track.ts`.

### Batch 1b: Clip Slot / Arrangement Paths (~15 instances, 6 files) — DONE

Adopted `livePath` builders in `arrangement-tiling.ts`,
`arrangement-splitting.ts`, `playback.ts`, `clip-result-helpers.ts`,
`read-track-helpers.ts`, and `duplicate-helpers.ts`. Updated custom test mocks
in `duplicate-helpers.test.ts` to accept `PathLike`.

### Batch 1c: Simple `LiveAPI.from("live_set")` + View Paths (~33 instances, 18 files) — DONE

Adopted `livePath` builders in 18 production files: `create-clip.ts`,
`read-clip-helpers.ts`, `code-exec-helpers.ts`,
`update-clip-quantization-helpers.ts`, `arrangement-operations-helpers.ts`,
`update-device-wrap-helpers.ts`, `update-device-helpers.ts`, `read-live-set.ts`,
`update-live-set.ts`, `delete.ts`, `duplicate.ts`,
`duplicate-track-scene-helpers.ts`, `duplicate-routing-helpers.ts`,
`duplicate-clip-position-helpers.ts`, `duplicate-device-helpers.ts`,
`capture-scene.ts`, `create-scene.ts`, and `live-set-helpers.ts`.

---

## Phase 2: Remaining Test Files + Test Helpers

~62 test files + ~10 test helpers, ~1,094 instances. Each batch includes its
related test helpers so batches are self-contained.

**All batches are fully parallel-safe — no file overlaps.**

### Batch 2a: Duplicate — Scene & Validation (~93 instances, 3 files)

- `duplicate-scene.test.ts` (83)
- `duplicate-validation.test.ts` (10)

### Batch 2b: Duplicate — Track-Scene Helpers (~91 instances, 3 files)

- `duplicate-track-scene-helpers.test.ts` (79)
- `duplicate-helpers.test.ts` (12)

### Batch 2c: Duplicate — Device & Arrangement Length (~106 instances, 2 files)

- `duplicate-device.test.ts` (53)
- `duplicate-arrangement-length.test.ts` (53)

### Batch 2d: Duplicate — Track & Clip (~92 instances, 3 files)

- `duplicate-track.test.ts` (47)
- `duplicate-clip.test.ts` (45)

### Batch 2e: Duplicate — Advanced & Locator (~77 instances, 3 files)

- `duplicate-advanced-features.test.ts` (44)
- `duplicate-locator.test.ts` (33)
- `duplicate-test-helpers.ts` — shared test helper

### Batch 2f: Scene Operations (~87 instances, 4 files)

- `create-scene.test.ts` (44)
- `capture-scene.test.ts` (36)
- `read-scene.test.ts` (4)
- `update-scene.test.ts` (3)

### Batch 2g: Control Operations (~95 instances, 7 files)

- `playback-basic.test.ts` (20)
- `select-advanced.test.ts` (17) — already has livePath, finish conversion
- `select-basic.test.ts` (16) — already has livePath, finish conversion
- `playback-features.test.ts` (7)
- `raw-live-api.test.ts` (10)
- `playback-test-helpers.ts` (9) — shared test helper
- `select-test-helpers.ts` (7) — shared test helper

### Batch 2h: Track & Device Operations (~151 instances, ~17 files)

- `read-track-options.test.ts` (22)
- `read-track-parameters.test.ts` (13)
- `update-track-mixer.test.ts` (13)
- `update-track-send.test.ts` (11)
- Plus partial conversions in files already importing livePath (~60 remaining)
- Device: `read-device-path.test.ts` (4), etc.
- `read-track-test-helpers.ts` — shared test helper
- `read-track-registry-test-helpers.ts` — shared test helper
- `read-track-path-mapped-test-helpers.ts` — shared test helper
- `read-device-test-helpers.ts` — shared test helper

### Batch 2i: Live-Set, Delete, Workflow (~116 instances, ~10 files)

- `update-live-set.test.ts` (21)
- `delete.test.ts` (26)
- `connect-core.test.ts` (11)
- `read-live-set-routing.test.ts` (6)
- Plus finishing partial conversions in already-imported files
- `read-live-set-path-mapped-test-helpers.ts` — shared test helper

### Batch 2j: Clip & Remaining (~35 instances, ~5 files)

- `create-clip-audio.test.ts` (28)
- `arrangement-operations-helpers.test.ts` (4)
- `update-clip-quantization.test.ts` (1)
- `read-clip-test-helpers.ts` — shared test helper
- Miscellaneous stragglers

---

## Parallelism

All batches within each phase are designed with **zero file overlaps**, making
them safe to run as parallel subagents. Phase 1 (3 batches) and Phase 2 (10
batches) can also run in parallel with each other since production source and
test files don't overlap.

Total: **13 independent batches** that can all run concurrently.

---

## Verification

After each batch:

1. `npm run fix` — auto-fix formatting
2. `npm run check` — lint + typecheck + format + tests + coverage
3. Commit with descriptive message following existing pattern:
   `"Adopt livePath builders in X files for <area>"`

When running batches in parallel, each agent should verify independently. Merge
conflicts are not expected since batches have no file overlaps.

## Out of Scope

- **Regex patterns in `live-api-extensions.ts`** — These extract indices from
  paths and legitimately need regex. Not candidates for replacement.
- **Path parsing/detection tests** — Tests for `detectTypeFromPath()` and
  similar deliberately use raw strings.
- **`raw-live-api.ts` default path** — The string `"live_set"` as a default
  value is fine.
