# Mutation baseline — 2026-07-15, read-op / small tier: `advanced`, `core`, `scene`, `live-set`

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

## Gaps closed (read-op / small tier)

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
