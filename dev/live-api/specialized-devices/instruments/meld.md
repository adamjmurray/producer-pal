# Meld — `MeldDevice` (`class_name: InstrumentMeld`)

Part of [Instruments](README.md).

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
