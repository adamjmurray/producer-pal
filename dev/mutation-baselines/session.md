# Mutation baseline — 2026-07-14, `src/tools/session/`

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

## Gaps closed (session)

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
