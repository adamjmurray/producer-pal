# Mutation baseline — 2026-07-16, `shared` — `src/tools/shared/`

The largest tool domain and the last one triaged: 50 mutated files / ~9,400
source LOC of cross-cutting infrastructure — the tool framework, validation,
arrangement helpers, the device reader, and the specialized-device specs. Too
big for one PR, so it was triaged in four independent test-only PRs by subarea,
each iterating against a temporarily-narrowed `mutate` glob (uncommitted — a
~2-minute inner loop vs ~5 for the whole domain). The gate comes from a final
whole-domain pass — Stryker 9.6.1, Node 24, `coverageAnalysis: "perTest"`:

| Metric   | Triaged (whole domain) | Gate (`break`) |
| -------- | ---------------------- | -------------- |
| `shared` | **95.25%**             | 94             |

Per subarea, as measured in its own PR against the narrowed glob (there is no
single pre-triage whole-domain number — each subarea was baselined separately):

| Subarea (files)              | Baseline | Triaged    | Survivors (from) |
| ---------------------------- | -------- | ---------- | ---------------- |
| Utilities & framework (14)   | 87.28%   | **92.78%** | — (~52 killed)   |
| Arrangement (8)              | 81.30%   | **95.98%** | 20 (from 97)     |
| Device reader & helpers (12) | 87.10%   | **95.14%** | 80 (from 213)    |
| Specialized devices (16)     | 90.19%   | **97.08%** | 33 (from 111)    |

All test-only — no product code was touched in any of the four. The
specialized-device subarea scored highest of the four (97.08%), as predicted:
every device spec already had a colocated test, so the survivors were
concentrated in declarative tables rather than untested logic.

Three levers did most of the work in the specialized subarea:

- **The discovery catalogs are data, and data needs a table test.** `actions`
  (name / signature / description) and `paramOptions` are pure LLM-facing tables
  the model reads to learn how to drive a device. The device tests asserted
  behavior and at most `actions.map((a) => a.name)`, so every `signature` and
  `description` string was unasserted. One `toStrictEqual` per catalog plus an
  `it.each` over the display-name routing table killed ~25 string/array mutants
  in one new file (`specialized-device-catalog.test.ts`).
- **Warn text is the model's only error channel.** The `Options: …` /
  `Available: …` / `must be one of …` lists are built with `join(", ")`, and
  several tests asserted only a fragment (`stringContaining("Pre FX")`) — which
  still matches when `join(", ")` decays to `join("")`. Asserting the whole
  joined list (and the `paramName` the warning names) killed every one.
- **Index 0 is a value, not a "not found".** `list.indexOf(...) < 0` guards
  paired with tests that only ever selected a middle entry left the `< 0` →
  `<= 0` mutants alive across Wavetable categories/wavetables, Hybrid Reverb IR
  files, the mod-matrix source `"Amp"` (column 0) and target slot 0. Each needed
  a test that selects the _first_ entry. The same shape appears in Hybrid
  Reverb's `list.length === 1 && list[0] === <sentinel>` empty-category guard: a
  category holding exactly one real IR must still be settable.

Remaining survivors are bucket 2/3. Each of the 111 original specialized
survivors was verified individually by applying the mutant and running the
covering suite (see **Verifying a survivor** below); the 20 that survive that
check are:

- **Guards subsumed by a downstream check.** The action parser's
  `if (quote) return null` (unterminated quote) is unreachable-by-effect: a
  token whose quote never closed can never _end_ with its own quote character,
  so `parseArgToken`'s `token.at(-1) !== first` rejects it anyway. Its
  `token.length < 2` guard is likewise dead — a token starting with a quote that
  reached `parseArgToken` at all has ≥2 characters (the split only happens once
  the quote closes). Similarly `readIrFile`'s `value == null` returns
  `undefined` either way, and `coerceInt`'s
  `typeof value === "number" ? value : Number(value)` is `Number(number)`
  identity.
- **Discriminated-union shadows.** Simpler's `probe.kind === "single"` operands
  can't be distinguished because `probe.path` / `probe.gain` only _exist_ on the
  `single` variant — relaxing the check reads `undefined` and yields the same
  result. `resolveSourceIndex`'s `n >= 0` is shadowed too: a negative index
  falls through and returns a negative, which the caller already treats as
  invalid.
- **Defensive caps and type guards.** `MAX_TARGETS` (512) bounds a loop that
  really terminates on the LOM's numeric sentinel; `typeof name === "string"` at
  a point where the sentinel was already handled; `typeof v === "number"` on a
  value Live always returns as a number. Killing these would mean forging LOM
  responses Live cannot produce.
- **A vestigial parameter.** `readParamEntries`'s `predicate` has exactly one
  caller, which passes `() => true` — so its `if (!predicate(param)) continue`
  is dead (and the domain's only `NoCoverage` mutant). Worth deleting, but that
  is product code, out of scope for a test-only pass.
- **Ambiguity we deliberately resolve one way.** Compressor's
  `routingType.display_name === NO_INPUT_LABEL` only differs if a user names a
  track literally `"No Input"`; the sentinel wins by design, and asserting that
  would over-fit an ambiguity Live itself doesn't disambiguate.

Note the gap between the harness verdict (20 uncatchable) and Stryker's 33
survivors: the other ~13 are **`perTest` false survivors** — a killing test
exists and passes, but Stryker never attributes it because the killing input
short-circuits the mutated guard during the coverage dry-run. Almost all are
`ObjectLiteral → {}` mutants on the spec objects themselves. This rate (13/111)
is far higher than the arrangement and device subareas (0 and 2), which is why
the whole-domain score lands below what the triage alone would suggest.

## Gaps closed (`shared`, specialized subarea)

| Gap (now killed)                                                                    | Test strengthened / added                    |
| ----------------------------------------------------------------------------------- | -------------------------------------------- |
| Simpler + Wavetable action catalogs (every `signature` / `description`)             | `specialized-device-catalog.test.ts` (new)   |
| `class_display_name` → spec routing for all 12 specialized devices                  | `specialized-device-catalog.test.ts` (new)   |
| Modulation-rate effects expose no params and no `paramOptions` key                  | `specialized-device-catalog.test.ts` (new)   |
| Action grammar: `$` anchor, `""` arg, whitespace-only args, double-quoted commas    | `specialized-device-action-parser.test.ts`   |
| Numeric args: multi-digit floats (`12.5`, `.25`) and digit-led words (`4x`)         | `specialized-device-action-parser.test.ts`   |
| Mod matrix: source `"Amp"` (index 0), slot-0 target no re-add, ±1 amount boundary   | `wavetable-modulation-helpers.test.ts` (new) |
| Mod matrix: name trimming, zero-cell exclusion, exactly-13-source scan              | `wavetable-modulation-helpers.test.ts` (new) |
| Wavetable/Drift `inactiveWhen` rules (LFO sync, Cyc Env time mode)                  | `specialized-device-registry.test.ts`        |
| First category / wavetable selectable (index 0) + `Available:` lists                | `wavetable.test.ts`                          |
| Hybrid Reverb single-file category settable; first IR selectable; `Available:` list | `hybrid-reverb.test.ts`                      |
| Compressor whitespace-only sidechain id clears; channel `Available:` list           | `compressor.test.ts`                         |
| Simpler multi-sample / gain-less / non-number `voices` reads omit their params      | `simpler.test.ts`                            |
| `coerceBool` trims; enum + int-set warnings name the param and list valid values    | `specialized-device-param-helpers.test.ts`   |
| Boolean pseudo-param warnings name their param (`oversample`, `envListen`, …)       | `eq-eight` / `roar` / `hybrid-reverb` tests  |
| `readSpecializedParams` search term is trimmed                                      | `specialized-device-registry.test.ts`        |
