# Mutation Testing

Mutation testing validates **test efficacy**, not just coverage. The suite
already enforces 99%+ line/statement and 100% function coverage — but coverage
measures _execution_, not _fault detection_. A test can run a line and assert
nothing. Mutation testing closes that gap: it introduces small faults
("mutants") into the source and checks whether the suite fails. A **surviving
mutant** is a behavior change no test caught — a concrete test-quality gap.

Tool: [Stryker Mutator](https://stryker-mutator.io/) with the Vitest runner. The
full CI-rollout plan (scheduled matrix, incremental PR checks, priority areas)
is tracked as project work; the matrix sketch is inlined under "Status & next
steps" below.

## Running

```bash
npm run mutation                 # default scope: notation
npm run mutation -- clip         # one src/tools/ domain
npm run mutation -- tools        # every tool domain (group)
npm run mutation -- notation clip
npm run mutation -- all          # notation + every tool domain
```

Mutation testing is **scoped** and deliberately **not** part of `npm run check`
— a full pass takes minutes, too slow for the per-PR hot path. Whole-tree runs
are hours, so we mutate one area ("scope") at a time.

Scopes are defined in `config/mutation-scopes.mjs`:

- **`notation`** — `src/notation/` (the default). Ratcheted: `break: 86`.
- **One scope per `src/tools/` domain** — `actions`, `advanced`, `clip`, `core`,
  `device`, `live-set`, `scene`, `session`, `shared`, `track`. Each excludes
  tests, test helpers, `.def.ts` tool-definition files, and type-only modules
  (see `toolDomain()`). A domain starts in **baseline mode** (`break: null`,
  measure-only) until its survivors are triaged in its own PR and it earns a
  floor in `TOOL_DOMAIN_BREAKS`; `track` is the first, ratcheted at `break: 85`.
- **Groups** — `tools` (all ten tool domains) and `all` (notation + tools),
  expanded by the runner into their member scopes.

Mechanics:

- Runner: `config/run-mutation.mjs` — resolves the requested scopes/groups,
  rebuilds the peggy parsers, then runs Stryker once per scope with
  `MUTATION_SCOPE` set, aggregating exit codes (non-zero if any gate fires).
- Config: `config/stryker.config.mjs` — reads `MUTATION_SCOPE` (default
  `notation`) and pulls that scope's `mutate` globs and `break` gate from the
  scope table.
- HTML report + incremental cache are **per scope** and gitignored:
  `reports/mutation/<scope>.html` and
  `reports/mutation/<scope>-incremental.json`. Per-scope incremental files mean
  running one scope no longer clobbers another's cache. Open the HTML report to
  browse survivors per file with the exact source diff of each mutant.

The config reuses the project `vitest.config.ts`, so path aliases (`#src` etc.),
the test environment, and env flags all apply unchanged.
`coverageAnalysis: "perTest"` means each mutant only re-runs the tests that
cover it, not the whole ~8k-test suite — this is the main reason a run is
minutes, not hours.

### Adding a new scope

Add an entry to `SCOPES` in `config/mutation-scopes.mjs` (`mutate` globs +
`break: null` for baseline mode); tool domains can use the `toolDomain()`
helper. Optionally add it to a group. That's it — the config and runner pick it
up by name.

## Baseline (2026-07-14, `src/notation/`)

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

Clean (100%): `barbeat-apply-v0-deletions.ts`.

### Gaps closed

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

## Baseline (2026-07-14, `src/tools/track/`)

First `src/tools/` domain triaged (highest-priority write-op tier). Full pass —
Stryker 9.6.1, Node 24, `coverageAnalysis: "perTest"`:

| Metric                     | Value      |
| -------------------------- | ---------- |
| **Mutation score**         | **86.15%** |
| Mutants killed             | 764        |
| Survived                   | 116        |
| Timeout (counts as killed) | 1          |
| No coverage                | 7          |
| Total mutants              | 888        |
| Wall-clock                 | 54s        |

Gate: `break: 85` (`TOOL_DOMAIN_BREAKS.track` in `config/mutation-scopes.mjs`),
~1 point below the score for timeout-classification variance.

Two scope refinements landed with this triage (both in `toolDomain()`), applying
to **every** tool domain going forward:

- **`.def.ts` excluded.** Tool-definition files are purely declarative — a
  `defineTool()` call (Zod schema + LLM-facing description strings), no logic.
  Mutating a `.describe("…")` string just blanks prose that is eval-tested, not
  unit-tested; asserting exact wording would over-fit and fight the
  description-iteration workflow. This lifted the raw `track` score from 73.14%
  (dominated by 111 description-string survivors across 3 def files) to a
  behavioral 82.21%.
- **`*-mock-helpers.ts` excluded.** `read-track-drum-rack-mock-helpers.ts` is
  test-only mock infrastructure (it imports the mock Live API; its sole importer
  is another test helper), so mutating it is meaningless. The exclusion glob
  already caught `*-test-helpers.ts`; extended to `*-mock-helpers.ts` too. Left
  source-classified for coverage — only the mutation scope excludes it.

Per-file scores after triage:

| File                           | Score  | Survived |
| ------------------------------ | ------ | -------- |
| `track-routing-helpers.ts`     | 96.88% | 2        |
| `read-track.ts`                | 88.76% | 18       |
| `update-track.ts`              | 87.69% | 31       |
| `read-track-helpers.ts`        | 86.18% | 30       |
| `create-track.ts`              | 85.34% | 17       |
| `read-track-device-helpers.ts` | 58.49% | 18       |

`read-track-device-helpers.ts` is the low outlier by design, not weak testing:
most of its survivors are **equivalent mutants**. `categorizeDevices` splits
devices into midi-effect / instrument / audio-effect buckets, but its sole
consumer (`read-track.ts`'s drum-map path) immediately re-flattens them — so
mutating which bucket a device lands in cannot change any observable output.

### Gaps closed (track)

Mutation surfaced that several "warn and skip" tests asserted only the returned
`{id}` object (returned regardless), never the warning or the skipped write — so
real misbehavior slipped through (an unmatched `sendReturn` would silently write
the _wrong_ send):

| Gap (now killed)                                                     | Test strengthened / added    |
| -------------------------------------------------------------------- | ---------------------------- |
| Unmatched `sendReturn` silently wrote the wrong send (sentinel flip) | `update-track-send.test.ts`  |
| Send letter-prefix over-matched (`"A"` matched `"Analog"`)           | `update-track-send.test.ts`  |
| Send-pair / no-mixer / no-sends / index-exceeds warnings unasserted  | `update-track-send.test.ts`  |
| Invalid `monitoringState` wrote an undefined value                   | `update-track.test.ts`       |
| `createTrack` count/reach boundary (`count === MAX` allowed)         | `create-track.test.ts`       |
| Return-track index from the wrong collection (mock symmetry masked)  | `create-track.test.ts`       |
| Multi-track append shifted the insert index                          | `create-track.test.ts`       |
| `firedSlotIndex === 0` boundary dropped                              | `read-track-basic.test.ts`   |
| Multi-instrument warning unasserted                                  | `read-track-devices.test.ts` |

Remaining survivors are bucket 2 (equivalent — the categorization split,
`instruments[0] ?? null`, return/master/group clip guards that compute `0`
either way since those track types have no clips) and bucket 3 (warn/error
message string contents, internal option-passing flags, `.exists()` guards on
always-present mocks).

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

The `notation` scope is **ratcheted** (`thresholds.break = 86`), as is `track`
(`break: 85`, the first triaged tool domain). The per-domain scope mechanism
(`config/mutation-scopes.mjs` + the runner) is in place, so each `src/tools/`
domain can be mutated on its own; the untriaged ones remain in **baseline mode**
(`break: null`, measure-only). Mutation testing stays off the per-PR hot path (a
full pass is minutes). Remaining work (later releases):

- Keep triaging the ~588 notation survivors, but expect diminishing returns: the
  dense clusters left are epsilon-boundary / warning-string / equivalent mutants
  (bucket 2/3), so genuine bucket-1 gaps are now sparse.
- Raise each scope's `break` as its score climbs.
- Triage the remaining `src/tools/` domains one PR at a time (write operations
  first — `clip`, `device`, `session`, `actions`; `track` done). Per domain: run
  `npm run mutation -- <domain>`, close real gaps, flip that domain's `break`
  from `null` to ~1 point below its triaged score (add it to
  `TOOL_DOMAIN_BREAKS`). The big clean wins tend to be untested lookup/enum
  tables (as in notation's chord table) and warn-and-skip guards whose tests
  assert only the result, never the warning or the skipped write.
- Optionally wire a scheduled (nightly/weekly) non-blocking CI job once several
  domains have floors — full-tree runtime is hours, not minutes.

### CI-rollout sketch

A full-tree run is ~8–20 hours, so it can't be per-commit — but GitHub Actions
is free for public repos with a 6-hour hard cap per job. Split the tree into
module groups running as parallel matrix jobs, each in its own 6-hour window
(the slowest module is likely 2–3 hours, well under the cap):

```yaml
on:
  schedule:
    - cron: "0 3 * * 1" # Weekly Monday 3am UTC
jobs:
  mutation-test:
    strategy:
      fail-fast: false
      matrix:
        scope: [notation, clip, device, track, actions, session, shared]
    steps:
      - run: npm run mutation -- ${{ matrix.scope }}
      # Upload reports/mutation/<scope>.html as an artifact
```

Each matrix job runs one scope from `config/mutation-scopes.mjs`, so the matrix
is just a list of scope names — no duplicated glob strings to keep in sync.

After the first full run, `--incremental` mode only re-tests mutants in changed
files, bringing per-PR runs down to minutes — viable as a non-blocking check.

**Priority areas when widening** (high-risk first):

1. **Write operations** (`update-*`, `create-*`, `delete`) — weak assertions
   here could mask bugs that modify Live Sets.
2. **Recently migrated test files** — the 83 files touched in the mock registry
   migration are most likely to have weakened assertions.
3. **Arrangement operations** — complex edge cases around clip splitting,
   tiling, and boundary detection.
