# Run 36

Run numbers refer to [recorded-runs.md](../recorded-runs.md).

```bash
scripts/eval-report --failures 2026-11-13T07-10-15Z 2026-11-13T10-00-50Z
```

The second folder is the re-run of the three scenarios a harness bug broke. Jev
decided 32 of the 39 judged replies and escalated 7 to Luna.

| scenario                      | kind       | muse-glimmer (36)      |
| ----------------------------- | ---------- | ---------------------- |
| `bar-beat-meter-fill`         | capability | 2/3                    |
| `bar-beat-triplets`           | capability | 2/3                    |
| `context-write-layer-global`  | regression | 1/3                    |
| `context-write-layer-project` | regression | 1/3                    |
| `device-drum-kit`             | capability | 2/3                    |
| `device-option-params`        | capability | 2/3                    |
| `drum-backbeat-stark`         | capability | 2/3                    |
| `drum-pad-force-guard`        | capability | 2/3                    |
| `locator-navigation`          | capability | 0/3                    |
| `melody-pitch-stark`          | capability | 1/3                    |
| `middle-c-scale-stark`        | capability | 2/3                    |
| `mixer-language`              | regression | 2/3                    |
| `path-arrangement-covers`     | capability | 2/3                    |
| `path-take-lane-first`        | capability | 2/3                    |
| `path-topath-clips`           | capability | 2/3                    |
| `path-topath-devices`         | capability | 2/3                    |
| `range-clear-boundaries`      | capability | 0/3                    |
| `rhythm-grid-midi-json`       | capability | 1/3                    |
| `surgical-note-duration-edit` | capability | 2/3                    |
| **total**                     |            | 201/228 (76 scenarios) |

**Harness bugs, fixed before the re-run:**

- `rack-in-pad-read-layers`, `rack-in-pad-add-layer`: setup errored every trial.
  Small-model mode drops `gainDb` from the tool inputs, so the layers' levels
  were never set and the setup check threw. Setup now runs with small-model mode
  off, as the muted-note seed already did: 6/6 on re-run.
- `locator-navigation`: the start check read `startTime` from the playback
  result, which leaves it out when playback starts where asked, so a correct
  `17|1` failed. The check now falls back to the sent bar|beat. The re-run still
  went 0/3, on the model's own misses below.

**Model failures:**

- `bar-beat-meter-fill`: wrote `n/1` (4 beats) to fill a 5/4 bar.
- `bar-beat-triplets`: wrote `n/24` and `n/12` for eighth and quarter triplets,
  one level too short.
- `context-write-layer-*`: wrote project or global context before asking, in 4
  of 6 trials.
- `device-drum-kit`: built the kit pad by pad instead of in one call.
- `device-option-params`: set band 3 to Bell where the user asked for a notch.
- `drum-backbeat-stark`: red on purpose (see the eval-findings README).
- `drum-pad-force-guard`: sent `force: true` without asking first.
- `locator-navigation`: looped bars 25-41 (bridge through the outro) in 5 of 6
  trials across both runs, where the scenario wants 25-33, as qwen did in runs
  28 and 33. It also never made the bass copy into the bridge, and once asked
  where the sections were instead of reading the locators.
- `melody-pitch-stark`: once made no clip; once wrote 7 of 8 notes, two a
  semitone low.
- `middle-c-scale-stark`: put "scene 1" at `s1` instead of `s0`.
- `mixer-language`: replied to "Solo the Chords track" without soloing it.
- `path-arrangement-covers`: renamed the clip by its start (`t3[1|1]`) instead
  of the bar-3 coordinate.
- `path-take-lane-first`: read the track and stopped without making the clip.
- `path-topath-clips`, `path-topath-devices`: re-created the clip or device
  instead of calling `ppal-duplicate`.
- `range-clear-boundaries`: cleared `1|1-1|3`, which includes beat 3, every
  trial.
- `rhythm-grid-midi-json`: wrote C3 as MIDI 48 instead of 60 in 2 of 3 trials.
- `surgical-note-duration-edit`: once made no update call.
