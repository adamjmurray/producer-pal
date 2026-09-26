# Mutation baseline — 2026-07-15, `src/tools/actions/`

Third write-op domain triaged (`delete` and `duplicate` tools — the latter
spanning ten `duplicate-*` helper modules). Full pass — Stryker 9.6.1, Node 24,
`coverageAnalysis: "perTest"`:

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

| File                                                         | Score   | Survived | Notes                            |
| ------------------------------------------------------------ | ------- | -------- | -------------------------------- |
| `focus-if-requested.ts`                                      | 100.00% | 0        | determineTargetView fully pinned |
| `duplicate-destinations.ts`                                  | 99.38%  | 1        | direct unit tests (81% → 99%)    |
| `duplicate-take-lanes.ts`                                    | 96.30%  | 2        | setAll/message/color-fallback    |
| `delete.ts`                                                  | 94.22%  | 15       | 2-digit indices + comparator     |
| `duplicate-routing.ts`                                       | 94.12%  | 6        | mock fix exposed routing branch  |
| `duplicate-track.ts` / `duplicate-scene.ts`                  | 91.62%  | 11       |                                  |
| `duplicate-clip-with-positions.ts`                           | 90.70%  | 4        |                                  |
| `duplicate.ts`                                               | 87.60%  | 15       |                                  |
| `apply-clip-transforms.ts`                                   | 86.67%  | 4        | edge/optional-chain (bucket 2)   |
| `duplicate-device.ts`                                        | 85.54%  | 10       | 2-digit track regexes            |
| `arrangement-length.ts` / `duplicate-clip-to-arrangement.ts` | 81.65%  | 25       | heavy tiling paths — see below   |

`arrangement-length.ts` / `duplicate-clip-to-arrangement.ts` are the low
outliers, and their survivors are mostly bucket-2/3: the `createClipsForLength`
/ `lengthenClipAndCollectInfo` / `duplicateClipToArrangement` arrangement-tiling
paths route through several mocked shared helpers, so `setAll({name, color})`
object mutants and `is_midi_clip === 1` branch mutants there are hard to observe
without a full Live-API integration harness. Two more provably-equivalent
classes live here: the `omitFields: string[] = []` default (mutating to
`["Stryker…"]` omits a field name nothing checks) and the
`parseArrangementLength` catch-wrapper
(`msg.includes("Invalid duration format")` — both branches throw a message the
substring assertions already accept). Left for a future integration-test pass
rather than over-fitting.

## Gaps closed (actions)

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
| `validateAndConfigureRouteToSource` warns + forced `{true,true}`     | `duplicate-input-validation.test.ts`                    |
| `inferDestination` / `validateArrangementParameters` whitespace trim | `duplicate-destinations.test.ts`                        |
| `findRoutingOptionForDuplicateNames` id-sort position                | `duplicate-routing.test.ts`                             |
| Input/output routing-change branch (mock stored objects, not JSON)   | `duplicate-test-helpers.ts` + `duplicate-track.test.ts` |
| transforms/code-ignored warn (clip no-warn control + code-only arm)  | `duplicate-transforms.test.ts`                          |
| Take-lane setAll property copies + "created on lane N" + color-copy  | `duplicate-take-lane.test.ts`                           |
| determineTargetView track/device/scene arms + empty-array `.at(-1)`  | `focus-if-requested.test.ts`                            |
| name/color/omit-trackIndex/has_clip guards on duplicated tracks      | `duplicate-track.test.ts`                               |
| 2-digit source/destination track regexes in device duplication       | `duplicate-device.test.ts`                              |
