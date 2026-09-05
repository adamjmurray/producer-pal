# Mutation baseline — 2026-07-15, `sharedRuntime` — `src/shared/`

The cross-cutting utility layer (12 mutated files) shared by both runtimes: the
last non-`src/tools/` code triaged this pass. Full pass — Stryker 9.6.1, Node
24, `coverageAnalysis: "perTest"`:

| Metric        | Baseline | Triaged    | Gate (`break`) |
| ------------- | -------- | ---------- | -------------- |
| sharedRuntime | 89.48%   | **94.94%** | 94             |

All test-only. Per-file movement (survivors from → to): `silent-wav-generator`
37.0% → 92.6% (17 → 2), `compact-parser` 90.9% → 98.9% (16 → 2), `config` 83.3%
→ 100%, `v8-max-console` 97.2% → 100%, `v8-sleep` 92.3% → 100%, `pitch` 89.2% →
91.8% (25 → 19), `version-check` 75.3% → 79.5% (18 → 15). `compact-serializer`,
`error-utils`, `live-api-path-builders`, `mcp-response-utils` were already 100%.

Two dominant levers here (different from the write/read tiers' warn-and-skip
gap):

- **A module-level cache defeating per-test coverage.** `silent-wav-generator`'s
  `ensureSilenceWav` caches via a module flag + on-disk file, so
  `createSilentWav` ran at most once across the whole test file — every
  byte-layout assertion hit the cache and Stryker attributed none of them to the
  code that produced the bytes. Rewriting the tests to `vi.resetModules()` +
  re-import per case (cold flag) and deleting the file first made the generator
  actually run under each WAV-header assertion, killing 15 arithmetic/string
  mutants.
- **A too-broad `toThrow` regex.** `compact-parser`'s malformed-input cases
  asserted `toThrow(/invalid compact literal|.../)`, which matches the shared
  `Invalid compact literal:` wrapper — so every blanked `fail(...)` message and
  every guard that fell through to a _different_ error still "threw" and
  survived. Asserting the **specific** reason per case
  (`/expected ':' after object key/`, `/unexpected trailing content/`, …) killed
  all 8 message mutants plus the missing-colon and object-key branch guards.

Remaining survivors are all bucket 2/3 (verified equivalent / defensive /
Stryker-limited), no real gaps:

- **`pitch` (19)** — `PITCH_CLASS_VALUES_LOWERCASE`'s builder arrow is a
  **static module-init mutant with 0 coverage** (Stryker can't cover static
  initializers under `perTest`); guard clauses in `numberToPitchClass` are
  redundant with the trailing `PITCH_CLASS_NAMES[num] ?? null` (out-of-range
  indices are `undefined` anyway); `quantizePitchToScale` / `clampToScaleBounds`
  boundary and modulo mutants are masked by the double normalization
  (`((x%12)+12)%12`) plus residue periodicity (the outward search always finds a
  match within ≤6 semitones); the `\d+`→`\d` octave mutant is masked by the MIDI
  range check (no in-range note has a 2-digit octave). `isValidNoteName` — which
  has _no_ range check — did kill both of its regex mutants.
- **`version-check` (15)** — the `checkForUpdate` response-shape guard cluster
  is fully masked by the outer `try/catch` (a bad `data.tag_name` access throws
  → caught → `null`) plus the downstream `typeof tagName !== "string"` check, so
  every relaxation still returns `null`; the `hasPreReleaseSuffix` `v`-strip
  mutants can't change `includes("-")` (stripping a `v` never adds/removes a
  dash).
- **A `perTest` attribution quirk** — Stryker does **not** attribute a test to a
  guard mutant when that test _early-returns at the guard_ (confirmed via
  `coveredBy`: the "returns null for non-strings" test is absent from
  `noteNameToMidi`'s guard mutant, and `numberToPitchClass("0")` from its
  guard). Those guards (`pitch` L151/L186) are therefore unkillable via
  coverage, though the behavior _is_ tested.
- **`silent-wav-generator` (2)** — `÷numChannels` ≡ `×numChannels` because
  `numChannels === 1`. **`compact-parser` (2)** — `defineProperty` ≡ `obj[key]=`
  for a normal key; the `parseString` `< length` → `<= length` boundary reads
  `""` past end then fails identically. **`notation` (1)** — the
  `typeof value === "string"` guard is redundant with `NOTATIONS.includes`
  (always `false` for a non-string).

## Gaps closed (`sharedRuntime`)

| Gap (now killed)                                                                    | Test strengthened / added      |
| ----------------------------------------------------------------------------------- | ------------------------------ |
| WAV byte layout (sizes, byte/sample rates, chunk labels) + two-level cache behavior | `silent-wav-generator.test.ts` |
| 8 blanked parser error messages + missing-colon / object-key branch guards          | `compact-parser.test.ts`       |
| `__proto__` descriptor flags (writable/enumerable/configurable)                     | `compact-parser.test.ts`       |
| `MIN_LIVE_VERSION` shape (empty-string mutant)                                      | `config.test.ts` (new)         |
| `checkForUpdate` non-ok guard (payload that would otherwise succeed)                | `version-check.test.ts`        |
| `isNewerVersion` 4th-part loop bound + leading-space-`v` trim                       | `version-check.test.ts`        |
| `isValidNoteName` / `noteNameToMidi` regex anchors + multi-digit octave             | `pitch.test.ts`                |
| `stepInScale` strict `< 0` / `> 127` MIDI-boundary clamps (sparse-scale cases)      | `pitch.test.ts`                |
| `warn` multi-arg outlet join + Dict-without-`stringify` optional chaining           | `v8-max-console.test.ts`       |
| `waitUntil` schedules a Task delay between polls (not a busy loop)                  | `v8-sleep.test.ts`             |
