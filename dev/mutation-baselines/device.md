# Mutation baseline — 2026-07-15, `src/tools/device/`

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

## Gaps closed (device)

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
