# Specialized Device Classes in the Ableton Live LOM

Reference for Producer Pal's specialized-device support: which native Live 12.4
instruments and audio effects expose a specialized LOM class (properties /
children / functions beyond the generic `Device` baseline), and how Producer Pal
maps each one to pseudo-params, actions, and `options` catalogs.

**Status:** 9 of the 10 specialized devices catalogued here are implemented
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

## Where the details live

| Doc                                                                      | Contents                                                                                                                    |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| [interface-conventions.md](specialized-devices/interface-conventions.md) | Wire format, the `options` include, documentation strategy — cross-cutting decisions the per-device sections assume         |
| [instruments.md](specialized-devices/instruments.md)                     | Per-device catalog: Drift, Meld, Simpler, Wavetable, plus the generic-Device instruments                                    |
| [audio-effects.md](specialized-devices/audio-effects.md)                 | Per-device catalog: Compressor, EQ Eight, Hybrid Reverb, Roar, Shifter, Spectral Resonator, plus the generic-Device effects |

Read only the one you need — each catalog is long.

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

**1. Build the test bed** —
`scripts/live-api/scan-live-api/setup-all-devices.ts` creates a clean device
set: every built-in instrument on its own MIDI track, all MIDI effects on track
0 (before its instrument), and all audio effects distributed across the
instrument tracks.

```bash
node scripts/live-api/scan-live-api/setup-all-devices.ts
```

**2. Survey it** — `scripts/live-api/scan-live-api/scan-all-devices.ts` iterates
every device on every track, groups by `(type, class_name)`, and writes a report
(default `dev/per-device-scan.txt`) listing the unique device shapes — the
specialized classes are the ones that aren't plain `Device`.

```bash
node scripts/live-api/scan-live-api/scan-all-devices.ts
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

All specialized devices catalogued in
[instruments.md](specialized-devices/instruments.md) and
[audio-effects.md](specialized-devices/audio-effects.md) are implemented in
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
