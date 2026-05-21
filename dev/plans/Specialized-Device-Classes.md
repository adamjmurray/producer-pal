# Specialized Device Classes in the Ableton Live LOM

Survey of native instruments and audio effects in Live 12.4 to identify which
devices expose a specialized LOM class (with properties / children / functions
beyond the generic `Device` baseline) versus which are plain `Device`.

**Scope (deliberately narrowed):** MIDI effects are out of scope. The following
specialized classes are also out of scope for Producer Pal follow-up and are
excluded from this report: `RackDevice` (Drum Rack / Instrument Rack / Audio
Effect Rack — macros already supported), `DrumCellDevice` (tied to the rack
model), `MaxDevice` (M4L devices — different surface), `LooperDevice`
(realtime/transport semantics don't fit Producer Pal's batch model).

## Methodology

For each native device:

1. Created the device on a clean test track via `ppal-create-device`.
2. Called `ppal-live-api { type: "info" }` on the resulting LiveAPI object to
   dump its class signature.
3. Compared the dump to the generic `Device` baseline (below). Anything beyond
   the baseline is "specialized."

Scan performed on Live 12.4 with Producer Pal 1.4.8 on 2026-05-21. The LOM docs
at https://docs.cycling74.com/apiref/lom/ describe most but not all of these.
Confirmed undocumented (as of 2026-05-21): `DriftDevice`, `Eq8Device`,
`ShifterDevice`. Confirmed documented (per-device links in each section below):
`CompressorDevice`, `HybridReverbDevice`, `MeldDevice`, `RoarDevice`,
`SimplerDevice`, `SpectralResonatorDevice`, `WavetableDevice` — though some have
gaps (e.g. Simpler's `replace_sample` is undocumented but real).

## Baseline `Device` signature

```
type Device
children parameters DeviceParameter
child canonical_parent Track
child view View
property can_compare_ab bool
property can_have_chains bool
property can_have_drum_pads bool
property class_display_name str
property class_name str
property is_active bool
property is_using_compare_preset_b bool
property latency_in_ms float
property latency_in_samples int
property name str
property type DeviceType
function save_preset_to_compare_ab_slot
function store_chosen_bank
```

Everything below documents **deltas** from this baseline.

## Headline numbers (in-scope only)

- **4 specialized instruments:** Drift, Meld, Simpler, Wavetable.
- **6 specialized audio effects:** Compressor, EQ Eight, Hybrid Reverb, Roar,
  Shifter, Spectral Resonator.
- Heritage `class_name` values worth noting:
  - Electric → `LoungeLizard` (generic Device — Applied Acoustics heritage)
  - Tension → `StringStudio` (generic Device — AAS heritage)
  - Analog → `UltraAnalog` (generic Device)
  - Sampler → `MultiSampler` (generic Device)
  - Simpler → `OriginalSimpler` (`SimplerDevice`)
  - Wavetable → `InstrumentVector` (`WavetableDevice`)
  - Spectral Resonator → `Transmute` (`SpectralResonatorDevice`) — internal code
    name; sibling Spectral Time has `class_name: Spectral` but is generic Device

---

# Interface conventions

These cross-cutting decisions apply to multiple specialized devices. Per-device
sections below reference these patterns rather than redocumenting them.

## The `assets` include (opt-in discoverability)

`read-device` supports an opt-in `include: ["assets"]` parameter that surfaces
per-device "what choices are available" data — catalogs, enum source lists, and
other browse-style metadata that the LLM needs when planning a write but doesn't
care about during normal state inspection.

**Default OFF.** Without the include, `read-device` returns only current state,
keeping reads compact. The LLM opts in when actively choosing from a catalog
(picking an IR file, selecting a wavetable, configuring a mod-matrix route).

**Per-device contents** (only the devices listed add anything; others are no-ops
for this include):

- **Compressor:** `sidechainSourceTrackIds` — trackIds that are valid sidechain
  sources for the current Live Set (excludes tracks with no audio-bearing
  devices).
- **Hybrid Reverb:** `irCategoryList` (all 10 stable categories) + `irFileList`
  (files in the currently selected category — varies per Live install and per
  category).
- **Wavetable:** category list + current-category wavetables list (mirrors the
  Hybrid Reverb pattern; see Wavetable section below).
- **Drift:** all 15 mod-matrix `_list` properties as resolved name arrays.

Stable enums that don't change per Live install (e.g. EQ Eight's
`globalMode: stereo|L/R|M/S`, Meld's `monoPoly: mono|poly`) are documented in
tool descriptions / skill instructions rather than surfaced via this include.

**Why opt-in:** Most reads inspect current state, not catalogs. Drift in
particular would bloat every read significantly. Opt-in keeps the happy path
compact and establishes a clear browse pattern: "to see what's available, ask."

---

# Instruments

## Specialized instruments

### Drift — `DriftDevice` (`class_name: Drift`)

Compact synth. All specialization is around its modulation matrix, exposed
declaratively as `_index`/`_list` property pairs (no functions).

**Cycling LOM docs:** _not documented._ Read/write status below inferred from
convention: `_list` StringVectors are enumeration catalogs (RO), `_index` ints
are the active selection (RW).

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
  confirmed; 3+ silently reverts). Exact semantic of each value (off vs voice
  count) TBD at implementation time — verify against Meld UI.
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

**Producer Pal interface design (decided 2026-05-21 via probe):**

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
3. **`unisonVoices` semantic meaning of 0/1/2 needs UI verification.** Likely
   `0` = off / single voice and `1`/`2` = additional unison voices, but confirm
   at implementation time.

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
- `poly_voices` (int) [RW]
- `unison_mode` (int) [RW]
- `unison_voice_count` (int) [RW]

Modulation matrix support:

- `visible_modulation_target_names` (StringVector) [RO] — names of parameters
  currently visible as modulation targets

**Children:** none beyond baseline.

**Functions (extras beyond baseline) — imperative mod-matrix API:**

- `add_parameter_to_modulation_matrix(parameter: DeviceParameter)` — registers a
  DeviceParameter as a modulation target
- `get_modulation_target_parameter_name(index: int)` — returns the parameter
  name for a target slot
- `get_modulation_value(target_index: int, source_index: int)` — reads the
  amount in a matrix cell
- `is_parameter_modulatable(parameter: DeviceParameter)` [RO query] — capability
  check
- `set_modulation_value(target_index: int, source_index: int)` — writes a matrix
  cell (signature in doc omits the amount; verify at implementation time)

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

---

# Audio Effects

## Specialized audio effects

### Compressor — `CompressorDevice`

Exposes sidechain input routing dictionaries at the class level (Live's standard
routing-dict shape — values are dicts, not simple ints).

**Cycling LOM docs:**
[compressordevice](https://docs.cycling74.com/apiref/lom/compressordevice/). All
extras documented.

**Properties (extras beyond baseline):**

- `available_input_routing_channels` (dict) [RO] — catalog of channel choices
  for the currently selected routing type
- `available_input_routing_types` (dict) [RO] — catalog of routing-type choices
  (Ext. In, tracks, returns, master, etc.)
- `input_routing_channel` (dict) [RW] — selected channel sub-routing (e.g.
  Post-FX / Pre-FX / Post-Mixer for a track)
- `input_routing_type` (dict) [RW] — selected sidechain input source

**Children:** none beyond baseline.

**Functions:** none beyond baseline.

**Note:** Gate, Glue Compressor, Multiband Dynamics, Auto Filter all support
sidechain in the UI but expose nothing class-level. The dict shape here matches
the standard Live "routing object" used elsewhere (Track inputs, etc.).

**Producer Pal interface design (decided 2026-05-21 via probe):**

Two writable fields on `update-device`, also returned by `read-device`:

- `sidechainSourceTrackId` (trackId or null) — `null` means "No Input"
- `sidechainChannel` (`"Pre FX"` | `"Post FX"` | `"Post Mixer"` or null)

The class-level `available_input_routing_types` and
`available_input_routing_channels` are used internally for validation. See
[`assets` include](#the-assets-include-opt-in-discoverability) — opt-in adds
`sidechainSourceTrackIds` (list of trackIds that are valid sources, filtered to
tracks with audio-bearing devices). Channel options (`"Pre FX"` / `"Post FX"` /
`"Post Mixer"`) are stable per Live version and documented in the tool
description rather than surfaced.

**Implementation gotchas (verified by probe 2026-05-21):**

1. **Live silently swallows invalid sets.** Bad identifiers, unknown
   `display_name`s, and excluded-track identifiers all return `success` but the
   value doesn't actually change. **Pre-validation is required** — there is no
   error signal to react to after the fact.

2. **Routing identifiers are NOT Live object IDs.** They're a separate
   Live-internal namespace. In our test set, Drift's trackId is `"136"` but its
   routing identifier is `3`; AudioFX's trackId is `"149"` but its routing
   identifier is `16`. Translate by matching the track's `name` against the
   `display_name` of entries in `available_input_routing_types`.

3. **Excluded source tracks:** any track whose device chain has no audio-bearing
   device (no instrument, no audio effect) is omitted from
   `available_input_routing_types`. Pure-MIDI tracks with only MIDI effects are
   excluded. Attempted writes should warn-and-skip:
   `"Track 'foo' cannot be a sidechain source — it has no audio-bearing devices"`.

4. **Channel options vary by source:**
   - Self-reference (Compressor sidechaining its own track): only `Pre FX`
   - Source has audio effects but no instrument: no `Pre FX` (no pre-FX signal
     exists)
   - Source is master or has an instrument: full `Pre FX, Post FX, Post Mixer`

5. **Channel `identifier` values are not stable across reads.** `Pre FX` was id
   20 with source=Drift, 23 with source=AudioFX, 24 with source=Main, 27 with
   source=MIDI-FX. Always re-read `available_input_routing_channels` after a
   source change; never cache.

6. **Order matters in batched updates.** If both `sidechainSourceTrackId` and
   `sidechainChannel` are in the same `update-device` call: apply source first,
   re-read `available_input_routing_channels`, then apply channel (validated
   against the freshly read list).

7. **Sidechain on/off is a DeviceParameter** (`S/C On`, param index 20), not
   part of this work. Already accessible via the existing parameter surface.

**Set value format:** the `set` operation must receive a stringified JSON dict,
e.g. `value: '{"identifier": 3}'` — `ppal-live-api`'s `value` field doesn't
accept native objects.

**Shared helper opportunity:** Live uses the same routing-dict shape for Track
inputs/outputs. The resolver
(`{trackId, channelString} ↔ {routing identifier, channel identifier}`) belongs
in a shared helper. If Ableton later adds class-level routing APIs to Gate /
Glue Compressor / Multiband Dynamics / Auto Filter, the helper can pick them up
cheaply.

### EQ Eight — `Eq8Device`

**Cycling LOM docs:** _not documented._ Semantics verified by probe 2026-05-21.

**Properties (extras beyond baseline):**

- `edit_mode` (int, 0 or 1) [RW] — UI-only selector for which chain (A=0, B=1)
  the device GUI displays. Does NOT affect parameter writes (probe-verified).
  Out-of-range writes (2, 99) silently revert to prior value.
- `global_mode` (int, 0/1/2) [RW] — processing mode. Valid: 0=Stereo, 1=L/R,
  2=M/S. Out-of-range writes silently revert.
- `oversample` (bool) [RW]

**Children:** none beyond baseline.

**Functions:** none beyond baseline.

**Note on per-band parameters:** Per-band controls are 80 DeviceParameters: 8
bands × 5 controls (Filter On, Filter Type, Frequency, Gain, Q) × 2 chains (`A`
and `B`), e.g. `1 Filter On A`, `1 Frequency A`, ... `8 Q B`. Plus device-wide:
`Device On`, `Output`, `Scale`, `Adaptive Q`. **Both A and B parameters are
always independently addressable by name regardless of `edit_mode` or
`global_mode`** — chain is determined by parameter suffix.

**Producer Pal interface design (decided 2026-05-21 via probe):**

Two writable fields on `update-device`, also returned by `read-device`:

- `globalMode` (enum: `"stereo"` | `"L/R"` | `"M/S"`) — maps to internal int
  0/1/2
- `oversample` (bool)

**`edit_mode` deliberately NOT exposed.** It's a UI display selector — probe
verified that writes to `1 Frequency A` with `edit_mode=1` still write to A, and
`1 Frequency B` was untouched. The LLM has no use for a GUI view preference.

**A/B chain meaning depends on `globalMode`** (verified by probe — A/B parameter
values persist across mode changes, and parameter names stay `"A"`/`"B"`):

| `globalMode` | A chain processes | B chain processes              |
| ------------ | ----------------- | ------------------------------ |
| `"stereo"`   | both channels     | (inactive — stored but silent) |
| `"L/R"`      | Left channel      | Right channel                  |
| `"M/S"`      | Mid signal        | Side signal                    |

This mapping is the entire point of exposing `globalMode` — typical M/S
mastering moves (e.g. "boost the Sides at 5 kHz", "cut 200 Hz only on the
Right") are reached by setting `globalMode` and then writing the appropriate
`B`-suffix DeviceParameters. **The skill instructions / tool documentation must
state this A↔L↔M and B↔R↔S mapping**, since the parameter names don't change to
reflect it.

**Implementation gotchas (verified by probe 2026-05-21):**

1. **B-chain parameters are silently inaudible in Stereo mode.** Setting
   B-suffix params (e.g. `1 Frequency B`) in Stereo mode persists the values but
   they don't process audio. Switching `globalMode` to `"L/R"` or `"M/S"`
   activates them. We don't enforce or warn — caller's intent.
2. **Silent rejection on out-of-range writes** to raw `global_mode`. The enum
   mapping should prevent this from reaching the API, but defensive: validate
   before set.
3. **Order matters in batched updates.** Apply `globalMode` before per-band
   params. (Not for correctness — A/B params are independent regardless — but so
   the structural intent reads cleanly when reviewing the resulting state.)
4. **A/B parameter values persist across `globalMode` changes.** Switching from
   Stereo to L/R does not reset anything — the previously-stored A values become
   the Left chain, B values become the Right chain. Same for M/S.

### Hybrid Reverb — `HybridReverbDevice`

Exposes the convolution IR library — categories, files, and IR-shaping controls.
This data can't be expressed as DeviceParameters.

**Cycling LOM docs:**
[hybridreverbdevice](https://docs.cycling74.com/apiref/lom/hybridreverbdevice/).
All extras documented.

**Properties (extras beyond baseline):**

IR library selection:

- `ir_category_index` (int) [RW] — selected category
- `ir_category_list` (StringVector) [RO] — catalog of categories
- `ir_file_index` (int) [RW] — selected IR file within the current category
- `ir_file_list` (StringVector) [RO] — catalog of IR files in the current
  category (doc summary labeled this RW; flagged as likely doc error since it
  serves the same enumeration role as `ir_category_list` — verify at
  implementation time)

IR shaping (time-domain controls applied to the loaded IR):

- `ir_attack_time` (float) [RW]
- `ir_decay_time` (float) [RW]
- `ir_size_factor` (float) [RW]
- `ir_time_shaping_on` (bool) [RW] — master toggle for the shaping section

**Children:** none beyond baseline.

**Functions:** none beyond baseline.

**Note:** Classic `Reverb` is generic `Device` — no specialization. Device-wide
reverb knobs (Predelay, Decay, Size, Damping, Diffusion, Modulation, etc.) are
exposed as 30+ DeviceParameters and are separate from the IR shaping params
below — those apply specifically to the convolution IR.

**Producer Pal interface design (decided 2026-05-21 via probe):**

Six writable fields on `update-device`, also returned by `read-device`:

- `irCategory` (enum string) — one of: `"Early Reflections"`, `"Real Places"`,
  `"Chambers and Large Rooms"`, `"Made for Drums"`, `"Halls"`, `"Plates"`,
  `"Springs"`, `"Bigger Spaces"`, `"Textures"`, `"User"`. Mapped via
  underscore↔space translation against `ir_category_list`.
- `irFile` (string) — must match a file in the currently selected category (e.g.
  `"Berliner Hall LR"`, `"Town Hall Long"`). File names already contain spaces —
  no transformation.
- `irAttackTime` (float, 0..3 seconds) — silent clamping at bounds.
- `irDecayTime` (float, 0.02..20 seconds) — silent clamping at bounds.
- `irSizeFactor` (float, 0.2..5.0) — silent clamping at bounds.
- `irTimeShapingOn` (bool)

Class-level `ir_category_list` and `ir_file_list` are used for validation. See
[`assets` include](#the-assets-include-opt-in-discoverability) — opt-in adds
`irCategoryList` (all 10 stable categories) + `irFileList` (files in the
currently selected category, 11-29 strings depending on category). To browse a
different category, set `irCategory` first and re-read with the include.

**Implementation gotchas (verified by probe 2026-05-21):**

1. **`ir_file_list` is RO and category-dependent.** Setting it is silently
   no-op'd (the doc summary that said RW was misleading). Contents change with
   `ir_category_index` — Halls has 11 files, Early Reflections has 22, etc. Must
   re-read after every category change.

2. **Out-of-range writes:**
   - Category index: silent **clamp to max** (`99` → `9`), not revert.
   - File index: silent **revert** to prior valid value.
   - Float params: silent clamp at min/max (`ir_decay_time = -100` → `0.02`;
     `= 10000` → `20`). No revert.
   - String validation prevents the index issues; floats can be passed through.

3. **Order matters in batched updates.** If both `irCategory` and `irFile` are
   set: apply category first, re-read `ir_file_list`, then resolve and apply
   file. Same pattern as Compressor.

4. **Changing `irCategory` resets `ir_file_index` to 0.** Probe: was at index 15
   in cat 0 (22 files); switched to cat 4 (Halls, 11 files); index reset to 0
   (not clamped to 10). Changing category WILL change the loaded IR file. Read
   back the resulting `irFile` and include in response.

5. **The `"User"` category may be empty.** When no user IRs are imported,
   `ir_file_list` returns `["<empty>"]` (a sentinel single-element array, not a
   true empty array). Treat as "no files available" and warn-and-skip if
   `irFile` is requested.

6. **Underscore ↔ space translation is one-way safe.** All 10 category names use
   underscores as word separators (no literal underscores). Implementation:
   `replace(/_/g, ' ')` for read, `replace(/ /g, '_')` for write lookup.

7. **Time-shaping floats are silently inert when `irTimeShapingOn=false`.**
   Values persist but have no audible effect until shaping is enabled. We don't
   warn — caller's intent.

### Roar — `RoarDevice` (`class_name: Roar`)

**Cycling LOM docs:**
[roardevice](https://docs.cycling74.com/apiref/lom/roardevice/). All extras
documented; semantics verified by probe 2026-05-21.

**Properties (extras beyond baseline):**

- `env_listen` (bool) [RW] — auditions Roar's internal envelope signal at the
  output (sound-design preview toggle).
- `routing_mode_index` (int, 0-6) [RW] — selected processing topology. Out of
  range silently reverts.
- `routing_mode_list` (StringVector) [RO] — stable 7-value catalog:
  `["Single", "Serial", "Parallel", "Multi Band", "Mid Side", "Feedback", "Delay"]`.
  Same on every Roar instance — no per-install or per-set variation.

**Children:** none beyond baseline.

**Functions:** none beyond baseline.

**Producer Pal interface design (decided 2026-05-21 via probe):**

Two writable fields on `update-device`, also returned by `read-device`:

- `routingMode` (enum: `"single"` | `"serial"` | `"parallel"` | `"multi-band"` |
  `"mid-side"` | `"feedback"` | `"delay"`) — maps to internal int 0..6.
- `envListen` (bool) — maps to int 0/1.

**Not surfaced via `include: ["assets"]`.** The routing-mode catalog is stable
per Live version (probe confirmed 7 fixed names). Document the enum values in
the tool description / skill instructions — same pattern as EQ Eight's
`globalMode` and Compressor's channel options. No `assets` participation.

**Implementation gotchas (verified by probe 2026-05-21):**

1. **Silent revert on out-of-range writes.** `routing_mode_index=7` reverts to
   6; `env_listen=2` reverts to 1. The enum mapping should prevent invalid
   values from reaching the API, but defensive: validate before set.
2. **`env_listen` is a sound-design toggle**, not a "set and forget" param.
   Typical LLM workflows won't enable it. Expose for completeness but don't
   emphasize.

### Shifter — `ShifterDevice`

MIDI-driven pitch behavior exposed at class level.

**Cycling LOM docs:** _not documented._ Read/write status below inferred from
convention: scalar config selectors are RW.

**Properties (extras beyond baseline):**

- `pitch_bend_range` (int) [RW]
- `pitch_mode_index` (int) [RW] — note: scan found no companion
  `pitch_mode_list`; the index choices are presumably documented in the device
  UI rather than enumerated via LOM

**Children:** none beyond baseline.

**Functions:** none beyond baseline.

### Spectral Resonator — `SpectralResonatorDevice` (`class_name: Transmute`)

Most class-level enums of any specialized audio effect — mostly MIDI-input and
pitch-mode toggles. Heritage `class_name: Transmute` (sibling of Spectral Time
at `class_name: Spectral`, which is generic Device).

**Cycling LOM docs:**
[spectralresonatordevice](https://docs.cycling74.com/apiref/lom/spectralresonatordevice/).
All extras documented; ranges verified by probe 2026-05-21.

**Properties (extras beyond baseline):**

- `frequency_dial_mode` (int, 0-1) [RW] — UI display selector for the frequency
  dial (likely Hz vs Note); `Freq. Hz` and `Note` exist as separate
  DeviceParameters. Out-of-range silently reverts to prior value.
- `midi_gate` (int, 0-1) [RW] — MIDI gating on/off.
- `mod_mode` (int, 0-3) [RW] — modulation routing mode (4 modes; specific names
  TBD).
- `mono_poly` (int, 0-1) [RW] — `0` = mono, `1` = poly.
- `pitch_bend_range` (int, 0-24) [RW] — semitones.
- `pitch_mode` (int, 0-1) [RW] — pitch source mode (2 modes; names TBD — likely
  MIDI vs Fixed). No companion `_list`.
- `polyphony` (int, 0-3) [RW] — polyphony voice count or mode (4 values;
  semantic of each value TBD).

All out-of-range writes silently revert to last valid value.

**Children:** none beyond baseline.

**Functions:** none beyond baseline.

**Producer Pal interface design (decided 2026-05-21 via probe):**

Six writable fields on `update-device`, also returned by `read-device`:

- `midiGate` (bool) — maps to int 0/1
- `modMode` (enum string, 4 values, names TBD at implementation time after UI
  inspection) — maps to int 0/1/2/3
- `monoPoly` (enum: `"mono"` | `"poly"`) — maps to int 0/1
- `pitchBendRange` (int, 0-24 semitones)
- `pitchMode` (enum string, 2 values, names TBD at implementation time) — maps
  to int 0/1
- `polyphony` (int, 0-3) — semantic of each value (voice count vs mode) TBD at
  implementation time

**`frequency_dial_mode` deliberately NOT exposed.** Probable UI display selector
— `Freq. Hz` and `Note` are both directly addressable DeviceParameters, so the
LLM doesn't need a display preference.

**Implementation gotchas (verified by probe 2026-05-21):**

1. **Silent revert on out-of-range writes** — same pattern as Meld. Set
   `polyphony=4` → reverts to 3; `pitch_bend_range=99` → reverts to 24.
   Pre-validate against documented ranges.
2. **Semantic meaning of enum values needs UI verification.** Probe established
   valid ranges but not the meaning of each int value. Verify against Live's
   Spectral Resonator UI at implementation time:
   - `modMode`: 0/1/2/3 → ?
   - `pitchMode`: 0/1 → ?
   - `polyphony`: 0/1/2/3 → voice count (1/2/4/8?) or named modes?
3. **`pitchBendRange = 0` means no pitch bend** (probably; verify).

## Generic-Device audio effects (no specialization)

Listed alphabetically. None of these have any class-level extras beyond the
baseline. Anything that looks like a device-specific control is exposed as a
`DeviceParameter` (or, in some cases, not at all).

Amp, Auto Filter, Auto Pan-Tremolo, Auto Shift, Beat Repeat, Cabinet, Channel
EQ, Chorus-Ensemble, Corpus, Delay, Drum Buss, Dynamic Tube, Echo, EQ Three,
Erosion, External Audio Effect, Filter Delay, Gate, Glue Compressor, Grain
Delay, Limiter, Multiband Dynamics, Overdrive, Pedal, Phaser-Flanger, Redux,
Resonators, Reverb, Saturator, Spectral Time, Spectrum, Tuner, Utility, Vinyl
Distortion, Vocoder.

**Notable omissions from baseline:**

- **Spectrum** omits `is_using_compare_preset_b` (the only audio effect surveyed
  that drops a baseline property). It is analysis-only, so it has no preset
  state to A/B. `can_compare_ab` is still present (presumably reports `false`).
  Tuner is also analysis-only but **does** retain the property — inconsistent.

---

# Patterns

1. **Specialization correlates with non-parameter state.** What appears on a
   specialized class is invariably something that can't be cleanly represented
   as a `DeviceParameter`:
   - Topology / voice-allocation switches (`filter_routing`, `mono_poly`,
     `poly_voices`, `unison_*`)
   - Library / catalog selectors with backing `StringVector` lists (Hybrid
     Reverb IR files, Wavetable wavetables, Drift mod-matrix sources/targets)
   - Routing dictionaries (Compressor sidechain inputs)
   - Destructive content edits with a `Sample` child (Simpler)

2. **Enum-ness alone does not determine specialization.** Plenty of enum-valued
   DeviceParameters exist (Wavetable's `Flt 1 Type`, `Amp Loop Mode`,
   `LFO 1 Shape`). The distinction is whether the choice _changes the synth's
   topology_ or _re-purposes other parameters_. Things that re-route signal
   flow, change voice allocation, or swap the underlying engine tend to be
   class-level. Things that just feed a knob into a different DSP block tend to
   be DeviceParameters.

3. **Two modulation-matrix idioms coexist.**
   - **Declarative** (Drift): `*_index` properties + read-only `*_list`
     StringVectors describing valid choices. To wire a modulation, set the
     appropriate `_index`.
   - **Imperative** (Wavetable): `add_parameter_to_modulation_matrix(p)`,
     `set_modulation_value(target, source, amount)`,
     `is_parameter_modulatable(p)` — a procedural API.
   - No other instrument exposes modulation routing in the LOM at all.

4. **`class_name` reveals heritage.** Several Ableton instruments are licensed
   from third parties or were renamed over time, and the `class_name` betrays
   the origin: `LoungeLizard` (Electric → Applied Acoustics), `StringStudio`
   (Tension → AAS), `InstrumentVector` (Wavetable), `OriginalSimpler`,
   `MultiSampler`, `UltraAnalog`.

5. **Inconsistency between similar devices.** Compressor exposes sidechain
   routing class-level; Gate / Glue Compressor / Multiband Dynamics don't.
   Hybrid Reverb exposes IR library class-level; classic Reverb is generic.
   Spectrum drops `is_using_compare_preset_b`; Tuner doesn't. This suggests
   specialization is added device-by-device on an as-needed basis rather than
   systematically.

---

# Reproducing the scan

To recreate the test bed in a clean Live Set:

```
t1..t15     15 MIDI tracks, one per instrument; create instrument at d0 on each
t16         1 audio track "AudioFX"; create all 42 audio effects in series on it
```

`scripts/ppal-client.ts` drives `ppal-create-device` and
`ppal-live-api { info }`. To inspect any device:

```bash
node scripts/ppal-client.ts tools/call ppal-live-api '{
  "path": "live_set tracks 15 devices 0",
  "operations": [{"type": "info"}, {"type": "get", "property": "class_name"}]
}'
```

---

# Candidates for Producer Pal exposure (for follow-up)

Loose ranking by "how much value would this unlock that's currently invisible to
the LLM and not reachable via DeviceParameters?" — starting point for Linear
ticket planning, not a final recommendation.

**High value:**

- **Simpler** — `sample` child + `replace_sample`, `crop`, `reverse`, warp
  helpers; `playback_mode`, `multi_sample_mode`, `pad_slicing`. Producer Pal
  currently only does the `sample=` load shortcut; this would unlock destructive
  sample editing.
- **Hybrid Reverb** — IR file/category selection via `ir_category_index` /
  `ir_file_index` against the `_list` StringVectors. Today the IR choice is
  completely opaque to the LLM.
- **Wavetable** — wavetable selection (`oscillator_N_wavetable_category` /
  `_index` with backing `_wavetables` / `_categories` lists); engine mode
  (`oscillator_N_effect_mode`); voice config (`mono_poly`, `poly_voices`,
  `unison_mode`, `unison_voice_count`); `filter_routing`.
- **Drift** — mod-matrix routing (the bulk of Drift's character). Plus
  `voice_mode_index`, `voice_count_index`, `pitch_bend_range`.

**Medium value:**

- **Compressor** sidechain routing (`input_routing_type`,
  `input_routing_channel`, plus the `available_*` lists). Sidechain is a common
  production move.
- **EQ Eight** — `global_mode` (Stereo / L/R / M/S) and `oversample`. Promoted
  from "lower value" after probe revealed `edit_mode` is UI-only and per-band
  A/B parameters are independently addressable. M/S processing is a common
  mastering move.
- **Meld** — `mono_poly`, `poly_voices`, `unison_voices`. Promoted after probe
  revealed `selected_engine` is UI-only.
- **Spectral Resonator** — 6 mode/voice toggles (midi_gate, mod_mode, mono_poly,
  pitch_bend_range, pitch_mode, polyphony). Promoted after deciding to skip the
  UI-only `frequency_dial_mode`.
- **Roar** — `env_listen`, `routing_mode_index` (with `_list` for
  discoverability).

**Lower value:**

- **Shifter** — small surface (pitch_bend_range, pitch_mode_index), no companion
  `_list` for `pitch_mode_index`. Defer unless explicit demand.
