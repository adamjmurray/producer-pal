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
  floor in `TOOL_DOMAIN_BREAKS`; triaged so far: `track` (`break: 85`),
  `session` (`break: 89`), `actions` (`break: 90`).
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

## Baseline (2026-07-14, `src/tools/session/`)

Second write-op domain triaged (`library` / `playback` / `select` /
`read-samples` tools). Full pass — Stryker 9.6.1, Node 24,
`coverageAnalysis: "perTest"`:

| Metric                     | Value      |
| -------------------------- | ---------- |
| **Mutation score**         | **90.46%** |
| Mutants killed             | 1125       |
| Survived                   | 117        |
| Timeout (counts as killed) | 4          |
| No coverage                | 2          |
| Total mutants              | 1248       |
| Wall-clock                 | 1m 12s     |

Gate: `break: 89` (`TOOL_DOMAIN_BREAKS.session`), ~1.5 points below the score
for timeout-classification variance. Triage lifted the score from a **87.10%**
baseline (159 survivors), killing 42 mutants with test-only changes — no product
code touched.

Per-file scores after triage:

| File                              | Score  | Survived | Notes                          |
| --------------------------------- | ------ | -------- | ------------------------------ |
| `library.ts`                      | 97.59% | 6        | sort/filter/reason gaps closed |
| `playback.ts`                     | 95.71% | 6        |                                |
| `library-search-batch-helpers.ts` | 94.55% | 3        |                                |
| `read-samples.ts`                 | 94.44% | 4        |                                |
| `playback-helpers.ts`             | 94.00% | 6        |                                |
| `select.ts`                       | 89.78% | 19       |                                |
| `select-helpers.ts`               | 86.56% | 34       |                                |
| `select-id-helpers.ts`            | 86.27% | 7        |                                |
| `select-response-helpers.ts`      | 82.64% | 19       |                                |
| `library-query-schema.ts`         | 38.10% | 13       | prose/equivalent — see below   |

`library-query-schema.ts` is the low outlier by design, not weak testing: it is
mostly a Zod schema whose 11 surviving `.describe("…")` mutations are the same
untestable LLM-facing prose that `.def.ts` files carry (asserting exact wording
over-fits). Its two logic survivors are the `preprocess` guard — a
`typeof value === "string"` check whose mutant is provably equivalent (the
`catch` returns the original value on any parse failure, so a non-string
round-trips identically).

The `select*` files carry most of the remaining survivors, and they are
dominated by bucket-2/3 mutants: response-shape field guards
(`if (info) result.x = info` where the builder never returns null on tested
paths), `.exists()` guards on always-present mocks, and
`validateIdType(id, type, "select")` error-context strings. Genuine bucket-1
gaps there are sparse; left for a future pass rather than over-fitting the
current one.

### Gaps closed (session)

The clean wins mirror the cross-domain pattern: an untested sort/lookup path
plus warn-and-skip / boundary guards whose tests asserted only the happy-path
result.

| Gap (now killed)                                                     | Test strengthened / added      |
| -------------------------------------------------------------------- | ------------------------------ |
| `sortPartition` name / mod_date / use_count ordering all untested\*  | `library.test.ts`              |
| Merged/folder-only `reason` key leaked as `undefined` when absent    | `library.test.ts`              |
| Folder-scan item shape (`kind: "audio"`, empty `tags`) unasserted    | `library.test.ts`              |
| `callRoute` success-with-no-result must throw, not resolve undefined | `library.test.ts`              |
| `deviceKind: "audiofx"` passthrough + valid/absent no-warn controls  | `library-list-plugins.test.ts` |
| searchBatch cap boundary (exactly 20 no-warn) + dropped-count math   | `library-search-batch.test.ts` |
| searchBatch keeps the _first_ stalenessRisk, not the last            | `library-search-batch.test.ts` |
| searchBatch omits the `reason` key on entries with no reason         | `library-search-batch.test.ts` |
| Zero-length loop (`loopEnd` exactly at `loopStart`, `<= 0` boundary) | `playback-basic.test.ts`       |
| `select` conflict-view warn fired on matching / no-view selections   | `select-basic.test.ts`         |
| Wildcard search regex-escaping (`(` matched literally) + limit guard | `read-samples.test.ts`         |

\* The prior sort tests used coincidentally-aligned data (all `useCount: 0`, or
a use_count order matching the alphabetical order), so a wrong sort branch
produced the same output. The new tests use a DB partition where name-order,
useCount- order, and upstream-order all differ, uniquely pinning each mode.

## Baseline (2026-07-15, `src/tools/actions/`)

Third write-op domain triaged (`delete` and `duplicate` tools — the latter
spanning ten `duplicate-*-helpers.ts` files). Full pass — Stryker 9.6.1, Node
24, `coverageAnalysis: "perTest"`:

| Metric                     | Value      |
| -------------------------- | ---------- |
| **Mutation score**         | **91.79%** |
| Mutants killed             | 1145       |
| Survived                   | 93         |
| Timeout (counts as killed) | 6          |
| No coverage                | 10         |
| Total mutants              | 1254       |
| Wall-clock                 | 1m 9s      |

Gate: `break: 90` (`TOOL_DOMAIN_BREAKS.actions`), ~1.8 points below the score
for timeout-classification variance. Triage lifted the score from an **83.97%**
baseline (191 survivors), killing 96 mutants with test-only changes — no product
code touched.

Per-file scores after triage:

| File                                 | Score   | Survived | Notes                            |
| ------------------------------------ | ------- | -------- | -------------------------------- |
| `duplicate-focus-helpers.ts`         | 100.00% | 0        | determineTargetView fully pinned |
| `duplicate-validation-helpers.ts`    | 99.38%  | 1        | direct unit tests (81% → 99%)    |
| `duplicate-take-lane-helpers.ts`     | 96.30%  | 2        | setAll/message/color-fallback    |
| `delete.ts`                          | 94.22%  | 15       | 2-digit indices + comparator     |
| `duplicate-routing-helpers.ts`       | 94.12%  | 6        | mock fix exposed routing branch  |
| `duplicate-track-scene-helpers.ts`   | 91.62%  | 11       |                                  |
| `duplicate-clip-position-helpers.ts` | 90.70%  | 4        |                                  |
| `duplicate.ts`                       | 87.60%  | 15       |                                  |
| `duplicate-transform-helpers.ts`     | 86.67%  | 4        | edge/optional-chain (bucket 2)   |
| `duplicate-device-helpers.ts`        | 85.54%  | 10       | 2-digit track regexes            |
| `duplicate-helpers.ts`               | 81.65%  | 25       | heavy tiling paths — see below   |

`duplicate-helpers.ts` is the low outlier, and its survivors are mostly
bucket-2/3: the `createClipsForLength` / `lengthenClipAndCollectInfo` /
`duplicateClipToArrangement` arrangement-tiling paths route through several
mocked shared helpers, so `setAll({name, color})` object mutants and
`is_midi_clip === 1` branch mutants there are hard to observe without a full
Live-API integration harness. Two more provably-equivalent classes live here:
the `omitFields: string[] = []` default (mutating to `["Stryker…"]` omits a
field name nothing checks) and the `parseArrangementLength` catch-wrapper
(`msg.includes("Invalid duration format")` — both branches throw a message the
substring assertions already accept). Left for a future integration-test pass
rather than over-fitting.

### Gaps closed (actions)

Two structural wins beyond the usual warn-and-skip hardening:

- **Discriminating id-sort data** (mirrors the `session` `sortPartition` fix):
  `findRoutingOptionForDuplicateNames` sorts duplicate-named tracks by numeric
  id to pick the right routing option. The new unit test uses children order
  (5,2,9) ≠ id-sorted order (2,5,9) plus a non-matching low-id track, so a
  blanked/`+`-comparator/kept-filter mutant each picks a different position.
- **A mock that hid a whole branch.** `setupRouteToSourceMock` stored
  routing-type properties as plain objects, but `getProperty` JSON-parses them —
  so every routeToSource test silently hit a parse-failure path and the real
  input/output routing-change code (`configureSourceTrackInput` /
  `applyOutputRouting`) was never executed. Storing them as JSON strings (as
  Live returns) made the routing branch testable and killed its survivors.

| Gap (now killed)                                                     | Test strengthened / added                               |
| -------------------------------------------------------------------- | ------------------------------------------------------- |
| Track / scene / return-track / clip / device index regexes (`\d+`)   | `delete.test.ts`, `delete-device.test.ts`               |
| Device-deletion comparator tiebreaker (chains-before-return_chains)  | `delete-device.test.ts`                                 |
| `validateAndConfigureRouteToSource` warns + forced `{true,true}`     | `duplicate-validation-helpers.test.ts`                  |
| `inferDestination` / `validateArrangementParameters` whitespace trim | `duplicate-validation-helpers.test.ts`                  |
| `findRoutingOptionForDuplicateNames` id-sort position                | `duplicate-routing-helpers.test.ts`                     |
| Input/output routing-change branch (mock stored objects, not JSON)   | `duplicate-test-helpers.ts` + `duplicate-track.test.ts` |
| transforms/code-ignored warn (clip no-warn control + code-only arm)  | `duplicate-transforms.test.ts`                          |
| Take-lane setAll property copies + "created on lane N" + color-copy  | `duplicate-take-lane.test.ts`                           |
| determineTargetView track/device/scene arms + empty-array `.at(-1)`  | `duplicate-focus-helpers.test.ts`                       |
| name/color/omit-trackIndex/has_clip guards on duplicated tracks      | `duplicate-track-scene-helpers.test.ts`                 |
| 2-digit source/destination track regexes in device duplication       | `duplicate-device.test.ts`                              |

## Baseline (2026-07-15, `src/tools/device/`)

Fourth write-op domain triaged (`create` / `read` / `update` device tools, the
last spanning `update-device-*` parsers, setters, and helpers). Full pass —
Stryker 9.6.1, Node 24, `coverageAnalysis: "perTest"`:

| Metric                     | Value      |
| -------------------------- | ---------- |
| **Mutation score**         | **91.68%** |
| Mutants killed             | 1093       |
| Survived                   | 93         |
| Timeout (counts as killed) | 9          |
| No coverage                | 7          |
| Total mutants              | 1202       |
| Wall-clock                 | 1m 6s      |

Gate: `break: 90` (`TOOL_DOMAIN_BREAKS.device`), ~1.7 points below the score for
timeout-classification variance. Triage lifted the score from an **82.20%**
baseline (214 survivors), killing 114 mutants with test-only changes — no
product code touched. The dominant lever was `update-device-wrap-helpers.ts` at
**57.32%** (69 survivors): its wrap tests asserted the return value but not the
emitted warnings, the Live-API method/property-name arguments, or the
chain-creation arithmetic.

Per-file scores after triage:

| File                                | Score   | Survived | Notes                             |
| ----------------------------------- | ------- | -------- | --------------------------------- |
| `update-device-type-helpers.ts`     | 100.00% | 0        | warnIfSet null-guard pinned       |
| `update-device-property-helpers.ts` | 96.63%  | 3        | cross-type not-applicable warns   |
| `update-device-helpers.ts`          | 95.31%  | 10       | macro variation/count, drum chain |
| `update-device.ts`                  | 93.52%  | 7        | focus `.at(-1)`, move/type warns  |
| `read-device.ts`                    | 92.31%  | 12       | return-chains + nested bounds     |
| `update-device-param-parser.ts`     | 92.31%  | 2        | pan/unit equivalents (bucket 2)   |
| `create-device.ts`                  | 91.75%  | 8        | name-set guard                    |
| `device-params-schema.ts`           | 88.24%  | 2        | JSON preprocess (bucket 2/3)      |
| `update-device-param-setters.ts`    | 87.76%  | 28       | binary-search tolerance — below   |
| `update-device-wrap-helpers.ts`     | 86.59%  | 21       | instrument reverse-loop internals |

`update-device-param-setters.ts` is the low outlier, and its survivors are
mostly bucket 2: `findRawValueForDisplay`'s linear-vs-binary-search detection.
For a nearly-linear param the linear shortcut and the binary search converge on
the same written value, so the `< tolerance` / `true &&` boundary mutants are
only observable with contrived non-physical `str_for_value` mappings —
over-fitting. The genuinely testable branches (division-label OR,
min-label-unparseable fallback, pan max from display labels not the `50`
fallback) were closed. `update-device-wrap-helpers.ts`'s remaining survivors are
the instrument-rack reverse-loop's internal `LiveAPI.from(...)`/`move_device`
string args and the best-effort `restoreStrandedInstruments` cleanup loop —
low-value defensive paths left for a future integration pass.

### Gaps closed (device)

One durable test-authoring gotcha surfaced (worth reusing across domains):

- **`expect.anything()` does not match `undefined`.** A warn-and-skip guard like
  `if (name != null) device.set("name", name)` mutated to `if (true)` writes
  `set("name", undefined)`. Asserting
  `not.toHaveBeenCalledWith("name", expect.anything())` **passes anyway** —
  `expect.anything()` excludes `null`/`undefined` — so the mutant survives. Use
  a `mock.calls.filter((c) => c[0] === "name")` length check instead. This hid
  the `create-device`/`wrap` name-set guard mutants until the assertion was
  rewritten.

| Gap (now killed)                                                    | Test strengthened / added                   |
| ------------------------------------------------------------------- | ------------------------------------------- |
| Chain-creation loop bounds/arithmetic (rack with N existing chains) | `update-device-wrap-in-rack-chains.test.ts` |
| wrapInRack warn messages + name-set + insert_chain failure detect   | `update-device-wrap-in-rack.test.ts`        |
| `setVariationIndex` load/delete index-set paired with the action    | `update-device-macro-variation.test.ts`     |
| Variation index-count boundary (`>=`) + skip-executes-action guard  | `update-device-macro-variation.test.ts`     |
| Drum-chain move: single-chain vs whole-pad, sharp note, `p*`        | `update-device-drum-chain-move.test.ts`     |
| Nested drum-pad chain/device index boundary + non-numeric segments  | `read-device-drum-pad-path.test.ts`         |
| Device `focus` selects `.at(-1)` (3 devices, not a 2-element tie)   | `update-device-focus.test.ts`               |
| Cross-type "not applicable" warns (rack-only on non-rack, etc.)     | `update-device-chains.test.ts`              |
| Division-label OR, min-unparseable fallback, pan display-max        | `update-device-param-conversion.test.ts`    |
| return-chains include on/off; malformed-path safe-resolve warn      | `read-device.test.ts`, `update-device-path` |
| Malformed-JSON `params` string rejected (not swallowed)             | `device-params-schema.test.ts`              |

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

The `notation` scope is **ratcheted** (`thresholds.break = 86`), as are `track`
(`break: 85`), `session` (`break: 89`), `actions` (`break: 90`), and `device`
(`break: 90`), the first four triaged tool domains. The per-domain scope
mechanism (`config/mutation-scopes.mjs` + the runner) is in place, so each
`src/tools/` domain can be mutated on its own; the untriaged ones remain in
**baseline mode** (`break: null`, measure-only). Mutation testing stays off the
per-PR hot path (a full pass is minutes). Remaining work (later releases):

- Keep triaging the ~588 notation survivors, but expect diminishing returns: the
  dense clusters left are epsilon-boundary / warning-string / equivalent mutants
  (bucket 2/3), so genuine bucket-1 gaps are now sparse.
- Raise each scope's `break` as its score climbs.
- Triage the remaining `src/tools/` domains one PR at a time (write operations
  first — `clip` next; `track`, `session`, `actions`, and `device` done). Per
  domain: run `npm run mutation -- <domain>`, close real gaps, flip that
  domain's `break` from `null` to ~1 point below its triaged score (add it to
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
