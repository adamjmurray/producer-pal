# Drift — `DriftDevice` (`class_name: Drift`)

Part of [Instruments](README.md).

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
