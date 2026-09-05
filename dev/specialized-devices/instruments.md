# Instruments

## Specialized instruments

### Drift — `DriftDevice` (`class_name: Drift`)

Compact synth. All specialization is around its modulation matrix, exposed
declaratively as `_index`/`_list` property pairs (no functions).

**Cycling LOM docs:** _not documented._ Read/write status below inferred from
convention: `_list` StringVectors are enumeration catalogs (RO), `_index` ints
are the active selection (RW). Probe 2026-05-21 confirmed.

**Properties (extras beyond baseline):**

Modulation matrix — filter routing:

- `mod_matrix_filter_source_1_index` (int) [RW]
- `mod_matrix_filter_source_1_list` (StringVector) [RO]
- `mod_matrix_filter_source_2_index` (int) [RW]
- `mod_matrix_filter_source_2_list` (StringVector) [RO]

Modulation matrix — LFO / pitch / shape routing:

- `mod_matrix_lfo_source_index` (int) [RW]
- `mod_matrix_lfo_source_list` (StringVector) [RO]
- `mod_matrix_pitch_source_1_index` (int) [RW]
- `mod_matrix_pitch_source_1_list` (StringVector) [RO]
- `mod_matrix_pitch_source_2_index` (int) [RW]
- `mod_matrix_pitch_source_2_list` (StringVector) [RO]
- `mod_matrix_shape_source_index` (int) [RW]
- `mod_matrix_shape_source_list` (StringVector) [RO]

Modulation matrix — three free source→target slots:

- `mod_matrix_source_1_index` (int) [RW]
- `mod_matrix_source_1_list` (StringVector) [RO]
- `mod_matrix_source_2_index` (int) [RW]
- `mod_matrix_source_2_list` (StringVector) [RO]
- `mod_matrix_source_3_index` (int) [RW]
- `mod_matrix_source_3_list` (StringVector) [RO]
- `mod_matrix_target_1_index` (int) [RW]
- `mod_matrix_target_1_list` (StringVector) [RO]
- `mod_matrix_target_2_index` (int) [RW]
- `mod_matrix_target_2_list` (StringVector) [RO]
- `mod_matrix_target_3_index` (int) [RW]
- `mod_matrix_target_3_list` (StringVector) [RO]

Voice / pitch config:

- `pitch_bend_range` (int) [RW]
- `voice_count_index` (int) [RW]
- `voice_count_list` (StringVector) [RO]
- `voice_mode_index` (int) [RW]
- `voice_mode_list` (StringVector) [RO]

**Children:** none beyond baseline.

**Functions:** none beyond baseline.

**Probe findings (2026-05-21):** The 15 `_list` properties collapse to only **2
distinct lists** — every source slot returns the same 8 sources, every target
slot returns the same 12 targets:

- Sources (shared across all 11 source slots — both fixed-target and free
  slots): `["Env 1", "Env 2", "LFO", "Key", "Vel", "Mod", "Press", "Slide"]`
- Targets (for the 3 free slots, includes a `"None"` sentinel):
  `["None", "Osc 1 Gain", "Osc 1 Shape", "Osc 2 Gain", "Osc 2 Detune", "Noise Gain", "LP Frequency", "LP Resonance", "HP Frequency", "LFO Rate", "Cyc Env Rate", "Main Volume"]`
- `voice_mode_list`: `["Poly", "Mono", "Stereo", "Unison"]`
- `voice_count_list`: `[4, 8, 16, 24, 32]` — returns **ints**, not strings
  (despite the doc declaring StringVector). Implemented set is
  `[4, 8, 16, 24, 32]` (`drift.ts` `VOICE_COUNTS`); the stray "1" seen in some
  UI configurations did not hold up.

**Modulation amounts are DeviceParameters, not class-level state.** Probe
confirmed `LP Mod Amt 1`, `LP Mod Amt 2`, `LFO Mod Amt`, `Osc 1 Shape Mod Amt`,
`Pitch Mod Amt 1`, `Pitch Mod Amt 2`, `Mod Matrix Amt 1`, `Mod Matrix Amt 2`,
`Mod Matrix Amt 3` all exist as regular parameters. So Drift's split is clean:
**source/target selection at class level, amounts as DeviceParameters**.

**Producer Pal interface** (as built; design probed 2026-05-21):

Fourteen writable string-enum pseudo-params on `update-device`, also returned by
`read-device` (in the `params` field — same surface as every other specialized
device):

Source slots (each takes one of the 8 source names):

- `filterMod1Source`, `filterMod2Source` — wire filter-frequency mods
- `lfoSource` — wire LFO-amount mod
- `pitchMod1Source`, `pitchMod2Source` — wire pitch mods
- `shapeSource` — wire osc-shape mod
- `mod1Source`, `mod2Source`, `mod3Source` — sources for the 3 free slots.
  **Omitted from reads when the paired target is `"None"`** (the slot is
  disabled): Live always reports a source index even for an off slot, so
  surfacing it would imply an active route that isn't there. Writes are
  unaffected — a source can be staged before its target.

Target slots (each takes one of the 12 target names, including `"None"`):

- `mod1Target`, `mod2Target`, `mod3Target` — targets for the 3 free slots

Voice / pitch config:

- `voiceMode` — `"Poly"` | `"Mono"` | `"Stereo"` | `"Unison"` (maps to
  `voice_mode_index` 0-3)
- `voiceCount` — discrete int set: **4, 8, 16, 24, 32** (Zod literal union; maps
  to `voice_count_index` into `voice_count_list`)
- `pitchBendRange` (int, semitones)

**Modulation amounts continue to flow through the regular DeviceParameter
surface.** They are not duplicated as pseudo-params — the LLM sets `mod1Source`
(pseudo-param) and `Mod Matrix Amt 1` (DeviceParameter) in the same
`update-device` call via the existing `params` arg.

**Valid values flow through `options.paramOptions`.** The `modulationSources`,
`modulationTargets`, `voiceModes`, and `voiceCounts` enums are stable (don't
vary per Live install), so each pseudo-param declares them via its `options`
field and `read-device include: ["options"]` reports them under `paramOptions`.
The skill carries only param names + routing semantics (e.g. "Env 2 → Filter
Freq"), with `voiceMode` kept as a short inline hint.

**Implementation gotchas:**

1. **Source list is shared across 11 slots.** A single canonical
   `modulationSources` list serves every slot — don't pretend there are 11
   distinct lists.
2. **`voice_count_list` returns ints, not strings**, despite being typed
   `StringVector` in the LOM docs. Read as `number[]` not `string[]`.
3. **`"None"` is a meaningful target value** — selecting it disables a free
   modulation slot. Treat as an explicit clear, not "skip the field."
4. **Modulation amounts stay on the DeviceParameter surface.** Document the
   pairing in skill instructions (e.g. "to wire LFO modulating Filter Freq, set
   `filterMod1Source = 'LFO'` and adjust `LP Mod Amt 1`").

### Meld — `MeldDevice` (`class_name: InstrumentMeld`)

**Cycling LOM docs:**
[melddevice](https://docs.cycling74.com/apiref/lom/melddevice/). All extras
documented; semantics verified by probe 2026-05-21.

**Properties (extras beyond baseline):**

- `mono_poly` (int) [RW] — `0` = mono, `1` = poly. Out-of-range silently
  reverts.
- `poly_voices` (int) [RW] — polyphony voice count. Valid range: **1-6** (probe
  confirmed; 7+ silently reverts to last valid).
- `unison_voices` (int) [RW] — unison voice count. Valid range: **0-2** (probe
  confirmed; 3+ silently reverts). Implemented as a validated raw 0-2 value
  (`meld.ts`, `writeIntInRange(0, 2)`).
- `selected_engine` (int, 0 or 1) [RW] — UI-only A/B engine display selector.
  Probe verified that writes to `A Osc Shape` with `selected_engine=1` still go
  to A. Functional engine choice for each chain is exposed as DeviceParameters
  (`A Osc Type`, `B Osc Type`, etc.).

**Children:** none beyond baseline.

**Functions:** none beyond baseline.

**Note on per-engine parameters:** Meld exposes **129 DeviceParameters** — both
A and B chains have their full engine, filter, LFO, amp, and modulation settings
as separate `A *` and `B *` params (e.g. `A Osc Type`, `A Filter Freq`,
`B LFO 1 Sync`, `B Glide Time`). Both chains are always independently
addressable regardless of `selected_engine`.

**Producer Pal interface** (as built; design probed 2026-05-21):

Three writable fields on `update-device`, also returned by `read-device`:

- `monoPoly` (enum: `"mono"` | `"poly"`) — maps to internal int 0/1
- `polyVoices` (int, 1-6)
- `unisonVoices` (int, 0-2)

**`selected_engine` deliberately NOT exposed** — UI-only display selector
(parallel to EQ Eight's `edit_mode`). Both A and B engines are reached directly
via `A *` / `B *` DeviceParameters.

**Implementation gotchas (verified by probe 2026-05-21):**

1. **Silent rejection on out-of-range writes.** `poly_voices=7`, `mono_poly=2`,
   `unison_voices=3`, etc. all return success but revert to prior valid value.
   Pre-validate against documented ranges.
2. **`polyVoices` is ignored in mono mode (semantically).** Setting it still
   succeeds and persists, but has no audible effect until `monoPoly` becomes
   `"poly"`. We don't warn — caller's intent.
3. **`unisonVoices` is exposed as a validated raw 0-2 value**
   (`writeIntInRange`). The per-value meaning follows the Meld UI; Producer Pal
   does not reinterpret it.

### Simpler — `SimplerDevice` (`class_name: OriginalSimpler`)

The richest single-device API among the in-scope natives. Exposes a `Sample`
child and destructive sample-edit functions. **Producer Pal today only supports
loading a sample via the `sample=` params shortcut (which calls `replace_sample`
under the hood).** Nothing else in this surface is currently wired up.

**Cycling LOM docs:**
[simplerdevice](https://docs.cycling74.com/apiref/lom/simplerdevice/). Most
extras documented; `replace_sample` is undocumented but present in our scan and
already used by Producer Pal.

**Properties (extras beyond baseline):**

Capability flags (indicate whether warp operations are valid for the current
sample):

- `can_warp_as` (bool) [RO]
- `can_warp_double` (bool) [RO]
- `can_warp_half` (bool) [RO]
- `multi_sample_mode` (bool) [RO] — true when Simpler is hosting a multi-sample
  preset
- `playing_position` (float) [RO] — real-time playback head position
- `playing_position_enabled` (bool) [RO]

State / mode selectors:

- `pad_slicing` (bool) [RW]
- `playback_mode` (int) [RW] — Classic / One-Shot / Slicing
- `retrigger` (bool) [RW]
- `slicing_playback_mode` (int) [RW]
- `voices` (int) [RW]

**Children (extras beyond baseline):**

- `sample` (Sample) [RO reference] — the child reference itself is immutable
  (you can't reassign it); to load a different sample, call `replace_sample` on
  the device. Sample sub-state (warp markers, slices, etc.) is mutated via
  Simpler's functions.

**Functions (extras beyond baseline):**

- `crop()` — destructive: trims the sample to its current start/end markers
- `guess_playback_length()` — heuristic: sets playback length from transients
- `replace_sample(file_path)` — undocumented; loads a new sample file
- `reverse()` — destructive: reverses the sample
- `warp_as(beats: int)` — sets warp tempo so the sample spans `beats` beats
- `warp_double()` — doubles the warp tempo (halves length)
- `warp_half()` — halves the warp tempo (doubles length)

**Note:** `multi_sample_mode` / `pad_slicing` suggest Simpler can morph into
Sampler/slicing modes. Notably, **Sampler** has none of this.

**Producer Pal interface** (as built; design probed 2026-05-21):

Read-only fields in `read-device`'s `params` output:

- `multiSampleMode` (bool) — true when hosting a multi-sample preset; `sample`
  writes likely fail in this state.
- `estimatedPlaybackLength` (float beats, only when a sample is loaded) —
  computed via `guess_playback_length`. Probe-verified pure compute (returned 16
  beats with no side effects on `can_warp_*`, `S Start`, `S Length`).

Writable via `update-device`'s `params` arg:

- `sample` (string path) — set via the `params` arg only; there is no top-level
  `sample` argument on create/update-device. Reads back as `null` when no sample
  loaded. The focused `include: ["sample"]` read surfaces it as a flat top-level
  `sample` field (discovery view, e.g. scanning every pad in a drum rack); the
  full `include: ["params"]` set also includes it.
- `gainDb` (float dB) — the loaded sample's gain, using the same linear↔dB
  mapping as track/clip gain (`gain-utils`). Reads/writes only when a single
  sample is loaded (warn-and-skip otherwise). A normal pseudo-param: appears in
  `include: ["params"]`, **not** in the focused `include: ["sample"]` view.
  Multi-sample state is conveyed by the read-only `multiSampleMode` param.
- `playbackMode` (enum: `"classic"` | `"one-shot"` | `"slicing"`) — maps to int
  0/1/2.
- `slicingPlaybackMode` (enum: `"mono"` | `"poly"` | `"thru"`) — maps to int
  0/1/2 (only meaningful when `playbackMode = "slicing"`).
- `retrigger` (bool).
- `voices` (discrete int set: **1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24,
  32**) — probe confirmed exact UI set; in-between values silently revert.
  Define as Zod literal union to constrain at schema level.

Actions via `update-device`'s new `actions: string[]` arg:

- `"reverse"` — reverses the loaded sample.
- `"crop"` — destructively trim to the marked region (frees memory; commits
  trim).
- `"warpDouble"` — doubles tempo of the marked region.
- `"warpHalf"` — halves tempo of the marked region.
- `"warpAs(N)"` — warps marked region to fit `N` beats (float). First test case
  for actions-with-args; design the parser to be extensible (Wavetable's
  `set_modulation_value` will need similar treatment).

**Skipped:**

- `can_warp_as` / `can_warp_double` / `can_warp_half` — state-dependent
  capability flags; let LLM attempt the action and warn on failure rather than
  surface the flags.
- `playing_position` / `playing_position_enabled` — realtime, not useful for
  Producer Pal's batch model.
- `pad_slicing` — niche.
- raw `guess_playback_length` as an action — surfaced as
  `estimatedPlaybackLength` RO pseudo-prop instead (pure compute).
- `warp_as(beats)` is exposed via the action syntax (`"warpAs(N)"`), not as a
  separate writable param.

**Implementation gotchas (verified by probe 2026-05-21):**

1. **Warp/crop actions operate on the active region** (`S Start` to
   `S Start + S Length`), not the whole sample. Skill instructions should make
   this clear so the LLM sets markers first when targeting a sub-region.
2. **`sample` writes likely fail when `multiSampleMode = true`** — warn-and-skip
   on failure.
3. **`voices` is a discrete set, not a continuous range.** Use Zod literal union
   (`z.union([z.literal(1), z.literal(2), ...])`) so out-of-set values are
   rejected at schema level. Probe: setting 9/11/13/15/17-19/21-23/25-31 all
   silently revert to prior valid.
4. **`can_warp_*` capability flags change after sample load and warp ops** —
   per-state, not stable. Don't cache. (Probe: `can_warp_as` went `0` → `1`
   after loading a sample; `can_warp_double/half` stayed `0`.)
5. **`estimatedPlaybackLength` should be omitted from read output when `sample`
   is null** — `guess_playback_length` returns garbage / 0 with no sample.

### Wavetable — `WavetableDevice` (`class_name: InstrumentVector`)

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
  `MOD_SOURCES` in `wavetable-modulation-helpers.ts`):
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
   `wavetable-modulation-helpers.ts`). Callers don't need a separate
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

## Generic-Device instruments (no specialization)

| Display name        | `class_name`            | Notes                                                             |
| ------------------- | ----------------------- | ----------------------------------------------------------------- |
| Analog              | `UltraAnalog`           | Everything via parameters.                                        |
| Collision           | `Collision`             | Everything via parameters.                                        |
| Electric            | `LoungeLizard`          | Heritage class name (Applied Acoustics' Lounge Lizard).           |
| External Instrument | `ProxyInstrumentDevice` | Routing only exposed via parameters; no class-level routing dict. |
| Impulse             | `InstrumentImpulse`     | Not a rack — no chains / drum_pads on the device itself.          |
| Operator            | `Operator`              | Flagship synth, but vanilla `Device`.                             |
| Sampler             | `MultiSampler`          | Surprising — Simpler has rich specialization; Sampler has none.   |
| Tension             | `StringStudio`          | Heritage class name (AAS String Studio).                          |
