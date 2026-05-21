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
documented.

**Properties (extras beyond baseline):**

- `mono_poly` (int) [RW] — polyphony mode selector
- `poly_voices` (int) [RW] — polyphony voice count
- `selected_engine` (bool) [RW] — A/B dual-engine selector (scan returned
  `bool`; doc lists it as `int` — likely doc shorthand for the same underlying
  boolean toggle)
- `unison_voices` (int) [RW] — unison voice count

**Children:** none beyond baseline.

**Functions:** none beyond baseline.

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

### EQ Eight — `Eq8Device`

**Cycling LOM docs:** _not documented._ Read/write status below inferred from
convention: simple scalar toggles are RW.

**Properties (extras beyond baseline):**

- `edit_mode` (bool) [RW] — single-band vs full-curve edit view
- `global_mode` (int) [RW] — Stereo / L / R / M / S processing mode
- `oversample` (bool) [RW]

**Children:** none beyond baseline.

**Functions:** none beyond baseline.

**Note:** Per-band gain/freq/Q/type remain as DeviceParameters. Only the global
toggles (edit mode, stereo/L/R/M/S mode, oversampling) are class-level.

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

**Note:** Classic `Reverb` is generic `Device` — no specialization.

### Roar — `RoarDevice`

**Cycling LOM docs:**
[roardevice](https://docs.cycling74.com/apiref/lom/roardevice/). All extras
documented.

**Properties (extras beyond baseline):**

- `env_listen` (bool) [RW] — envelope listen toggle (monitors sidechain input)
- `routing_mode_index` (int) [RW] — selected multiband / serial / parallel
  routing
- `routing_mode_list` (StringVector) [RO]

**Children:** none beyond baseline.

**Functions:** none beyond baseline.

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

### Spectral Resonator — `SpectralResonatorDevice`

Most class-level enums of any specialized audio effect — mostly MIDI-input and
pitch-mode toggles.

**Cycling LOM docs:**
[spectralresonatordevice](https://docs.cycling74.com/apiref/lom/spectralresonatordevice/).
All extras documented.

**Properties (extras beyond baseline):**

- `frequency_dial_mode` (int) [RW]
- `midi_gate` (int) [RW] — MIDI gating behavior
- `mod_mode` (int) [RW]
- `mono_poly` (int) [RW]
- `pitch_bend_range` (int) [RW]
- `pitch_mode` (int) [RW] — note: no companion `_index`/`_list` pair — bare
  `pitch_mode` int (contrast with Shifter's `pitch_mode_index`)
- `polyphony` (int) [RW]

**Children:** none beyond baseline.

**Functions:** none beyond baseline.

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
- **Meld** — `mono_poly`, `poly_voices`, `unison_voices`, `selected_engine`.

**Lower value:**

- **EQ Eight** — `edit_mode`, `global_mode`, `oversample`. Probably fine to
  leave alone unless we need M/S processing flows.
- **Spectral Resonator** / **Shifter** / **Roar** — small surfaces, mostly MIDI
  / mode toggles that aren't expressible as parameters but also aren't a typical
  creative bottleneck.
