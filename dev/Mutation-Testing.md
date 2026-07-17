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
npm run mutation -- sharedRuntime # src/shared (cross-cutting utilities)
npm run mutation -- mcpServer    # src/mcp-server (Node-for-Max server)
npm run mutation -- tools        # every tool domain (group)
npm run mutation -- notation clip
npm run mutation -- all          # notation + sharedRuntime + mcpServer + every tool domain
```

Mutation testing is **scoped** and deliberately **not** part of `npm run check`
— a full pass takes minutes, too slow for the per-PR hot path. Whole-tree runs
are hours, so we mutate one area ("scope") at a time.

Scopes are defined in `config/mutation-scopes.mjs`:

- **`notation`** — `src/notation/` (the default). Ratcheted: `break: 86`.
- **One scope per `src/tools/` domain** — `actions`, `advanced`, `clip`, `core`,
  `device`, `live-set`, `scene`, `session`, `shared`, `track`. Each excludes
  tests, test helpers, `.def.ts` tool-definition files, `*-disabled.ts`
  build-time substitution stubs, and type-only modules (see `toolDomain()`). A
  domain starts in **baseline mode** (`break: null`, measure-only) until its
  survivors are triaged in its own PR and it earns a floor in
  `TOOL_DOMAIN_BREAKS`. All ten are now triaged: `track` (`break: 85`),
  `session` (`break: 89`), `actions` (`break: 90`), `device` (`break: 90`),
  `clip` (`break: 96`), `advanced` (`break: 97`), `core` (`break: 99`), `scene`
  (`break: 96`), `live-set` (`break: 98`), `shared` (`break: 94`).
- **`sharedRuntime`** — `src/shared/` (cross-cutting utilities shared by the
  Node MCP server and the V8 Max runtime: pitch, notation identity, compact
  serializer/parser, path builders, config, error/response utils, v8 console /
  sleep, silent-wav, version-check). It is **not** under `src/tools/`, so it
  uses its own glob const (`SHARED_RUNTIME_GLOBS`), and its scope key can't be
  `shared` — that already means `src/tools/shared`. Triaged: `break: 94`.
- **`mcpServer`** — `src/mcp-server/` (the Node-for-Max side: the Express app,
  MCP server wiring, REST routes, the live-library SQLite reader, the
  markdown/memory/skill override stores, and the RPC protocol to the V8
  runtime). Also **not** under `src/tools/`, so it uses its own glob const
  (`MCP_SERVER_GLOBS`) and the camelCase key `mcpServer`. The bundle entry point
  `mcp-server.ts` is excluded (it runs module-load side effects wired to
  `max-api` and is already coverage-excluded). Triaged: `break: 87`.
- **Groups** — `tools` (all ten tool domains) and `all` (notation +
  `sharedRuntime` + `mcpServer` + tools), expanded by the runner into their
  member scopes.

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

## Baseline (2026-07-15, `src/tools/clip/`)

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
substitution stubs rollup swaps in when a feature flag is off (e.g.
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
- **Dual null-returns** (`update-clip.ts` `parseToSlotParam`): the
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

### Gaps closed (clip)

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

## Baseline (2026-07-15, read-op / small tier: `advanced`, `core`, `scene`, `live-set`)

The four read-op / small tool domains, triaged together in one PR (they total 13
mutated files — roughly a third of `clip` alone). Full passes — Stryker 9.6.1,
Node 24, `coverageAnalysis: "perTest"`:

| Domain     | Baseline | Triaged     | Gate (`break`) | Survivors (from) | Files |
| ---------- | -------- | ----------- | -------------- | ---------------- | ----- |
| `advanced` | 96.50%   | **98.60%**  | 97             | 2 (from 5)       | 1     |
| `core`     | 94.53%   | **100.00%** | 99             | 0 (from 7)       | 3     |
| `scene`    | 88.63%   | **97.66%**  | 96             | 7 (from 34)      | 5     |
| `live-set` | 87.38%   | **99.07%**  | 98             | 4 (from 54)      | 4     |

All test-only changes — no product code touched. Each floor sits ~1–1.6 points
below its score for timeout-classification variance. `core` reached a clean
100%; `live-set` (99.07%) is the highest of the whole read-op/write-op set after
`core`.

The dominant lever, seen across `scene` and `live-set`, was the **warn-and-skip
message gap** (the same shape as `device`/`track`): update tools `console.warn`
then return a `{operation:"skipped", reason}` object, but the tests asserted
only the returned object — never the warning text. Adding
`expect(outlet).toHaveBeenCalledWith(1, expect.stringContaining(...))` to each
skip test killed ~16 blanked-message survivors in `live-set` locators alone. The
second lever was **direct unit tests of exported helpers** only ever exercised
transitively: `stopPlaybackIfNeeded` and `waitForPlayheadPosition` (polling
predicate, success/failure warn, epsilon boundary) took
`update-live-set-locator-helpers.ts` from 75.8% to 98.7%.

Remaining survivors are bucket 2/3:

- **`advanced`** — the `default:` throw in the non-exported `executeOperation`
  switch is unreachable (`validateOperationParameters` rejects unknown types
  first); the two `NoCoverage` mutants there can't be killed without exporting
  internal API.
- **`scene`** — always-≥1 length guards (`createdScenes.length > 0` after a
  `count ≥ 1` loop), a pad loop that self-guards on a non-positive count, the
  all-null capture-property no-op, `parseInt("")` vs `parseInt("Stryker…")`
  (both `NaN`), and the undefined-notation passthrough to `readClip`.
- **`live-set`** — `waitUntil({})` (its defaults _are_
  `{pollingInterval:10, maxRetries:10}`), the `locatorName != null` operand
  whose only differing input is caught by the earlier all-null guard, a
  return-track-names arrow only observable through mixer sends, and an
  unknown-include string ignored downstream.

### Gaps closed (read-op / small tier)

| Gap (now killed)                                                                           | Test strengthened / added                       |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `liveApi` `> MAX_OPERATIONS` boundary + wrapped-error `cause` + no-args `call_method`      | `live-api.test.ts`                              |
| `connect` stopped-set `isPlaying` boundary, live_app version path, return-track count      | `connect-core.test.ts`                          |
| `callNodeMemoryRoute` `                                                                    |                                                 | `guard +`"unknown error"` default | `context-memory.test.ts` |
| captureScene sceneIndex/name guards + two-digit selected-scene regex                       | `capture-scene.test.ts`                         |
| createScene capture-focus, extra-names label, MAX boundary, single-property capture guard  | `create-scene.test.ts`                          |
| readScene color-include gate, empty-clip filter + suppressed warning                       | `read-scene.test.ts`                            |
| scene-helpers tempo 20/999/1000 boundaries; updateScene label + empty-focus guard          | `update-scene.test.ts`                          |
| stopPlaybackIfNeeded / waitForPlayheadPosition direct unit tests                           | `update-live-set-locator-helpers.test.ts` (new) |
| 16 blanked locator warn/skip messages + reverse-order delete sort                          | `update-live-set-locator-operations.test.ts`    |
| updateLiveSet scale-absent no-warn + unknown-operation default throw                       | `update-live-set.test.ts`                       |
| extendSong boundary + `"tracks"` child name; multi-word scale join; root/scale error lists | `update-live-set-helpers.test.ts`               |
| readLiveSet mixer-include gate (full param mocks so it's observable)                       | `read-live-set-mixer.test.ts`                   |

## Baseline (2026-07-15, `sharedRuntime` — `src/shared/`)

The cross-cutting utility layer (12 mutated files) shared by both runtimes: the
last non-`src/tools/` code triaged this pass. Full pass — Stryker 9.6.1, Node
24, `coverageAnalysis: "perTest"`:

| Metric        | Baseline | Triaged    | Gate (`break`) |
| ------------- | -------- | ---------- | -------------- |
| sharedRuntime | 89.48%   | **94.94%** | 94             |

All test-only. Per-file movement (survivors from → to): `silent-wav-generator`
37.0% → 92.6% (17 → 2), `compact-parser` 90.9% → 98.9% (16 → 2), `config` 83.3%
→ 100%, `v8-max-console` 97.2% → 100%, `v8-sleep` 92.3% → 100%, `pitch` 89.2% →
91.8% (25 → 19), `version-check` 75.3% → 79.5% (18 → 15). `compact-serializer`,
`error-utils`, `live-api-path-builders`, `mcp-response-utils` were already 100%.

Two dominant levers here (different from the write/read tiers' warn-and-skip
gap):

- **A module-level cache defeating per-test coverage.** `silent-wav-generator`'s
  `ensureSilenceWav` caches via a module flag + on-disk file, so
  `createSilentWav` ran at most once across the whole test file — every
  byte-layout assertion hit the cache and Stryker attributed none of them to the
  code that produced the bytes. Rewriting the tests to `vi.resetModules()` +
  re-import per case (cold flag) and deleting the file first made the generator
  actually run under each WAV-header assertion, killing 15 arithmetic/string
  mutants.
- **A too-broad `toThrow` regex.** `compact-parser`'s malformed-input cases
  asserted `toThrow(/invalid compact literal|.../)`, which matches the shared
  `Invalid compact literal:` wrapper — so every blanked `fail(...)` message and
  every guard that fell through to a _different_ error still "threw" and
  survived. Asserting the **specific** reason per case
  (`/expected ':' after object key/`, `/unexpected trailing content/`, …) killed
  all 8 message mutants plus the missing-colon and object-key branch guards.

Remaining survivors are all bucket 2/3 (verified equivalent / defensive /
Stryker-limited), no real gaps:

- **`pitch` (19)** — `PITCH_CLASS_VALUES_LOWERCASE`'s builder arrow is a
  **static module-init mutant with 0 coverage** (Stryker can't cover static
  initializers under `perTest`); guard clauses in `numberToPitchClass` are
  redundant with the trailing `PITCH_CLASS_NAMES[num] ?? null` (out-of-range
  indices are `undefined` anyway); `quantizePitchToScale` / `clampToScaleBounds`
  boundary and modulo mutants are masked by the double normalization
  (`((x%12)+12)%12`) plus residue periodicity (the outward search always finds a
  match within ≤6 semitones); the `\d+`→`\d` octave mutant is masked by the MIDI
  range check (no in-range note has a 2-digit octave). `isValidNoteName` — which
  has _no_ range check — did kill both of its regex mutants.
- **`version-check` (15)** — the `checkForUpdate` response-shape guard cluster
  is fully masked by the outer `try/catch` (a bad `data.tag_name` access throws
  → caught → `null`) plus the downstream `typeof tagName !== "string"` check, so
  every relaxation still returns `null`; the `hasPreReleaseSuffix` `v`-strip
  mutants can't change `includes("-")` (stripping a `v` never adds/removes a
  dash).
- **A `perTest` attribution quirk** — Stryker does **not** attribute a test to a
  guard mutant when that test _early-returns at the guard_ (confirmed via
  `coveredBy`: the "returns null for non-strings" test is absent from
  `noteNameToMidi`'s guard mutant, and `numberToPitchClass("0")` from its
  guard). Those guards (`pitch` L151/L186) are therefore unkillable via
  coverage, though the behavior _is_ tested.
- **`silent-wav-generator` (2)** — `÷numChannels` ≡ `×numChannels` because
  `numChannels === 1`. **`compact-parser` (2)** — `defineProperty` ≡ `obj[key]=`
  for a normal key; the `parseString` `< length` → `<= length` boundary reads
  `""` past end then fails identically. **`notation` (1)** — the
  `typeof value === "string"` guard is redundant with `NOTATIONS.includes`
  (always `false` for a non-string).

### Gaps closed (`sharedRuntime`)

| Gap (now killed)                                                                    | Test strengthened / added      |
| ----------------------------------------------------------------------------------- | ------------------------------ |
| WAV byte layout (sizes, byte/sample rates, chunk labels) + two-level cache behavior | `silent-wav-generator.test.ts` |
| 8 blanked parser error messages + missing-colon / object-key branch guards          | `compact-parser.test.ts`       |
| `__proto__` descriptor flags (writable/enumerable/configurable)                     | `compact-parser.test.ts`       |
| `MIN_LIVE_VERSION` shape (empty-string mutant)                                      | `config.test.ts` (new)         |
| `checkForUpdate` non-ok guard (payload that would otherwise succeed)                | `version-check.test.ts`        |
| `isNewerVersion` 4th-part loop bound + leading-space-`v` trim                       | `version-check.test.ts`        |
| `isValidNoteName` / `noteNameToMidi` regex anchors + multi-digit octave             | `pitch.test.ts`                |
| `stepInScale` strict `< 0` / `> 127` MIDI-boundary clamps (sparse-scale cases)      | `pitch.test.ts`                |
| `warn` multi-arg outlet join + Dict-without-`stringify` optional chaining           | `v8-max-console.test.ts`       |
| `waitUntil` schedules a Task delay between polls (not a busy loop)                  | `v8-sleep.test.ts`             |

## Baseline (2026-07-15, `mcpServer` — `src/mcp-server/`)

The Node-for-Max server layer (58 mutated files) — the Express app, MCP server
wiring, REST routes, the live-library SQLite reader, the markdown/memory/skill
override stores, and the RPC protocol to the V8 runtime. Full pass — Stryker
9.6.1, Node 24, `coverageAnalysis: "perTest"`:

| Metric    | Baseline | Triaged    | Gate (`break`) |
| --------- | -------- | ---------- | -------------- |
| mcpServer | 88.14%   | **88.51%** | 87             |

The raw all-files run scores 86.31%, but the bundle entry point `mcp-server.ts`
(0% covered, 57 all-NoCoverage mutants) is **excluded** from the scope:
importing it runs module-load side effects wired to `max-api` (registers Node
routes, binds `.listen()`), so it's e2e-territory and is already
coverage-excluded in `vitest.config.ts` — the same rationale `toolDomain()` uses
for `.def.ts` / `*-disabled.ts`. Excluding it puts the honest baseline at
88.14%; the triage below lifts it to 88.51%, all test-only.

This is the most infrastructure-heavy domain triaged so far, so the clean-gap
ceiling is low and the surviving mutants are dominated by bucket 2/3 categories
rather than real gaps:

- **Device-notification side effects.** `create-express-app.ts` alone holds 60
  survivors, almost all `Max.outlet("config", <key>, <value>)` emissions and the
  `outlets.push(() => …)` arrows that batch them. Tests assert the resulting
  config **state**, not that each notification fires with an exact channel/key
  string — asserting those would over-fit the device-sync protocol.
- **Dynamic SQL builders.** The live-library query files (`candidate-query`,
  `find-similar`, `find-duplicates`, `library-search`) build `WHERE` clauses and
  `?`-placeholder lists by string concatenation; the
  `where.length > 0 ? "WHERE " + … : ""` conditionals and placeholder joins
  survive because the tests assert query **results** against a fixture DB, not
  the exact SQL text.
- **The `perTest` guard-attribution quirk** (also seen in `sharedRuntime`).
  Stryker does not attribute a test to an `if`-guard mutant when that test
  early-returns at the guard, so several guards whose behavior _is_ directly
  unit-tested stay unkillable — confirmed via `coveredBy`:
  `resolveClipSubtype`'s `fileType !== ALC || subtype == null` guard
  (library-filters L141) lists only the `librarySearch` integration tests, not
  the direct `resolveClipSubtype(wav, alcM) === null` unit test that would kill
  it; likewise `resolveAbsolutePaths([])` (reconstruct-path L73) and
  `clampLibraryLimit`'s null/`≤0` guard.
- **`readdir`-order-equivalent sorts.** The store `sortByName`
  (`entries.sort((a,b) => a.name.localeCompare(b.name))`, global-memory L123 +
  custom-skills L133) is a no-op on the test platform because macOS APFS
  `readdirSync` already returns lexicographic order, and all slugs are
  lowercase-ascii (byte order == locale order). The sort is cross-platform
  defensive; killing it would require forging an unsorted `readdir`, i.e.
  over-fitting to filesystem order.
- **Static regex module-init, log/header strings, `finally`/`catch`
  block-empties.** `WINDOWS_DRIVE_ROOT` / `Live-files-(\d+)` regexes (0-coverage
  static initializers, a known Stryker limitation),
  `console.info`/`warn`/`error` message literals,
  `res.set("Cache-Control", "no-store")` header strings, and `} finally { … }`
  cleanup blocks whose emptying is behaviorally invisible.
- **Genuine equivalents.** `writeSkillOverride(name, "")` ≡ deleting the slot
  (an empty-body override file is dropped on read, so both yield
  `override: ""`); the `> 0` / `>= 0` length guards on already-non-empty
  collections.

### Gaps closed (`mcpServer`)

| Gap (now killed)                                                                | Test added / strengthened     |
| ------------------------------------------------------------------------------- | ----------------------------- |
| `requireString`/`optionalString` null-args `?.[key]` guard + field-named errors | `route-args.test.ts` (new)    |
| `clampLibraryLimit` non-positive request → default (the `<= 0` branch)          | `library-filters.test.ts`     |
| `parseFrontmatter` body: anchored `^\n` strip preserves interior newlines       | `frontmatter.test.ts`         |
| `cosineSimilarity` bounded by the shorter vector (no read past the end)         | `fe-values-helpers.test.ts`   |
| `rejectCrossOriginWrite`: foreign origin → 403 + returns `true`                 | `request-origin.test.ts`      |
| `resolveAbsolutePaths`: 3-segment path sets `folder` (the `>= 3` boundary)      | `reconstruct-path.test.ts`    |
| Custom-skills index emits no `## Disabled` section when all skills are enabled  | `custom-skills-store.test.ts` |

## Baseline (2026-07-16, `shared` — `src/tools/shared/`)

The largest tool domain and the last one triaged: 50 mutated files / ~9,400
source LOC of cross-cutting infrastructure — the tool framework, validation,
arrangement helpers, the device reader, and the specialized-device specs. Too
big for one PR, so it was triaged in four independent test-only PRs by subarea,
each iterating against a temporarily-narrowed `mutate` glob (uncommitted — a
~2-minute inner loop vs ~5 for the whole domain). The gate comes from a final
whole-domain pass — Stryker 9.6.1, Node 24, `coverageAnalysis: "perTest"`:

| Metric   | Triaged (whole domain) | Gate (`break`) |
| -------- | ---------------------- | -------------- |
| `shared` | **95.25%**             | 94             |

Per subarea, as measured in its own PR against the narrowed glob (there is no
single pre-triage whole-domain number — each subarea was baselined separately):

| Subarea (files)              | Baseline | Triaged    | Survivors (from) |
| ---------------------------- | -------- | ---------- | ---------------- |
| Utilities & framework (14)   | 87.28%   | **92.78%** | — (~52 killed)   |
| Arrangement (8)              | 81.30%   | **95.98%** | 20 (from 97)     |
| Device reader & helpers (12) | 87.10%   | **95.14%** | 80 (from 213)    |
| Specialized devices (16)     | 90.19%   | **97.08%** | 33 (from 111)    |

All test-only — no product code was touched in any of the four. The
specialized-device subarea scored highest of the four (97.08%), as predicted:
every device spec already had a colocated test, so the survivors were
concentrated in declarative tables rather than untested logic.

Three levers did most of the work in the specialized subarea:

- **The discovery catalogs are data, and data needs a table test.** `actions`
  (name / signature / description) and `paramOptions` are pure LLM-facing tables
  the model reads to learn how to drive a device. The device tests asserted
  behavior and at most `actions.map((a) => a.name)`, so every `signature` and
  `description` string was unasserted. One `toStrictEqual` per catalog plus an
  `it.each` over the display-name routing table killed ~25 string/array mutants
  in one new file (`specialized-device-catalog.test.ts`).
- **Warn text is the model's only error channel.** The `Options: …` /
  `Available: …` / `must be one of …` lists are built with `join(", ")`, and
  several tests asserted only a fragment (`stringContaining("Pre FX")`) — which
  still matches when `join(", ")` decays to `join("")`. Asserting the whole
  joined list (and the `paramName` the warning names) killed every one.
- **Index 0 is a value, not a "not found".** `list.indexOf(...) < 0` guards
  paired with tests that only ever selected a middle entry left the `< 0` →
  `<= 0` mutants alive across Wavetable categories/wavetables, Hybrid Reverb IR
  files, the mod-matrix source `"Amp"` (column 0) and target slot 0. Each needed
  a test that selects the _first_ entry. The same shape appears in Hybrid
  Reverb's `list.length === 1 && list[0] === <sentinel>` empty-category guard: a
  category holding exactly one real IR must still be settable.

Remaining survivors are bucket 2/3. Each of the 111 original specialized
survivors was verified individually by applying the mutant and running the
covering suite (see **Verifying a survivor** below); the 20 that survive that
check are:

- **Guards subsumed by a downstream check.** The action parser's
  `if (quote) return null` (unterminated quote) is unreachable-by-effect: a
  token whose quote never closed can never _end_ with its own quote character,
  so `parseArgToken`'s `token.at(-1) !== first` rejects it anyway. Its
  `token.length < 2` guard is likewise dead — a token starting with a quote that
  reached `parseArgToken` at all has ≥2 characters (the split only happens once
  the quote closes). Similarly `readIrFile`'s `value == null` returns
  `undefined` either way, and `coerceInt`'s
  `typeof value === "number" ? value : Number(value)` is `Number(number)`
  identity.
- **Discriminated-union shadows.** Simpler's `probe.kind === "single"` operands
  can't be distinguished because `probe.path` / `probe.gain` only _exist_ on the
  `single` variant — relaxing the check reads `undefined` and yields the same
  result. `resolveSourceIndex`'s `n >= 0` is shadowed too: a negative index
  falls through and returns a negative, which the caller already treats as
  invalid.
- **Defensive caps and type guards.** `MAX_TARGETS` (512) bounds a loop that
  really terminates on the LOM's numeric sentinel; `typeof name === "string"` at
  a point where the sentinel was already handled; `typeof v === "number"` on a
  value Live always returns as a number. Killing these would mean forging LOM
  responses Live cannot produce.
- **A vestigial parameter.** `readParamEntries`'s `predicate` has exactly one
  caller, which passes `() => true` — so its `if (!predicate(param)) continue`
  is dead (and the domain's only `NoCoverage` mutant). Worth deleting, but that
  is product code, out of scope for a test-only pass.
- **Ambiguity we deliberately resolve one way.** Compressor's
  `routingType.display_name === NO_INPUT_LABEL` only differs if a user names a
  track literally `"No Input"`; the sentinel wins by design, and asserting that
  would over-fit an ambiguity Live itself doesn't disambiguate.

Note the gap between the harness verdict (20 uncatchable) and Stryker's 33
survivors: the other ~13 are **`perTest` false survivors** — a killing test
exists and passes, but Stryker never attributes it because the killing input
short-circuits the mutated guard during the coverage dry-run. Almost all are
`ObjectLiteral → {}` mutants on the spec objects themselves. This rate (13/111)
is far higher than the arrangement and device subareas (0 and 2), which is why
the whole-domain score lands below what the triage alone would suggest.

### Gaps closed (`shared`, specialized subarea)

| Gap (now killed)                                                                    | Test strengthened / added                    |
| ----------------------------------------------------------------------------------- | -------------------------------------------- |
| Simpler + Wavetable action catalogs (every `signature` / `description`)             | `specialized-device-catalog.test.ts` (new)   |
| `class_display_name` → spec routing for all 12 specialized devices                  | `specialized-device-catalog.test.ts` (new)   |
| Modulation-rate effects expose no params and no `paramOptions` key                  | `specialized-device-catalog.test.ts` (new)   |
| Action grammar: `$` anchor, `""` arg, whitespace-only args, double-quoted commas    | `specialized-device-action-parser.test.ts`   |
| Numeric args: multi-digit floats (`12.5`, `.25`) and digit-led words (`4x`)         | `specialized-device-action-parser.test.ts`   |
| Mod matrix: source `"Amp"` (index 0), slot-0 target no re-add, ±1 amount boundary   | `wavetable-modulation-helpers.test.ts` (new) |
| Mod matrix: name trimming, zero-cell exclusion, exactly-13-source scan              | `wavetable-modulation-helpers.test.ts` (new) |
| Wavetable/Drift `inactiveWhen` rules (LFO sync, Cyc Env time mode)                  | `specialized-device-registry.test.ts`        |
| First category / wavetable selectable (index 0) + `Available:` lists                | `wavetable.test.ts`                          |
| Hybrid Reverb single-file category settable; first IR selectable; `Available:` list | `hybrid-reverb.test.ts`                      |
| Compressor whitespace-only sidechain id clears; channel `Available:` list           | `compressor.test.ts`                         |
| Simpler multi-sample / gain-less / non-number `voices` reads omit their params      | `simpler.test.ts`                            |
| `coerceBool` trims; enum + int-set warnings name the param and list valid values    | `specialized-device-param-helpers.test.ts`   |
| Boolean pseudo-param warnings name their param (`oversample`, `envListen`, …)       | `eq-eight` / `roar` / `hybrid-reverb` tests  |
| `readSpecializedParams` search term is trimmed                                      | `specialized-device-registry.test.ts`        |

## Baseline (2026-07-16, `v8Adapter` — `src/live-api-adapter/`)

The Max V8 runtime side — the `LiveAPI` wrapper interface, the path helpers, and
the V8 half of the two RPC protocols to Node. The counterpart to `mcpServer`
(the Node-for-Max side) and the last tree to be mutated. Small: 4 mutated files
/ ~750 source LOC. Stryker 9.6.1, Node 24, `coverageAnalysis: "perTest"`:

| Metric      | Baseline | Triaged    | Gate (`break`) |
| ----------- | -------- | ---------- | -------------- |
| `v8Adapter` | 78.17%   | **97.97%** | 97             |

Per file:

| File (mutants)                     | Baseline | Triaged    | Survivors (from)  |
| ---------------------------------- | -------- | ---------- | ----------------- |
| `live-api-extensions.ts` (279)     | 81.72%   | **98.92%** | 3 (from 51)       |
| `code-exec-v8-protocol.ts` (43)    | 23.26%   | **95.35%** | 2 (from 33)       |
| `node-request-v8-protocol.ts` (35) | 97.14%   | **100%**   | 0 (from 1)        |
| `live-api-path-utils.ts` (37)      | 97.30%   | **91.89%** | 3 (all one cause) |

All test-only — no product code was touched. `live-api-adapter.ts` is excluded
as the V8 bundle entry point (it emits `outlet(0, "started")` and registers Max
message handlers at import), the same rationale `mcpServer` uses for
`mcp-server.ts`.

`live-api-path-utils.ts` _drops_ against its baseline without a single test
being removed: two of its three survivors were classified `Timeout` (which
counts as killed) in the first run and `Survived` in the second. The second
reading is the honest one — see the noise note below.

### Why this scope is timeout-noisy

`live-api-extensions.ts` patches the global `LiveAPI` prototype, and
`src/test/test-setup.ts` imports it at **setup** time, so the module body runs
once per test file, outside any test. Nearly all of its mutants are therefore
**static**: Stryker can't attribute them per-test and runs the whole suite for
each ("Ran all tests for this mutant"). A mutant that breaks the patch breaks
setup for _every_ test file, so the full run blows the time budget and lands as
`Timeout` rather than `Killed` — both count as killed, but which mutants tip
over shifts with machine load. Three runs of identical code:

| Run | Score  | Timeouts | Wall clock |
| --- | ------ | -------- | ---------- |
| 1   | 98.22% | 21       | 19m        |
| 2   | 97.97% | 10       | 14m        |
| 3   | 97.97% | 1        | 1m35s      |

The gate is set from the low end. Note the runtime swing has the same cause —
each timeout burns a full budget, so an unloaded machine finishes the smallest
tree in ~90 seconds while a busy one takes twenty minutes. Don't read a slow run
as a hang.

A `Timeout` here is not a weak kill. Spot-checking one (the `clipSlotIndex`
guard) by hand: the adapter suite fails it in **1.5 seconds** — it can't flip to
`Survived`, only between `Timeout` and `Killed`.

Three levers did most of the work:

- **Test how a module installs itself, not just what it installs.** The eight
  index getters are defined behind
  `if (!Object.prototype.hasOwnProperty.call(LiveAPI.prototype, "…"))` guards.
  On the single load a test run performs, the guard is _always_ false, so
  `if (true)` is indistinguishable — ~15 guard mutants survived as a block. They
  die to one new file (`live-api-extensions-install.test.ts`) asserting the two
  contracts the guards exist for: re-importing after `vi.resetModules()` must
  not throw (`Object.defineProperty` defaults to `configurable: false`, so an
  unguarded redefine throws `Cannot redefine property`), and importing with
  `LiveAPI` absent must be inert (the module is pulled into Node-side bundles
  where the Max global doesn't exist).
- **A mock that reimplements the thing under test hides it.** `readTrack` and
  `readClip` consume `returnTrackIndex` / `takeLaneIndex`, but every caller's
  test registers a mock object carrying those as _properties_ — which
  `MockLiveAPI`'s constructor copies onto the instance, shadowing the prototype
  getter. Both getters had **zero** real coverage despite looking well-covered;
  the path regexes are only reachable from an unregistered `LiveAPI.from(path)`.
- **Reach for the round-trip harness that already exists.** `code-exec` sat at
  23.26% because its Node round-trip was untested — but the sibling
  `node-request` protocol tests it at 97.14% with ~50 lines of Task stand-ins.
  Extracting those into `v8-protocol-test-helpers.ts` (shared by both, so no
  jscpd clone) and mirroring the suite took `code-exec` to 95.35%.

### Documented equivalents (`v8Adapter`)

Six of the eight residuals are equivalent — each verified by applying the mutant
and running the suite, then confirming the root cause in isolation:

| Mutant                                               | Why it can't be killed                                                                                                                                                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `live-api-path-utils.ts:33` (×3)                     | Emptying/skipping the `typeof idOrPath === "number"` branch falls through to `/^\d+$/.test(idOrPath)`, which coerces the number and returns the identical `id N`. Only unreachable inputs (negatives, floats) differ. |
| `live-api-extensions.ts:132` `startsWith`→`endsWith` | The branch only runs when `/^\d+$/.test(val)`, and an all-digit string can contain neither `"id "` prefix nor suffix — both sides are always false.                                                                   |
| `live-api-extensions.ts:159` `<`→`<=`                | `getChildIds` steps `i += 2` and reads `idArray[i] === "id"`; the extra iteration reads index `length`, which is `undefined` and never `"id"`.                                                                        |
| `live-api-extensions.ts:330` `matches.length === 0`  | `path.match(/devices (\d+)/g)` returns `null`, never `[]`, so the length arm is unreachable behind `!matches`.                                                                                                        |

The other two are bucket 3, both in the coverage-threshold-excluded
`code-exec-v8-protocol.ts`: the `console.error` text for a result with no
pending request (a diagnostic log — `error` is not relayed to the LLM, unlike
`warn`), and `executeNoteCode`'s body (`NoCoverage`) — a three-line delegation
to `extractNotesFromClip` + `buildCodeExecutionContext` +
`executeNoteCodeWithData`, each independently tested, whose only untested part
is the clip-mock scaffolding the vitest exclusion already calls out as not worth
reconstructing.

### Gaps closed (`v8Adapter`)

| Gap (now killed)                                                            | Test strengthened / added                   |
| --------------------------------------------------------------------------- | ------------------------------------------- |
| The 8 `hasOwnProperty` install guards + the `typeof LiveAPI` module guard   | `live-api-extensions-install.test.ts` (new) |
| `returnTrackIndex` / `takeLaneIndex` getters (regex, index 0, multi-digit)  | `live-api-extensions-path-indices.test.ts`  |
| `sceneIndex` clip_slots fallback on a double-digit track index              | `live-api-extensions-path-indices.test.ts`  |
| `exists()` for the `"id 0"` and numeric `0` id shapes                       | `live-api-extensions-basic.test.ts`         |
| Routing `getProperty`: warns on parse failure, stays silent when unset      | `live-api-extensions.test.ts`               |
| `setColor` format vs hex error messages; per-channel NaN rejection          | `live-api-extensions-color.test.ts`         |
| `setProperty` passes a numeric value through without formatting             | `live-api-extensions-setters.test.ts`       |
| Request IDs count **up** from their prefix (not merely unique)              | both `*-v8-protocol.test.ts`                |
| code-exec round trip: resolve, parse error, timeout, cancel, late/dup reply | `code-exec-v8-protocol.test.ts`             |
| `executeNoteCodeWithData` wraps code, passes globals, validates notes       | `code-exec-v8-protocol.test.ts`             |

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

### Verifying a survivor

Bucket 1 and bucket 2 look identical in the report, and guessing wrong wastes a
lot of time — either writing tests for an equivalent mutant, or dismissing a
real gap as "probably equivalent". Decide it empirically instead:

1. Read the mutant's exact node out of
   `reports/mutation/<scope>-incremental.json` — `location` (1-based
   line/column, inclusive start, exclusive end) plus `replacement`. Use the
   embedded `source` to print `line.slice(startCol - 1, endCol - 1)` and confirm
   what you're replacing. Stryker mutates _sub-expressions_: a
   `ConditionalExpression` on `if (a && b)` usually targets just `a`, and
   hand-mutating the whole condition will mislead you.
2. Apply it to the file, run the covering test suite, restore the file. A
   non-zero exit means a killing test already exists (a `perTest` attribution
   artifact — unkillable via more tests, so document it). Exit zero means it is
   genuinely uncaught: a real gap _or_ an equivalent, which you then reason
   about normally.

Scripting this over every Survived/NoCoverage mutant in a scope takes a couple
of minutes and turns triage into a worklist. Re-running it per-file after each
edit is also a much faster confirm loop than a full Stryker pass. Two cautions:
the verdict is binary (an uncaught equivalent still reads "uncaught"), and a
test can kill a mutant for the wrong reason — so read the surviving code, don't
just chase green.

## Status & next steps

**The whole source tree is now triaged and ratcheted — no scope is left in
baseline mode, and none remains unmutated.** The ten tool domains: the write-op
tier `track` (`break: 85`), `session` (`break: 89`), `actions` (`break: 90`),
`device` (`break: 90`), `clip` (`break: 96`); the read-op / small tier
`advanced` (`break: 97`), `core` (`break: 99`), `scene` (`break: 96`),
`live-set` (`break: 98`); and `shared` (`break: 94`). Plus the four
non-`src/tools/` scopes: `notation` (`break: 86`), `sharedRuntime`
(`src/shared/`, `break: 94`), `mcpServer` (`src/mcp-server/`, `break: 87`) and
`v8Adapter` (`src/live-api-adapter/`, `break: 97`). The per-domain scope
mechanism (`config/mutation-scopes.mjs` + the runner) is in place, so each area
can be mutated on its own. Mutation testing stays off the per-PR hot path (a
full pass is minutes). Remaining work (later releases):

- Keep triaging the ~588 notation survivors, but expect diminishing returns: the
  dense clusters left are epsilon-boundary / warning-string / equivalent mutants
  (bucket 2/3), so genuine bucket-1 gaps are now sparse.
- Raise each scope's `break` as its score climbs.
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
