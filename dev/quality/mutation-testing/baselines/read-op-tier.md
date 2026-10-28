# Mutation baseline — 2026-07-15, read-op / small tier: `advanced`, `core`, `scene`, `live-set`

The four read-op / small tool domains, triaged together in one PR (13 mutated
files). Full passes — Stryker 9.6.1, Node 24, `coverageAnalysis: "perTest"`:

| Domain     | Baseline | Triaged     | Gate (`break`) | Survivors (from) | Files |
| ---------- | -------- | ----------- | -------------- | ---------------- | ----- |
| `advanced` | 96.50%   | **98.60%**  | 97             | 2 (from 5)       | 1     |
| `core`     | 94.53%   | **100.00%** | 99             | 0 (from 7)       | 3     |
| `scene`    | 88.63%   | **97.66%**  | 96             | 7 (from 34)      | 5     |
| `live-set` | 87.38%   | **99.07%**  | 98             | 4 (from 54)      | 4     |

All test-only changes. Each floor sits ~1–1.6 points below its score for
timeout-classification variance.

Two levers did most of the work:

- **The warn-and-skip message gap** (same shape as `device`/`track`), seen in
  `scene` and `live-set`: update tools `console.warn` then return a
  `{operation:"skipped", reason}` object, but tests asserted only the returned
  object, never the warning text. Adding
  `expect(outlet).toHaveBeenCalledWith(1, expect.stringContaining(...))` to each
  skip test killed ~16 blanked-message survivors in `live-set` locators alone.
- **Direct unit tests of exported helpers** only exercised transitively:
  `stopPlaybackIfNeeded` and `waitForPlayheadPosition` (polling predicate,
  success/failure warn, epsilon boundary) took `locator-updates.ts` from 75.8%
  to 98.7%.

Remaining survivors are bucket 2/3:

- **`advanced`** — the `default:` throw in the non-exported `executeOperation`
  switch is unreachable (operation validation, now `validateOperations`, rejects
  unknown types first); the two `NoCoverage` mutants there can't be killed
  without exporting internal API.
- **`scene`** — always-≥1 length guards (`createdScenes.length > 0` after a
  `count ≥ 1` loop), a pad loop that self-guards on a non-positive count, the
  all-null capture-property no-op, `parseInt("")` vs `parseInt("Stryker…")`
  (both `NaN`), and the undefined-notation passthrough to `readClip`.
- **`live-set`** — `waitUntil({})` (its defaults _are_
  `{pollingInterval:10, maxRetries:10}`), the `locatorName != null` operand
  whose only differing input is caught by the earlier all-null guard, a
  return-track-names arrow only observable through mixer sends, and an
  unknown-include string ignored downstream.

What changed (test-only): `liveApi` `> MAX_OPERATIONS` boundary, wrapped-error
`cause` and no-args `call_method`; `connect` stopped-set `isPlaying` boundary,
`live_app` version path and return-track count; the memory-route `||` guard and
`"unknown error"` default (then `callNodeMemoryRoute`, now in
`project-context-operations.ts`); scene capture/create/read/update guards,
boundaries and a two-digit selected-scene regex; direct tests of the locator
helpers (`locator-updates.test.ts`, new); 16 blanked locator warn/skip messages
and the reverse-order delete sort; `updateLiveSet` scale-absent no-warn and
unknown-operation throw; `extendSong` boundary; multi-word scale join and
root/scale error lists; the `readLiveSet` mixer-include gate (needs full param
mocks to be observable).
