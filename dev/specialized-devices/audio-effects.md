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

**Producer Pal interface** (as built; design probed 2026-05-21):

Two writable fields on `update-device`, also returned by `read-device`:

- `sidechainSourceTrackId` (trackId or null) — `null` means "No Input"
- `sidechainChannel` (`"Pre FX"` | `"Post FX"` | `"Post Mixer"` or null)

The class-level `available_input_routing_types` and
`available_input_routing_channels` are used internally for validation. See
[`options` include](#the-options-include-opt-in-discoverability) — opt-in adds
`sidechainSourceTrackIds` (list of trackIds that are valid sources — regular,
return, and master tracks with audio-bearing devices). Channel options
(`"Pre FX"` / `"Post FX"` / `"Post Mixer"`) are stable per Live version and
documented in the tool description rather than surfaced.

**Implementation gotchas (verified by probe 2026-05-21):**

1. **Live silently swallows invalid sets.** Bad identifiers, unknown
   `display_name`s, and excluded-track identifiers all return `success` but the
   value doesn't actually change. **Pre-validation is required** — there is no
   error signal to react to after the fact.

2. **Routing identifiers are NOT Live object IDs.** They're a separate
   Live-internal namespace. In our test set, Drift's trackId is `"136"` but its
   routing identifier is `3`; AudioFX's trackId is `"149"` but its routing
   identifier is `16`. Translate by matching the track's `name` against the
   `display_name` of entries in `available_input_routing_types`. The name search
   spans regular tracks, return tracks, and the master track, so return/master
   sources resolve to a track id on read; regular tracks are searched first, so
   a shared name resolves to the regular track. Hardware sources (`"Ext. In"`)
   and duplicate track names remain inherently ambiguous — the former has no
   track id; the latter resolves to the first match.

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

**Producer Pal interface** (as built; design probed 2026-05-21):

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

**Producer Pal interface** (as built; design probed 2026-05-21):

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
[`options` include](#the-options-include-opt-in-discoverability) — opt-in adds
`irCategoryList` (the fixed categories) and `irFileList` (files in the currently
selected category, 11-29 strings depending on category — dynamic per Live
install). To browse a different category, set `irCategory` first and re-read
with the include. Hybrid Reverb's writable params are all dynamic-catalog,
free-form, or boolean, so it contributes no static `paramOptions`.

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

**Producer Pal interface** (as built; design probed 2026-05-21):

Two writable fields on `update-device`, also returned by `read-device`:

- `routingMode` (enum: `"single"` | `"serial"` | `"parallel"` | `"multi-band"` |
  `"mid-side"` | `"feedback"` | `"delay"`) — maps to internal int 0..6.
- `envListen` (bool) — maps to int 0/1.

**Valid values via `options.paramOptions`.** `routingMode` declares its 7 fixed
labels through its `options` field, so `read-device include: ["options"]`
reports them under `paramOptions` (same pattern as EQ Eight's `globalMode`).
`envListen` is a boolean and contributes no `paramOptions` entry. The skill
lists only the param names.

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
- `mod_mode` (int, 0-3) [RW] — modulation routing mode:
  `None / Chorus / Wander / Granular`.
- `mono_poly` (int, 0-1) [RW] — `0` = mono, `1` = poly.
- `pitch_bend_range` (int, 0-24) [RW] — semitones.
- `pitch_mode` (int, 0-1) [RW] — the Freq dial's `Hertz / MIDI Note` selector.
  No companion `_list`.
- `polyphony` (int, 0-3) [RW] — **index** into voice counts `[2, 4, 8, 16]` (not
  the raw count).

All out-of-range writes silently revert to last valid value.

**Children:** none beyond baseline.

**Functions:** none beyond baseline.

**Producer Pal interface** (as built; design probed 2026-05-21):

Six writable fields on `update-device`, also returned by `read-device`:

- `midiGate` (bool) — maps to int 0/1
- `modMode` (enum: `"None"` | `"Chorus"` | `"Wander"` | `"Granular"`) — maps to
  int 0/1/2/3 (`spectral-resonator.ts` `MOD_MODES`)
- `monoPoly` (enum: `"mono"` | `"poly"`) — maps to int 0/1
- `pitchBendRange` (int, 0-24 semitones)
- `pitchMode` (enum: `"Hertz"` | `"MIDI Note"`) — maps to int 0/1 (the Freq
  dial's Hz/Note selector)
- `polyphony` (int) — actual voice count `2/4/8/16`; the `polyphony` property is
  an **index** into that set, mapped like Wavetable's `polyVoices`

**`frequency_dial_mode` deliberately NOT exposed.** Probable UI display selector
— `Freq. Hz` and `Note` are both directly addressable DeviceParameters, so the
LLM doesn't need a display preference.

**Implementation gotchas (verified by probe 2026-05-21):**

1. **Silent revert on out-of-range writes** — same pattern as Meld. Set
   `polyphony=4` → reverts to 3; `pitch_bend_range=99` → reverts to 24.
   Pre-validate against documented ranges.
2. **Enum values resolved against the Spectral Resonator UI (2026-05-22):**
   - `modMode`: `None / Chorus / Wander / Granular`
   - `pitchMode`: `Hertz / MIDI Note`
   - `polyphony`: index `0..3` → voice count `2 / 4 / 8 / 16`
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
