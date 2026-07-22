# Specialized Device Classes in the Ableton Live LOM

Reference for Producer Pal's specialized-device support: which native Live 12.4
instruments and audio effects expose a specialized LOM class (properties /
children / functions beyond the generic `Device` baseline), and how Producer Pal
maps each one to pseudo-params, actions, and `options` catalogs.

**Status:** 9 of the 10 specialized devices surveyed below are implemented
(`src/tools/shared/device/specialized/`) and e2e-validated against Live 12.4;
only **Shifter** is deferred (small surface, no demand yet). This started as a
survey and design plan — it is now the as-built reference. Device behavior
documented here is authoritative; "what changed when" lives in git history, not
this doc.

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

## Verification discipline (probe against a running Live)

Enum orders, value catalogs, and ranges are only trustworthy if they were probed
against a running device. Live **silently reverts** invalid writes — it returns
success and keeps the prior value — so a wrong index or range produces no error
to catch after the fact. The discipline that prevents shipping a wrong mapping:

- **Prefer a LOM `_list` / `_categories` source of truth.** Roar
  (`routing_mode_list`), Drift (`*_list`), and Hybrid Reverb (`ir_*_list`)
  expose their catalogs; read the list and cross-check the hardcoded labels
  against it rather than trusting the order from memory.
- **No `_list`? Hardcode from the UI, then probe the cardinality.** Wavetable,
  EQ Eight, and Spectral Resonator have no list property. Walk the index upward
  until a write reverts; the count must match the hardcoded array length. The
  labels still come from the UI, but the size is verified.
- **Index-vs-count trap.** A property named like a count can actually be an
  _index_ into a value catalog. The tell: if index `0` is a valid sticking
  value, it's an index (zero voices is nonsense). Map index↔value like Drift's
  `voice_count_index`, not as a raw number. _(This was the Wavetable
  `polyVoices` bug: it exposed the raw index `0-7`, so "set polyVoices 5"
  produced 7 voices. Spectral Resonator's `polyphony` is the same shape, done
  right.)_
- **Probe the full contiguous range — don't skip.** Walking `0,1,2,3,8,16` and
  seeing 8 revert looks like "max is 3", but it's really "max index is 7 and 8
  reverted to the last valid value." Step one at a time through the plausible
  range. _(The polyVoices range was first misread as 0-3 this exact way.)_
- **Validate before the write, not after.** Use `writeIntInRange` (contiguous
  range), `writeIntFromSet` (discrete set; `asIndex` when the property is an
  index), or `writeEnumByIndex` (string enums). Out-of-range input then warns
  and skips instead of silently no-op'ing.

When you change any of these mappings, re-probe — never edit the catalog or
range from memory.

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

## Wire format

All specialized-device pseudo-params flow through existing tool surfaces. Across
all this work the new surfaces are limited to: **one new top-level write arg**
(`actions` on `update-device`), **two new include values** (`"options"` and
`"actions"` on `read-device`), and **one new top-level read output field**
(`modulations` on `read-device`, for Wavetable's mod matrix only):

| Surface                                                                                         | Where it goes                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Writable pseudo-params (e.g. `globalMode`, `voices`, `irCategory`, `sample`, `mod1Source`)      | Inside `update-device`'s existing `params` arg as `name=value` lines                                                                                                                                                 |
| Read-only pseudo-params (e.g. `multiSampleMode`, `estimatedPlaybackLength`)                     | Inside `read-device`'s existing `params` output field                                                                                                                                                                |
| Actions (e.g. `reverse`, `warpAs(4.0)`, `setModulation(...)`)                                   | **New top-level `actions: string[]` arg** on `update-device`                                                                                                                                                         |
| Action discovery (what actions a device supports)                                               | New value `"actions"` for `read-device`'s existing `include` arg (`{name, signature, description}` per action)                                                                                                       |
| Dynamic per-state/per-install catalogs (e.g. `irFileList`, `sidechainSourceTrackIds`)           | New value `"options"` for `read-device`'s existing `include` arg                                                                                                                                                     |
| Structured non-param state (Wavetable's mod-matrix cells — inherently 2D, name-collision-prone) | **New top-level `modulations` output field** on `read-device` (Wavetable only; opt-in via `include: ["options"]`, alongside the dynamic catalogs, since the mod-matrix scan is expensive; omitted for other devices) |

This keeps the tool schema flat — no per-device arg explosion — and gives the
LLM one consistent surface for setting both DeviceParameters and class-level
pseudo-params.

### Actions syntax

Function-call form: bare name for no-args, or `name(arg1, arg2, ...)` for args.
String args should be quoted where needed.

```
actions: [
  "reverse",
  "warpAs(4.0)",
  "setModulation('Osc 1 Pos', 'Env 2', 0.5)",
  "clearModulation('Osc 1 Pos', 'LFO 1')",
  "addModulationTarget('Filter 1 Freq')"
]
```

Parser scope: bare names; positional args; literal types are int, float, and
quoted strings (single or double quotes — pick one and stick with it; commas
inside quotes are respected; no nested function calls; no implicit type coercion
beyond standard JS literal parsing).

**Action discovery (`include: ["actions"]`).** The actions a device supports are
discoverable at runtime via `ppal-read-device include: ["actions"]`, which
returns `{ name, signature, description }` for each action on the resolved
device's class (empty/omitted for the 7 action-less specialized classes and all
generic devices). The metadata is co-located with each handler in its
`SpecializedDeviceSpec`
(`actions: Record<string, { handler, signature, description }>`), so the docs
can't drift from the implementation. This lets the skills prompt point at the
include rather than enumerate every action signature, recovering context-window
budget. Kept in small-model mode — it's discovery, and only fires when
explicitly requested.

### Structured read output beyond `params`

When state is inherently multi-dimensional or would suffer name collisions in a
flat `params` map, surface it as a separate top-level output field on
`read-device`. Currently only Wavetable's mod matrix uses this pattern:

- **`modulations`** (Wavetable) — array of `{ target, source, amount }` objects.
  The target is a parameter name (matches the matrix's internal keying), the
  source is a canonical source name. Always on for Wavetable; omitted or empty
  `[]` for other devices.

Reserved for cases where (a) the data is genuinely structured and (b) flattening
would either invent ugly composite keys (`mod[Osc 1 Pos][Env 2]`) or collide
with regular DeviceParameter names. Don't reach for this when `params` already
handles the shape.

### Mode-gated inactive params (`inactiveWhen`)

`read-device` reports each param's `state` straight from Live's
`DeviceParameter.state` (active / inactive / disabled), which already greys out
section params like an off oscillator. But Live is _inconsistent_: when an LFO
exposes both a free-running Hz `Rate` and a tempo-synced note-value `S. Rate`,
it leaves **both** active regardless of the sync mode, so the LLM can't tell
which one is in effect. (Real failure mode: an AI reported a synced LFO's stale
`6.0 Hz` Rate and couldn't find the synced rate.)

A spec can declare `inactiveWhen` rules to fix this: each rule names a
_controller_ param and, per controller value, the sibling params that don't
apply in that mode. After the params are read, `applySpecializedInactiveStates`
(in `specialized-device-registry.ts`) sets `state: "inactive"` on them — reusing
the values already read (no extra Live API calls), only when reading param
values, and never overriding a state Live already set. A controller filtered out
by a param search just skips its rule. Use the
`exclusiveModes(controller, activeByValue)` builder (in
`specialized-device-inactive.ts`) for the common "one mode keeps one param
active, the rest inactive" shape. Several controller values may map to the same
active param (the builder dedupes the group) — e.g. Auto Filter's
Synced/Triplet/Dotted modes all drive the one note-value selector.

Current rules:

- **Wavetable** LFO 1 / LFO 2 — `Sync` → Free=Hz `Rate` / Tempo=`S. Rate`.
- **Drift** LFO / Cyclic Envelope — `Time Mode` Freq / Time / Ratio / Sync (four
  rate params, one active per mode).
- **Auto Filter** — `LFO T Mode`: Rate=Hz `LFO Freq`, Time=ms `LFO Time`,
  Synced/Triplet/Dotted=note-value `LFO Rate`, Sixteenth=count-of-16ths
  `LFO 16th`.
- **Auto Pan-Tremolo** — `Time Mode`: same shape as Auto Filter (`Frequency` /
  `Time` / `Rate` / `16th`; the synced-count mode is labelled `16th`, not
  `Sixteenth`).
- **Phaser-Flanger** — two independent boolean sections: `Mod Sync` (Off=Hz
  `Mod Freq` / On=note-value `Mod Rate`) and `Mod Sync 2` (`Mod Freq 2` /
  `Mod Rate 2`).

For the audio FX above, the synced `*Rate` param is a quantized note-value
selector (raw `0`–`21`, `str_for_value` → `"1/4"` etc.) — its `value`/min/max
read oddly out of context, which is exactly why surfacing `state: "inactive"` in
the wrong modes matters.

Only patch devices Live leaves unmarked — verify against a running Live first
(e.g. **Echo** already greys out its own delay/mod sync params, so it needs no
rule).

## The `options` include (opt-in discoverability)

`read-device` supports an opt-in `include: ["options"]` parameter that surfaces
per-device "what choices are available" data. It returns two kinds of catalog:

1. **`paramOptions`** — the valid values for each _writable_ pseudo-param, keyed
   by param name. An array lists discrete choices (enum labels or a fixed
   numeric set); a string states a constraint (e.g. `"0-12"`). This is the
   canonical, machine-readable source of accepted values, so the LLM can
   discover them without first attempting a failed write. It is built
   automatically from each `PseudoParam`'s `options` field (declared with the
   _same constant_ passed to `read`/`write`, so the catalog can't drift from
   validation — see `collectParamOptions` in `specialized-device-registry.ts`).
   Booleans, free-form values (sample paths, gains, IR shaping times), read-only
   params, and dynamic-choice params (those in the catalogs below) are omitted.
2. **Dynamic catalogs** — choices that vary per Live Set, per Live install, or
   per current device state. These come from each spec's `readOptions`.

**Default OFF.** Without the include, `read-device` returns only current state,
keeping reads compact. The LLM opts in when it needs to know what a param
accepts, or when actively choosing from a runtime catalog (an IR file, a
wavetable from the loaded category, a valid sidechain source track).

**Per-device dynamic catalogs** (these are _in addition to_ `paramOptions`; only
the devices listed contribute dynamic catalogs — every specialized device with
writable enum/range params contributes `paramOptions`):

- **Compressor:** `sidechainSourceTrackIds` — trackIds that are valid sidechain
  sources for the current Live Set (excludes tracks with no audio-bearing
  devices). Dynamic per set. (`sidechainChannels` for the current source.)
- **Hybrid Reverb:** `irCategoryList`, `irFileList` — IR categories and the
  files in the currently-selected category. Dynamic per Live install and per
  category.
- **Wavetable:** `osc1Wavetables`, `osc2Wavetables` — wavetables in each
  oscillator's currently-selected category (dynamic per category × per Live
  install); `modulatableParameters` — long list (~30 DeviceParameter names where
  `is_parameter_modulatable=1`); `modulationSources` — the hard-coded canonical
  13 mod-matrix source names (for the `setModulation` action; no LOM property
  exposes them).

**Stable enums ARE surfaced — via `paramOptions`.** Previously stable enums
lived only in Zod descriptions and skill text and were deliberately kept out of
`options`. That is no longer the case: every writable pseudo-param with a fixed
value space (Drift's source/target slots, `voiceMode`, `voiceCount`; EQ Eight
`globalMode`; Roar `routingMode`; Spectral Resonator `modMode`/`pitchMode`/
`polyphony`; Wavetable `filterRouting`/`unisonMode`/…) reports its accepted
values under `paramOptions`. The skill now points to `options` for accepted
values and carries only names + non-obvious semantics, keeping a few short
high-frequency hints inline (`voiceMode`, `playbackMode`, `globalMode`) to avoid
a round-trip on common operations.

**Why opt-in:** Most reads inspect current state, not catalogs. The dynamic ones
(especially `modulatableParameters` and per-category wavetable lists) can be
20-30 entries each — multiplying across every device on every read would bloat
the happy path. Opt-in keeps the default read compact and establishes a clear
browse pattern: "to see what's available right now, ask."

**Response shape:** when requested, catalog data comes back in a separate
`options` field — not mixed into `params`. Catalogs aren't param values; they're
metadata about valid choices:

```json
{
  "id": "227",
  "type": "instrument: Wavetable",
  "options": {
    "paramOptions": {
      "filterRouting": ["serial", "parallel", "split"],
      "unisonVoiceCount": "2-8"
    },
    "oscWavetableCategories": [...],
    "modulationSources": [...]
  }
}
```

## Documentation strategy

Each kind of "what to tell the LLM" lives in a specific layer:

| Information                                                                                                                                                       | Where it lives                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Valid values for a writable pseudo-param (enum labels, numeric sets, ranges)                                                                                      | `options.paramOptions`, built from each `PseudoParam.options` (the same constant passed to read/write, so it can't drift)                                     |
| What an enum value _means_ / when to reach for it (M/S processing, sidechain use cases, A/B chain mapping)                                                        | Producer Pal Skills via `ppal-connect`; a few short, high-frequency value hints (`voiceMode`, `playbackMode`, `globalMode`) stay inline to avoid a round-trip |
| Dynamic catalogs that vary per Live install / per set / per device state (IR files, current-category wavetables, valid sidechain sources, modulatable parameters) | `options` include dynamic catalogs (see above)                                                                                                                |

### Small model mode

The codebase has first-class support for trimming tool surface in small model
mode via `smallModelModeConfig` (`excludeParams`, `descriptionOverrides`,
`toolDescription` — see AGENTS.md). Guidelines for specialized-device params:

- **Write tight base descriptions** that work in both normal and small-model
  modes without needing overrides. Aim for ~100-200 chars per parameter.
- **Use `descriptionOverrides`** only when the base description genuinely
  exceeds what's useful for a small model (e.g. many enum values with rich
  semantics).
- **Generally avoid `excludeParams`** for specialized fields — keep the
  capability available; the LLM just gets less inline guidance. The Zod enum
  constraint still prevents invalid values at the schema level.
- **Rich semantic guidance belongs in Producer Pal Skills**, which is already
  trimmed in small model mode — safer than bloating Zod descriptions.

Each device ticket's notes include a reminder to check `smallModelModeConfig`
when implementing.

---

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

Two scripts automate building the test bed and surveying it. Both talk to a
running Producer Pal (`npm run build:debug` recommended so the Direct Live API
tool is always available).

**1. Build the test bed** — `scripts/scan-live-api/setup-all-devices.ts` creates
a clean device set: every built-in instrument on its own MIDI track, all MIDI
effects on track 0 (before its instrument), and all audio effects distributed
across the instrument tracks.

```bash
node scripts/scan-live-api/setup-all-devices.ts
```

**2. Survey it** — `scripts/scan-live-api/scan-all-devices.ts` iterates every
device on every track, groups by `(type, class_name)`, and writes a report
(default `dev/per-device-scan.txt`) listing the unique device shapes — the
specialized classes are the ones that aren't plain `Device`.

```bash
node scripts/scan-live-api/scan-all-devices.ts
```

(For core LOM object types rather than devices — Song, Track, Scene, Clip, etc.
— use the sibling `scan-live-api.ts`.)

**Ad-hoc single-device inspection** — `scripts/ppal-client.ts` drives any tool
directly. To inspect one device:

```bash
node scripts/ppal-client.ts tools/call ppal-live-api '{
  "path": "live_set tracks 15 devices 0",
  "operations": [{"type": "info"}, {"type": "get", "property": "class_name"}]
}'
```

---

# Implementation status

All specialized devices surveyed above are implemented in
`src/tools/shared/device/specialized/` (one file per device under `devices/`,
registered in `specialized-device-registry.ts`) and e2e-validated against Live
12.4 — **except Shifter**. The original value-ranked backlog that lived here (a
guide for what to build first) has been retired now that the work is done.

What each device exposes:

- **Drift** — mod-matrix source/target string enums (amounts stay
  DeviceParameters), `voiceMode`, `voiceCount`, `pitchBendRange`.
- **Meld** — `monoPoly`, `polyVoices`, `unisonVoices`.
- **Simpler** — `playbackMode`, `slicingPlaybackMode`, `retrigger`, `voices`,
  `sample` load; `reverse` / `crop` / `warpDouble` / `warpHalf` / `warpAs(N)`
  actions; read-only `multiSampleMode`, `estimatedPlaybackLength`.
- **Wavetable** — `filterRouting`, `monoPoly`, `polyVoices`, `unisonMode`,
  `unisonVoiceCount`, osc engines + wavetable selectors; mod matrix via
  `setModulation` / `clearModulation` / `addModulationTarget` actions and the
  `modulations` output.
- **Compressor** — sidechain source + channel.
- **EQ Eight** — `globalMode`, `oversample`.
- **Hybrid Reverb** — IR category/file selection + IR shaping params.
- **Roar** — `routingMode`, `envListen`.
- **Spectral Resonator** — `midiGate`, `monoPoly`, `pitchBendRange`, `modMode`,
  `pitchMode`, `polyphony`.

**Not implemented — Shifter.** Small surface (`pitch_bend_range`,
`pitch_mode_index`) with no companion `_list` for `pitch_mode_index`. Deferred
unless there's explicit demand.
