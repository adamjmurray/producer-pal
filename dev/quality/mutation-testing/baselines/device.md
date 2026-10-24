# Mutation baseline — 2026-07-15, `src/tools/device/`

`create` / `read` / `update` device tools, the last spanning `update-device-*`
parsers, setters, and helpers. Full pass — Stryker 9.6.1, Node 24,
`coverageAnalysis: "perTest"`:

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
baseline (214 survivors) by killing 114 mutants with test-only changes. The
biggest lever was `wrap-devices-in-rack.ts` at **57.32%** (69 survivors): its
wrap tests asserted the return value but not the emitted warnings, the Live-API
method/property-name arguments, or the chain-creation arithmetic.

Per-file scores after triage:

| File                                       | Score   | Survived | Notes                             |
| ------------------------------------------ | ------- | -------- | --------------------------------- |
| `update-target-types.ts`                   | 100.00% | 0        | noteIfSet null-guard pinned       |
| `update-device-properties.ts`              | 96.63%  | 3        | cross-type not-applicable params  |
| `move-device.ts` + `rack-macro-updates.ts` | 95.31%  | 10       | macro variation/count, drum chain |
| `update-device.ts`                         | 93.52%  | 7        | focus `.at(-1)`, move/type warns  |
| `read-device.ts`                           | 92.31%  | 12       | return-chains + nested bounds     |
| `update-device-param-parser.ts`            | 92.31%  | 2        | pan/unit equivalents (bucket 2)   |
| `create-device.ts`                         | 91.75%  | 8        | name-set guard                    |
| `device-params-schema.ts`                  | 88.24%  | 2        | JSON preprocess (bucket 2/3)      |
| `update-device-param-setters.ts`           | 87.76%  | 28       | binary-search tolerance           |
| `wrap-devices-in-rack.ts`                  | 86.59%  | 21       | instrument reverse-loop internals |

`update-device-param-setters.ts` is the low outlier, mostly bucket 2:
`findRawValueForDisplay`'s linear-vs-binary-search detection. For a
nearly-linear param the linear shortcut and the binary search converge on the
same written value, so the `< tolerance` / `true &&` boundary mutants only show
with contrived non-physical `str_for_value` mappings (over-fitting). The
testable branches (division-label OR, min-label-unparseable fallback, pan max
from display labels) were closed. `wrap-devices-in-rack.ts`'s remaining
survivors are the instrument-rack reverse loop's internal
`LiveAPI.from(...)`/`move_device` string args and its best-effort cleanup loop:
defensive paths left for an integration pass.

What changed (test-only): chain-creation loop bounds and arithmetic; wrapInRack
warnings, name-set and `insert_chain` failure detection; macro variation
load/delete index-set and count boundary; drum-chain move (single chain vs whole
pad); nested drum-pad path boundaries; device `focus` selecting `.at(-1)` (3
devices, not a 2-element tie); cross-type "not applicable" params; return-chains
include and malformed-path warning; malformed-JSON `params` rejected, not
swallowed.

Lesson: **`expect.anything()` does not match `undefined`.** A guard like
`if (name != null) device.set("name", name)` mutated to `if (true)` writes
`set("name", undefined)`, and
`not.toHaveBeenCalledWith("name", expect.anything())` passes anyway, so the
mutant survives. Count calls instead:
`mock.calls.filter((c) => c[0] === "name")`.
