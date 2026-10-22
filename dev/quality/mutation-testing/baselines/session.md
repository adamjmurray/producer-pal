# Mutation baseline — 2026-07-14, `src/tools/session/`

`library` / `playback` / `select` / `read-samples` tools. Full pass — Stryker
9.6.1, Node 24, `coverageAnalysis: "perTest"`:

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
baseline (159 survivors) by killing 42 mutants with test-only changes.

Per-file scores after triage:

| File                      | Score  | Survived | Notes                          |
| ------------------------- | ------ | -------- | ------------------------------ |
| `library.ts`              | 97.59% | 6        | sort/filter/reason gaps closed |
| `playback.ts`             | 95.71% | 6        |                                |
| `library-search-batch.ts` | 94.55% | 3        |                                |
| `read-samples.ts`         | 94.44% | 4        |                                |
| `arrangement-playback.ts` | 94.00% | 6        |                                |
| `select.ts`               | 89.78% | 19       |                                |
| `selection-updates.ts`    | 86.56% | 34       |                                |
| `select-id-resolution.ts` | 86.27% | 7        |                                |
| `select-responses.ts`     | 82.64% | 19       |                                |
| `library-query-schema.ts` | 38.10% | 13       | prose/equivalent — see below   |

`library-query-schema.ts` is the low outlier by design: it is mostly a Zod
schema whose 11 surviving `.describe("…")` mutations are the same untestable
LLM-facing prose that `.def.ts` files carry (asserting exact wording over-fits).
Its two logic survivors are the `preprocess` guard, a
`typeof value === "string"` check whose mutant is provably equivalent (the
`catch` returns the original value on any parse failure, so a non-string
round-trips identically).

The `select*` files carry most of the remaining survivors, and they are
dominated by bucket-2/3 mutants: response-shape field guards
(`if (info) result.x = info` where the builder never returns null on tested
paths), `.exists()` guards on always-present mocks, and
`validateIdType(id, type, "select")` error-context strings. Genuine bucket-1
gaps there are sparse.

What changed (test-only): `sortPartition` name / mod_date / use_count ordering;
`reason` key no longer leaking as `undefined` when absent; folder-scan item
shape; `callRoute` success-with-no-result must throw; `deviceKind: "audiofx"`
passthrough; the `searches` cap boundary (exactly 20 does not warn),
dropped-count math, first-stalenessRisk-wins and omitted `reason`; zero-length
loop (`loopEnd` at `loopStart`); `select` conflict-view warning; wildcard search
regex-escaping.

Lesson: the old sort tests used coincidentally aligned data (all `useCount: 0`,
or a use_count order matching alphabetical order), so a wrong sort branch gave
the same output. Use data where name order, useCount order and upstream order
all differ, so each mode is pinned uniquely.
