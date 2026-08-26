# Mutation baseline — 2026-07-14, `src/tools/track/`

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
- **`read-track-drum-rack-test-helpers.ts` excluded.** It is test-only mock
  infrastructure (it imports the mock Live API; its sole importer is another
  test helper), so mutating it is meaningless. Triage originally spelled it
  `*-mock-helpers.ts` and added a glob for that name, which made it a test file
  to the mutation scope and source everywhere else — vitest measured its
  coverage as product code. It is now named `*-test-helpers.ts`, which the
  existing glob already caught, and is a test file to every tool.

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

## Gaps closed (track)

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
