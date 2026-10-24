# Simpler — `SimplerDevice` (`class_name: OriginalSimpler`)

Part of [Instruments](README.md).

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
  mapping as track/clip gain (`gain-conversion`). Reads/writes only when a
  single sample is loaded (refused with a reason otherwise). A normal
  pseudo-param: appears in `include: ["params"]`, **not** in the focused
  `include: ["sample"]` view. Multi-sample state is conveyed by the read-only
  `multiSampleMode` param.
- `playbackMode` (enum: `"classic"` | `"one-shot"` | `"slicing"`) — maps to int
  0/1/2.
- `slicingPlaybackMode` (enum: `"mono"` | `"poly"` | `"thru"`) — maps to int
  0/1/2 (only meaningful when `playbackMode = "slicing"`).
- `retrigger` (bool).
- `voices` (discrete int set: **1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24,
  32**) — probe confirmed exact UI set; in-between values silently revert.
  Define as Zod literal union to constrain at schema level.

Pitch bend ranges, remote script only (Max's LiveAPI lacks both; Python's
`SimplerDevice` has them):

- `pitchBendRange` (int semitones, 0-24) — `pitch_bend_range`; typical
  default 5.
- `notePitchBendRange` (int semitones, 0-48) — `note_pitch_bend_range`, MPE
  per-note bend; typical default 48.

Both are `params` entries and pseudo-params in the spec (`options` "0-24" and
"0-48"), like Drift's and Spectral Resonator's `pitchBendRange`, but the sync
`read`/`write` can't wait on the remote script. So `read` answers undefined and
`write` refuses, saying to use update-device on the Simpler's own path (a pad's
`pC1/d0/…` shortcut and create-device reach it). Live clamps an out-of-range
write silently and raises on a float, so both layers refuse anything but a whole
number in range before writing.

- Read: after the read, one batch call (`/device/simpler/read`, at most 3 s)
  adds `{name, value}` entries to `parameters` of every Simpler read with
  `params`, honoring `paramSearch`. Nothing is added when the remote script
  isn't running, is too old, or can't answer, and the pass is skipped when the
  macros pass already stalled.
- Write: update-device's `updateResolved` writes the Simpler's entries (the last
  of each name; case and spacing don't matter) in one call to
  `/device/simpler/write` before the rest of the target's update, and hands each
  entry's outcome to `setParamValues` through its `settled` map. The result is
  `{name, value}` when it read back as asked, `ok: false` and why otherwise.
  Without the remote script the entry says it needs it. The request carries an
  expiry, so Live skips it if it hasn't started it by the time V8 stops waiting.
  If the route doesn't answer, the write may have landed: the entry says it _may
  have changed_, the target keeps its place (the pipeline's landed journal), and
  later Simplers in the call aren't tried.

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
  capability flags; let the LLM attempt the action and read the refusal off its
  own result entry rather than surface the flags.
- `playing_position` / `playing_position_enabled` — realtime, not useful for
  Producer Pal's batch model.
- `pad_slicing` — niche.
- `SimplerDevice.View` sample positions (`sample_start`, `sample_end`,
  `sample_loop_start`, `sample_loop_end`, `sample_loop_fade`,
  `sample_env_fade_in`, `sample_env_fade_out`; read-only, in samples, -1 with no
  sample; Python only) — redundant: they are the modulated positions of the
  `S Start`, `S Length`, loop and fade DeviceParameters Max already exposes.
- raw `guess_playback_length` as an action — surfaced as
  `estimatedPlaybackLength` RO pseudo-prop instead (pure compute).
- `warp_as(beats)` is exposed via the action syntax (`"warpAs(N)"`), not as a
  separate writable param.

**Implementation gotchas (verified by probe 2026-05-21):**

1. **Warp/crop actions operate on the active region** (`S Start` to
   `S Start + S Length`), not the whole sample. Skill instructions should make
   this clear so the LLM sets markers first when targeting a sub-region.
2. **`sample` writes likely fail when `multiSampleMode = true`** — refuse the
   write with that reason.
3. **`voices` is a discrete set, not a continuous range.** Use Zod literal union
   (`z.union([z.literal(1), z.literal(2), ...])`) so out-of-set values are
   rejected at schema level. Probe: setting 9/11/13/15/17-19/21-23/25-31 all
   silently revert to prior valid.
4. **`can_warp_*` capability flags change after sample load and warp ops** —
   per-state, not stable. Don't cache. (Probe: `can_warp_as` went `0` → `1`
   after loading a sample; `can_warp_double/half` stayed `0`.)
5. **`estimatedPlaybackLength` should be omitted from read output when `sample`
   is null** — `guess_playback_length` returns garbage / 0 with no sample.
