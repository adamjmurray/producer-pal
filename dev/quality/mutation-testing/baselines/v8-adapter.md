# Mutation baseline — 2026-07-16, `v8Adapter` — `src/live-api-adapter/`

The Max V8 runtime side: the `LiveAPI` wrapper interface, the path helpers, and
the V8 half of the two RPC protocols to Node. The counterpart to `mcpServer`.
Small: 4 mutated files / ~750 source LOC. Stryker 9.6.1, Node 24,
`coverageAnalysis: "perTest"`:

| Metric      | Baseline | Triaged    | Gate (`break`) |
| ----------- | -------- | ---------- | -------------- |
| `v8Adapter` | 78.17%   | **97.97%** | 97             |

Per file:

| File (mutants)                     | Baseline | Triaged    | Survivors (from)  |
| ---------------------------------- | -------- | ---------- | ----------------- |
| `live-api-extensions.ts` (279)     | 81.72%   | **98.92%** | 3 (from 51)       |
| `code-exec-v8-protocol.ts` (43)    | 23.26%   | **95.35%** | 2 (from 33)       |
| `node-request-v8-protocol.ts` (35) | 97.14%   | **100%**   | 0 (from 1)        |
| `live-api-id-or-path.ts` (37)      | 97.30%   | **91.89%** | 3 (all one cause) |

All test-only. `live-api-adapter.ts` is excluded as the V8 bundle entry point
(it emits `outlet(0, "started")` and registers Max message handlers at import),
the same rationale `mcpServer` uses for `mcp-server.ts`.

`live-api-id-or-path.ts` _drops_ against its baseline without a test being
removed: two of its three survivors were `Timeout` (counts as killed) in the
first run and `Survived` in the second. The second reading is the honest one.

## Why this scope is timeout-noisy

`live-api-extensions.ts` patches the global `LiveAPI` prototype, and
`src/test/test-setup.ts` imports it at **setup** time, so the module body runs
once per test file, outside any test. Nearly all of its mutants are therefore
**static**: Stryker can't attribute them per-test and runs the whole suite for
each ("Ran all tests for this mutant"). A mutant that breaks the patch breaks
setup for _every_ test file, so the full run blows the time budget and lands as
`Timeout` rather than `Killed`. Both count as killed, but which mutants tip over
shifts with machine load. Three runs of identical code:

| Run | Score  | Timeouts | Wall clock |
| --- | ------ | -------- | ---------- |
| 1   | 98.22% | 21       | 19m        |
| 2   | 97.97% | 10       | 14m        |
| 3   | 97.97% | 1        | 1m35s      |

The gate is set from the low end. The runtime swing has the same cause (each
timeout burns a full budget): an unloaded machine finishes in ~90 seconds, a
busy one in twenty minutes. Don't read a slow run as a hang. A `Timeout` here is
not a weak kill: the adapter suite fails the `clipSlotIndex` guard mutant in 1.5
seconds, so it can only flip between `Timeout` and `Killed`.

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

- **`live-api-id-or-path.ts`, the `typeof idOrPath === "number"` branch (×3).**
  Emptying or skipping it falls through to `/^\d+$/.test(idOrPath)`, which
  coerces the number and returns the identical `id N`. Only unreachable inputs
  (negatives, floats) differ.
- **`startsWith` → `endsWith` on the `"id "` prefix** in
  `live-api-extensions.ts`: the branch only runs when `/^\d+$/.test(val)`, and
  an all-digit string can contain neither prefix nor suffix.
- **`<` → `<=` in `getChildIds`**: it steps `i += 2` and reads
  `idArray[i] === "id"`; the extra iteration reads index `length`, which is
  `undefined`.
- **`matches.length === 0`** on `path.match(/devices (\d+)/g)`: `match` returns
  `null`, never `[]`, so the length arm is unreachable behind `!matches`.

The other two are bucket 3, both in the coverage-threshold-excluded
`code-exec-v8-protocol.ts`: the `console.error` text for a result with no
pending request (a diagnostic log — `error` is not relayed to the LLM, unlike
`warn`), and `executeNoteCode`'s body (`NoCoverage`) — a three-line delegation
to `extractNotesFromClip` + `buildCodeExecutionContext` +
`executeNoteCodeWithData`, each independently tested, whose only untested part
is the clip-mock scaffolding the vitest exclusion already calls out as not worth
reconstructing.

What changed (test-only): the 8 `hasOwnProperty` install guards and the
`typeof LiveAPI` module guard (`live-api-extensions-install.test.ts`, new); the
`returnTrackIndex` / `takeLaneIndex` getters (regex, index 0, multi-digit) and
the `sceneIndex` fallback on a double-digit track index; `exists()` for `"id 0"`
and numeric `0`; routing `getProperty` warning on parse failure and staying
silent when unset; `setColor` error messages and per-channel NaN rejection;
`setProperty` passing a number through unformatted; request IDs counting _up_
from their prefix (not merely unique); and the code-exec round trip (resolve,
parse error, timeout, cancel, late/duplicate reply).
