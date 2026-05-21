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
at https://docs.cycling74.com/apiref/lom/ describe most but not all of these —
several classes below (e.g., `DriftDevice`, `MeldDevice`, `RoarDevice`,
`ShifterDevice`, `SpectralResonatorDevice`, `Eq8Device`, `CompressorDevice`) are
undocumented or partially documented in the public M4L API reference at the time
of writing.

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

Compact synth, all specialization is around its modulation matrix. Routing is
exposed declaratively as index/list property pairs (no functions).

- **Extra properties:**
  - `mod_matrix_filter_source_1_index` (int) + `mod_matrix_filter_source_1_list`
    (StringVector)
  - `mod_matrix_filter_source_2_index` (int) + `mod_matrix_filter_source_2_list`
    (StringVector)
  - `mod_matrix_lfo_source_index` (int) + `mod_matrix_lfo_source_list`
    (StringVector)
  - `mod_matrix_pitch_source_1_index` (int) + `mod_matrix_pitch_source_1_list`
    (StringVector)
  - `mod_matrix_pitch_source_2_index` (int) + `mod_matrix_pitch_source_2_list`
    (StringVector)
  - `mod_matrix_shape_source_index` (int) + `mod_matrix_shape_source_list`
    (StringVector)
  - `mod_matrix_source_1_index` (int) + `mod_matrix_source_1_list`
    (StringVector)
  - `mod_matrix_source_2_index` (int) + `mod_matrix_source_2_list`
    (StringVector)
  - `mod_matrix_source_3_index` (int) + `mod_matrix_source_3_list`
    (StringVector)
  - `mod_matrix_target_1_index` (int) + `mod_matrix_target_1_list`
    (StringVector)
  - `mod_matrix_target_2_index` (int) + `mod_matrix_target_2_list`
    (StringVector)
  - `mod_matrix_target_3_index` (int) + `mod_matrix_target_3_list`
    (StringVector)
  - `pitch_bend_range` (int)
  - `voice_count_index` (int) + `voice_count_list` (StringVector)
  - `voice_mode_index` (int) + `voice_mode_list` (StringVector)

### Meld — `MeldDevice` (`class_name: InstrumentMeld`)

- **Extra properties:** `mono_poly` (int), `poly_voices` (int),
  `selected_engine` (bool), `unison_voices` (int)
- **Note:** `selected_engine` as `bool` matches Meld's A/B dual-engine UI.

### Simpler — `SimplerDevice` (`class_name: OriginalSimpler`)

The richest single-device API among the in-scope natives. Exposes a `Sample`
child and destructive sample-edit functions. **Producer Pal today only supports
loading a sample via the `sample=` params shortcut (equivalent to
`replace_sample`).** Nothing else in this surface is currently wired up.

- **Extra children:** `sample` (Sample)
- **Extra properties:** `can_warp_as` (bool), `can_warp_double` (bool),
  `can_warp_half` (bool), `multi_sample_mode` (bool), `pad_slicing` (bool),
  `playback_mode` (int), `playing_position` (float), `playing_position_enabled`
  (bool), `retrigger` (bool), `slicing_playback_mode` (int), `voices` (int)
- **Extra functions:** `crop`, `guess_playback_length`, `replace_sample`,
  `reverse`, `warp_as`, `warp_double`, `warp_half`
- **Note:** `multi_sample_mode` / `pad_slicing` suggest Simpler can morph into
  Sampler/slicing modes. Notably, **Sampler** has none of this.

### Wavetable — `WavetableDevice` (`class_name: InstrumentVector`)

Two oscillator engines with wavetable selectors and an imperative mod-matrix API
(contrast with Drift's declarative index/list approach).

- **Extra properties:** `filter_routing` (int), `mono_poly` (int),
  `oscillator_1_effect_mode` (int), `oscillator_1_wavetable_category` (int),
  `oscillator_1_wavetable_index` (int), `oscillator_1_wavetables`
  (StringVector), `oscillator_2_effect_mode` (int),
  `oscillator_2_wavetable_category` (int), `oscillator_2_wavetable_index` (int),
  `oscillator_2_wavetables` (StringVector), `oscillator_wavetable_categories`
  (StringVector), `poly_voices` (int), `unison_mode` (int), `unison_voice_count`
  (int), `visible_modulation_target_names` (StringVector)
- **Extra functions:** `add_parameter_to_modulation_matrix`,
  `get_modulation_target_parameter_name`, `get_modulation_value`,
  `is_parameter_modulatable`, `set_modulation_value`

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

- **Extra properties:** `available_input_routing_channels` (dict),
  `available_input_routing_types` (dict), `input_routing_channel` (dict),
  `input_routing_type` (dict)
- **Note:** Gate, Glue Compressor, Multiband Dynamics, Auto Filter all support
  sidechain in the UI but expose nothing class-level.

### EQ Eight — `Eq8Device`

- **Extra properties:** `edit_mode` (bool), `global_mode` (int), `oversample`
  (bool)
- **Note:** Per-band gain/freq/Q/type remain as DeviceParameters. Only the
  global toggles (edit mode, stereo/L/R/M/S mode, oversampling) are class-level.

### Hybrid Reverb — `HybridReverbDevice`

Exposes the convolution IR library — categories, files, and IR-shaping controls.
This data can't be expressed as DeviceParameters.

- **Extra properties:** `ir_attack_time` (float), `ir_category_index` (int),
  `ir_category_list` (StringVector), `ir_decay_time` (float), `ir_file_index`
  (int), `ir_file_list` (StringVector), `ir_size_factor` (float),
  `ir_time_shaping_on` (bool)
- **Note:** Classic `Reverb` is generic `Device` — no specialization.

### Roar — `RoarDevice`

- **Extra properties:** `env_listen` (bool), `routing_mode_index` (int),
  `routing_mode_list` (StringVector)

### Shifter — `ShifterDevice`

MIDI-driven pitch behavior exposed at class level.

- **Extra properties:** `pitch_bend_range` (int), `pitch_mode_index` (int)

### Spectral Resonator — `SpectralResonatorDevice`

Most class-level enums of any specialized audio effect — mostly MIDI-input and
pitch-mode toggles.

- **Extra properties:** `frequency_dial_mode` (int), `midi_gate` (int),
  `mod_mode` (int), `mono_poly` (int), `pitch_bend_range` (int), `pitch_mode`
  (int), `polyphony` (int)

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
