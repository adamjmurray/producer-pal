# Mutation baseline — 2026-07-15, `src/tools/actions/`

`delete` and `duplicate` tools. Full pass — Stryker 9.6.1, Node 24,
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
baseline (191 survivors) by killing 96 mutants with test-only changes.

Per-file scores after triage:

| File                                                         | Score   | Survived | Notes                          |
| ------------------------------------------------------------ | ------- | -------- | ------------------------------ |
| `focus-if-requested.ts`                                      | 100.00% | 0        | target-view arms fully pinned  |
| `duplicate-destinations.ts`                                  | 99.38%  | 1        | direct unit tests (81% → 99%)  |
| `delete.ts`                                                  | 94.22%  | 15       | 2-digit indices + comparator   |
| `duplicate-routing.ts`                                       | 94.12%  | 6        | mock fix exposed routing arm   |
| `duplicate-track.ts` / `duplicate-scene.ts`                  | 91.62%  | 11       |                                |
| `duplicate.ts`                                               | 87.60%  | 15       |                                |
| `apply-clip-transforms.ts`                                   | 86.67%  | 4        | edge/optional-chain (bucket 2) |
| `duplicate-device.ts`                                        | 85.54%  | 10       | 2-digit track regexes          |
| `arrangement-length.ts` / `duplicate-clip-to-arrangement.ts` | 81.65%  | 25       | heavy tiling paths             |

The last row is the low outlier, mostly bucket 2/3: the arrangement-tiling paths
route through several mocked shared helpers, so `setAll({name, color})` object
mutants and `is_midi_clip === 1` branch mutants are hard to observe without a
full Live-API harness. Left for an integration-test pass rather than
over-fitting. The `parseArrangementLength` catch-wrapper
(`msg.includes("Invalid duration format")`) is provably equivalent: both
branches throw a message the substring assertions already accept.

What changed (test-only):

- Index regexes (`\d+`) for tracks, scenes, return tracks, clips and devices
  were pinned with 2-digit indices, in `delete.test.ts`, `delete-device.test.ts`
  and `duplicate-device.test.ts`. The device-deletion comparator tiebreaker
  (chains before return_chains) is covered too.
- Warn-and-skip paths now assert the warning and the skipped write: route-to-
  source validation, ignored transforms/code, whitespace trim in destination
  inference, take-lane property copies, and the name/color/has_clip guards on
  duplicated tracks.

Lessons:

- **Discriminating sort data.** The duplicate-named-track routing test uses
  children order (5,2,9) ≠ id-sorted order (2,5,9) plus a non-matching low-id
  track, so a blanked, flipped-comparator or kept-filter mutant each picks a
  different position (same fix as `session`'s `sortPartition`).
- **A mock can hide a whole branch.** `setupRouteToSourceMock` stored routing
  properties as plain objects, but `getProperty` JSON-parses them, so every
  route-to-source test silently hit the parse-failure path and the real
  input/output routing code never ran. Storing them as JSON strings, as Live
  returns them, made the branch testable.
