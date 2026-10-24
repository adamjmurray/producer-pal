# Wavetable — `WavetableDevice` (`class_name: InstrumentVector`)

Part of [Instruments](README.md).

Two oscillator engines with wavetable selectors and an imperative mod-matrix API
(contrast with Drift's declarative `_index`/`_list` approach).

**Cycling LOM docs:**
[wavetabledevice](https://docs.cycling74.com/apiref/lom/wavetabledevice/). All
extras documented.

**Properties (extras beyond baseline):**

Wavetable selection (per oscillator):

- `oscillator_1_wavetable_category` (int) [RW]
- `oscillator_1_wavetable_index` (int) [RW]
- `oscillator_1_wavetables` (StringVector) [RO] — list of wavetables in the
  currently selected category for oscillator 1
- `oscillator_2_wavetable_category` (int) [RW]
- `oscillator_2_wavetable_index` (int) [RW]
- `oscillator_2_wavetables` (StringVector) [RO]
- `oscillator_wavetable_categories` (StringVector) [RO] — shared category list

Oscillator engine mode:

- `oscillator_1_effect_mode` (int) [RW] — engine mode (None / FM / Classic /
  Modern)
- `oscillator_2_effect_mode` (int) [RW]

Topology / voice config:

- `filter_routing` (int) [RW]
- `mono_poly` (int) [RW]
- `poly_voices` (int) [RW] — **index** (0-7) into the voice-count catalog
  `[2,3,4,5,6,7,8,16]`, NOT the raw count (verified vs Live 12.4 UI 2026-05-23;
  8+ silently reverts). Mirrors Drift's `voice_count_index`.
- `unison_mode` (int) [RW]
- `unison_voice_count` (int) [RW] — raw count, valid range **2-8** (probe
  confirmed 2026-05-23; outside reverts).

Modulation matrix support:

- `visible_modulation_target_names` (StringVector) [RO] — names of parameters
  currently visible as modulation targets

**Children:** none beyond baseline.

**Functions (extras beyond baseline) — imperative mod-matrix API:**

- `add_parameter_to_modulation_matrix(parameter: DeviceParameter)` — registers a
  DeviceParameter as a modulation target
- `get_modulation_target_parameter_name(index: int) → str` — returns the
  parameter name for a target slot (returns int sentinel `1` for out-of-range)
- `get_modulation_value(target_index: int, source_index: int) → float` — reads
  the amount in a matrix cell. Returns `0` for a valid cell with no modulation;
  returns int sentinel `1` for out-of-range indices.
- `is_parameter_modulatable(parameter: DeviceParameter) → int` — capability
  check (1 = modulatable)
- `set_modulation_value(target_index: int, source_index: int, amount: float)` —
  **3 args** (probe-verified; doc omits the amount). Writes a matrix cell;
  amount is a float in `-1..1` (the range Producer Pal documents and the skill
  advertises).

**Probe findings (2026-05-21):**

- **Default visible targets (4):** indices 0..3 return parameter names
  `"Volume"`, `"Transpose"`, `"Osc 1 Pos"`, `"Osc 1 Effect 1"`. Indices 4+
  return int sentinel `1`.
- **Source count: 13** (indices 0..12 valid). Index 13+ returns int sentinel
  `1`. **There is no `_list` property exposing source names** — the source
  index→name mapping is hard-coded from the Wavetable UI (verified 2026-05-22;
  `MOD_SOURCES` in `wavetable-modulation.ts`):
  `Amp, Env 2, Env 3, LFO 1, LFO 2, Vel, Key, PB, Press, Mod, Rand, Note PB, Slide`.
- **`set_modulation_value(0, 0, 0.5)` then `get_modulation_value(0, 0)`
  round-trips correctly** (read back 0.5). Cleanup `set(.., 0)` clears the cell.
- **`visible_modulation_target_names` returns display labels**
  (`["Amp", "Pitch", "Osc 1 Pos", "Osc 1 Warp"]`), but
  `get_modulation_target_parameter_name` returns **parameter names** that differ
  for some entries (`"Volume"` ↔ "Amp", `"Transpose"` ↔ "Pitch",
  `"Osc 1 Effect 1"` ↔ "Osc 1 Warp"). The matrix is keyed by **parameter name**,
  not display label. Resolver must translate.

**Producer Pal interface** (as built; design probed 2026-05-21):

Writable pseudo-params on `update-device` (via the existing `params` arg, also
returned by `read-device` in `params`):

Topology / voicing:

- `filterRouting` — `"serial"` | `"parallel"` | `"split"` (maps to int 0/1/2)
- `monoPoly` — `"mono"` | `"poly"` (maps to int 0/1)
- `polyVoices` (int) — actual voice count, one of `2/3/4/5/6/7/8/16` (maps to
  the `poly_voices` catalog index)
- `unisonMode` — `"none"` | `"classic"` | `"shimmer"` | `"noise"` |
  `"phase-sync"` | `"position-spread"` | `"random-note"` (maps to int 0..6)
- `unisonVoiceCount` (int, 2-8)

Oscillator engines + wavetables:

- `osc1Engine`, `osc2Engine` — engine mode per oscillator: `"None"` | `"Fm"` |
  `"Classic"` | `"Modern"` (verified vs Live 12.4 UI; `wavetable.ts`
  `OSC_ENGINES`).
- `osc1Category`, `osc2Category` — wavetable category (string from the shared
  catalog list)
- `osc1Wavetable`, `osc2Wavetable` — selected wavetable within the
  per-oscillator category-dependent list. **Order-dependent with `oscNCategory`
  in the same `update-device` call:** writing the category first re-populates
  the per-osc wavetable list, and a same-call wavetable write resolves against
  the new list. If the same wavetable name happens to exist in the new category,
  the write succeeds — but it's a different waveform. When changing category,
  apply category and wavetable in separate calls.

**Modulation matrix writes via the `actions: string[]` arg:**

- `setModulation('<targetParameterName>', '<sourceName>', <amount>)` — writes
  one cell. Internally: ensure the target is in the matrix (calls
  `add_parameter_to_modulation_matrix` when it isn't already registered),
  resolve target index via `get_modulation_target_parameter_name`, resolve
  source name via the hard-coded source table, call
  `set_modulation_value(t, s, amount)`.
- `clearModulation('<targetParameterName>', '<sourceName>')` — equivalent to
  `setModulation(..., ..., 0)`.
- `addModulationTarget('<parameterName>')` — explicit
  `add_parameter_to_modulation_matrix` for cases where the LLM wants to
  pre-register a target without setting a value yet (rare; covered by
  `setModulation` in the common case).

**Modulation matrix reads via a new top-level `modulations` output field on
`read-device`:**

```json
{
  "id": "...",
  "params": { "filterRouting": "serial", "osc1Wavetable": "Saw Dual 1", ... },
  "modulations": [
    {
      "target": "Osc 1 Pos",
      "source": "Env 2",
      "amount": 0.5
    },
    { "target": "Osc 1 Pos", "source": "LFO 1", "amount": -0.25 }
  ]
}
```

This field is parallel to `options` in role — structured data that isn't
param-shaped (it's **current state**, not catalog discovery) — and ships
alongside the dynamic catalogs: it is **opt-in via `include: ["options"]`**,
because scanning the mod matrix costs many Live API calls and shouldn't run on
every `read-device`. It is present for Wavetable only (omitted for other
devices). The matrix can't be flattened into `name = value` lines without name
collisions (e.g. `"Osc 1 Pos"` is **both** a DeviceParameter and a modulation
target).

**`options` include adds (for Wavetable):**

- `osc1Wavetables`, `osc2Wavetables` — current-category wavetables per
  oscillator. Dynamic per category × per Live install.
- `oscWavetableCategories` — the (install-dependent) category list both
  oscillators index into (values of `osc1Category` / `osc2Category`).
- `modulatableParameters` — list of DeviceParameter names where
  `is_parameter_modulatable=1` (the candidates for `addModulationTarget`).
  Stable per Live version but too long (~30 names) to fit in a Zod description.
- `modulationSources` — the hard-coded 13 canonical mod-matrix source names
  (values for the source arg of `setModulation` / `clearModulation`); no LOM
  property exposes them.
- `paramOptions` — valid values for the writable enum/range pseudo-params
  (`filterRouting`, `monoPoly`, `polyVoices`, `unisonMode`, `unisonVoiceCount`,
  `osc1Engine` / `osc2Engine`).

**Implementation gotchas:**

1. **`set_modulation_value` signature is 3 args, not 2.** Docs are wrong;
   probe-verified 3rd arg is the float amount.
2. **Display-label vs parameter-name mismatch.** Always use parameter names
   (from `get_modulation_target_parameter_name`) as the canonical matrix
   identifier. `visible_modulation_target_names` is for UI display only.
3. **Source index → name mapping is hard-coded.** No LOM property exposes it.
   Document the 13 source names in code (with a test that re-verifies the count
   against `get_modulation_value(0, 13)` returning sentinel `1`).
4. **Sentinel `1` for out-of-range.** Both
   `get_modulation_target_parameter_name` and `get_modulation_value` return int
   `1` for invalid indices instead of throwing. The resolver must check bounds
   before assuming the result.
5. **Targets are auto-registered.** `setModulation` defensively calls
   `add_parameter_to_modulation_matrix` when the target name isn't already in
   the matrix, then resolves its index (`ensureModulationTarget` in
   `wavetable-modulation.ts`). Callers don't need a separate
   `addModulationTarget` in the common case.
6. **No "remove target" function documented.** Cleanup of an unused target row
   is unclear (set all cells to 0? leave it?). Decide policy at implementation —
   likely "no cleanup; zero values are inert."
7. **Engine mode names resolved.** `oscillator_N_effect_mode` maps to
   `None / Fm / Classic / Modern` (verified vs Live 12.4 UI; `OSC_ENGINES`).

**Skipped:**

- Direct exposure of `visible_modulation_target_names` — internal display
  artifact. Active routes are visible in the `modulations` output field;
  visible-but-unwired targets are UI cruft we don't surface.
- Raw `is_parameter_modulatable` — implicit in the `modulatableParameters`
  catalog (in `options`).
