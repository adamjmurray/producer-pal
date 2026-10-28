# Mutation baseline — 2026-07-14, `src/tools/track/`

Full pass — Stryker 9.6.1, Node 24, `coverageAnalysis: "perTest"`:

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

Two scope refinements landed with this triage (both in `toolDomain()`) and apply
to **every** tool domain:

- **`.def.ts` excluded.** Tool-definition files are purely declarative (a
  `defineTool()` call: Zod schema plus LLM-facing description strings). Mutating
  a `.describe("…")` string just blanks prose that is eval-tested, and asserting
  exact wording would over-fit and fight description iteration. This lifted the
  raw `track` score from 73.14% (111 description-string survivors across 3 def
  files) to a behavioral 82.21%.
- **`read-track-drum-rack-test-helpers.ts` excluded.** It is test-only mock
  infrastructure, so mutating it is meaningless. It was first named
  `*-mock-helpers.ts` with a mutation-only glob for that name, which made it a
  test file to the mutation scope and source everywhere else (vitest measured
  its coverage as product code). Renamed `*-test-helpers.ts`, the glob every
  tool already honors.

Per-file scores after triage:

| File                                                          | Score  | Survived |
| ------------------------------------------------------------- | ------ | -------- |
| `track-routing.ts`                                            | 96.88% | 2        |
| `read-track.ts`                                               | 88.76% | 18       |
| `update-track.ts`                                             | 87.69% | 31       |
| `track-clips.ts` + `track-optional-fields.ts` (then one file) | 86.18% | 30       |
| `create-track.ts`                                             | 85.34% | 17       |
| `track-devices.ts`                                            | 58.49% | 18       |

`track-devices.ts` is the low outlier by design, not weak testing: most of its
survivors are **equivalent mutants**. `categorizeDevices` splits devices into
midi-effect / instrument / audio-effect buckets, but its sole consumer
(`read-track.ts`'s drum-map path) immediately re-flattens them — so mutating
which bucket a device lands in cannot change any observable output.

What changed (test-only): several "warn and skip" tests asserted only the
returned `{id}` object (returned regardless), never the warning or the skipped
write, so real misbehavior slipped through. Now pinned: an unmatched
`sendReturn` no longer silently writes the wrong send; send letter-prefix
matching (`"A"` must not match `"Analog"`); send-pair, no-mixer, no-sends and
index-exceeds warnings; invalid `monitoringState` writing an undefined value;
`createTrack` count/reach boundary (`count === MAX` allowed), return-track index
taken from the right collection (mock symmetry had masked it), multi-track
append insert index; the `firedSlotIndex === 0` boundary; and the
multi-instrument warning.

Remaining survivors are bucket 2 (equivalent: the categorization split,
`instruments[0] ?? null`, return/master/group clip guards that compute `0`
either way) and bucket 3 (warn/error message strings, internal option-passing
flags, `.exists()` guards on always-present mocks).
