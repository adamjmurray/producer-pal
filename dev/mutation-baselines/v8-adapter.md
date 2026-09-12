# Mutation baseline — 2026-07-16, `v8Adapter` — `src/live-api-adapter/`

The Max V8 runtime side — the `LiveAPI` wrapper interface, the path helpers, and
the V8 half of the two RPC protocols to Node. The counterpart to `mcpServer`
(the Node-for-Max side) and the last tree to be mutated. Small: 4 mutated files
/ ~750 source LOC. Stryker 9.6.1, Node 24, `coverageAnalysis: "perTest"`:

| Metric      | Baseline | Triaged    | Gate (`break`) |
| ----------- | -------- | ---------- | -------------- |
| `v8Adapter` | 78.17%   | **97.97%** | 97             |

Per file:

| File (mutants)                     | Baseline | Triaged    | Survivors (from)  |
| ---------------------------------- | -------- | ---------- | ----------------- |
| `live-api-extensions.ts` (279)     | 81.72%   | **98.92%** | 3 (from 51)       |
| `code-exec-v8-protocol.ts` (43)    | 23.26%   | **95.35%** | 2 (from 33)       |
| `node-request-v8-protocol.ts` (35) | 97.14%   | **100%**   | 0 (from 1)        |
| `live-api-path-utils.ts` (37)      | 97.30%   | **91.89%** | 3 (all one cause) |

All test-only — no product code was touched. `live-api-adapter.ts` is excluded
as the V8 bundle entry point (it emits `outlet(0, "started")` and registers Max
message handlers at import), the same rationale `mcpServer` uses for
`mcp-server.ts`.

`live-api-path-utils.ts` _drops_ against its baseline without a single test
being removed: two of its three survivors were classified `Timeout` (which
counts as killed) in the first run and `Survived` in the second. The second
reading is the honest one — see the noise note below.

## Why this scope is timeout-noisy

`live-api-extensions.ts` patches the global `LiveAPI` prototype, and
`src/test/test-setup.ts` imports it at **setup** time, so the module body runs
once per test file, outside any test. Nearly all of its mutants are therefore
**static**: Stryker can't attribute them per-test and runs the whole suite for
each ("Ran all tests for this mutant"). A mutant that breaks the patch breaks
setup for _every_ test file, so the full run blows the time budget and lands as
`Timeout` rather than `Killed` — both count as killed, but which mutants tip
over shifts with machine load. Three runs of identical code:

| Run | Score  | Timeouts | Wall clock |
| --- | ------ | -------- | ---------- |
| 1   | 98.22% | 21       | 19m        |
| 2   | 97.97% | 10       | 14m        |
| 3   | 97.97% | 1        | 1m35s      |

The gate is set from the low end. Note the runtime swing has the same cause —
each timeout burns a full budget, so an unloaded machine finishes the smallest
tree in ~90 seconds while a busy one takes twenty minutes. Don't read a slow run
as a hang.

A `Timeout` here is not a weak kill. Spot-checking one (the `clipSlotIndex`
guard) by hand: the adapter suite fails it in **1.5 seconds** — it can't flip to
`Survived`, only between `Timeout` and `Killed`.

Three levers did most of the work:

- **Test how a module installs itself, not just what it installs.** The eight
  index getters are defined behind
  `if (!Object.prototype.hasOwnProperty.call(LiveAPI.prototype, "…"))` guards.
  On the single load a test run performs, the guard is _always_ false, so
  `if (true)` is indistinguishable — ~15 guard mutants survived as a block. They
  die to one new file (`live-api-extensions-install.test.ts`) asserting the two
  contracts the guards exist for: re-importing after `vi.resetModules()` must
  not throw (`Object.defineProperty` defaults to `configurable: false`, so an
  unguarded redefine throws `Cannot redefine property`), and importing with
  `LiveAPI` absent must be inert (the module is pulled into Node-side bundles
  where the Max global doesn't exist).
- **A mock that reimplements the thing under test hides it.** `readTrack` and
  `readClip` consume `returnTrackIndex` / `takeLaneIndex`, but every caller's
  test registers a mock object carrying those as _properties_ — which
  `MockLiveAPI`'s constructor copies onto the instance, shadowing the prototype
  getter. Both getters had **zero** real coverage despite looking well-covered;
  the path regexes are only reachable from an unregistered `LiveAPI.from(path)`.
- **Reach for the round-trip harness that already exists.** `code-exec` sat at
  23.26% because its Node round-trip was untested — but the sibling
  `node-request` protocol tests it at 97.14% with ~50 lines of Task stand-ins.
  Extracting those into `v8-protocol-test-helpers.ts` (shared by both, so no
  jscpd clone) and mirroring the suite took `code-exec` to 95.35%.

## Documented equivalents (`v8Adapter`)

Six of the eight residuals are equivalent — each verified by applying the mutant
and running the suite, then confirming the root cause in isolation:

| Mutant                                               | Why it can't be killed                                                                                                                                                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `live-api-path-utils.ts:33` (×3)                     | Emptying/skipping the `typeof idOrPath === "number"` branch falls through to `/^\d+$/.test(idOrPath)`, which coerces the number and returns the identical `id N`. Only unreachable inputs (negatives, floats) differ. |
| `live-api-extensions.ts:132` `startsWith`→`endsWith` | The branch only runs when `/^\d+$/.test(val)`, and an all-digit string can contain neither `"id "` prefix nor suffix — both sides are always false.                                                                   |
| `live-api-extensions.ts:159` `<`→`<=`                | `getChildIds` steps `i += 2` and reads `idArray[i] === "id"`; the extra iteration reads index `length`, which is `undefined` and never `"id"`.                                                                        |
| `live-api-extensions.ts:330` `matches.length === 0`  | `path.match(/devices (\d+)/g)` returns `null`, never `[]`, so the length arm is unreachable behind `!matches`.                                                                                                        |

The other two are bucket 3, both in the coverage-threshold-excluded
`code-exec-v8-protocol.ts`: the `console.error` text for a result with no
pending request (a diagnostic log — `error` is not relayed to the LLM, unlike
`warn`), and `executeNoteCode`'s body (`NoCoverage`) — a three-line delegation
to `extractNotesFromClip` + `buildCodeExecutionContext` +
`executeNoteCodeWithData`, each independently tested, whose only untested part
is the clip-mock scaffolding the vitest exclusion already calls out as not worth
reconstructing.

## Gaps closed (`v8Adapter`)

| Gap (now killed)                                                            | Test strengthened / added                   |
| --------------------------------------------------------------------------- | ------------------------------------------- |
| The 8 `hasOwnProperty` install guards + the `typeof LiveAPI` module guard   | `live-api-extensions-install.test.ts` (new) |
| `returnTrackIndex` / `takeLaneIndex` getters (regex, index 0, multi-digit)  | `live-api-extensions-path-indices.test.ts`  |
| `sceneIndex` clip_slots fallback on a double-digit track index              | `live-api-extensions-path-indices.test.ts`  |
| `exists()` for the `"id 0"` and numeric `0` id shapes                       | `live-api-extensions-basic.test.ts`         |
| Routing `getProperty`: warns on parse failure, stays silent when unset      | `live-api-extensions.test.ts`               |
| `setColor` format vs hex error messages; per-channel NaN rejection          | `live-api-extensions-color.test.ts`         |
| `setProperty` passes a numeric value through without formatting             | `live-api-extensions-setters.test.ts`       |
| Request IDs count **up** from their prefix (not merely unique)              | both `*-v8-protocol.test.ts`                |
| code-exec round trip: resolve, parse error, timeout, cancel, late/dup reply | `code-exec-v8-protocol.test.ts`             |
| `executeNoteCodeWithData` wraps code, passes globals, validates notes       | `code-exec-v8-protocol.test.ts`             |
