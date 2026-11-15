# Run 38

Run numbers refer to [recorded-runs.md](../recorded-runs.md).

```bash
scripts/eval-report --failures 2026-11-14T09-27-45Z
```

| scenario                             | kind       | deepseek-v4-flash (38)  |
| ------------------------------------ | ---------- | ----------------------- |
| `bar-beat-zip-streams`               | capability | 1/3                     |
| `context-follow-global`              | capability | 1/3                     |
| `context-onboarding-no-import`       | regression | 2/3                     |
| `context-onboarding-records-decline` | regression | 2/3                     |
| `context-write-layer-global`         | regression | 0/3                     |
| `context-write-layer-project`        | regression | 1/3                     |
| `device-move-pairing`                | capability | 2/3                     |
| `drum-transforms`                    | capability | 0/3                     |
| `legato-transforms`                  | capability | 2/3                     |
| `melody-pitch-midi-json`             | capability | 2/3                     |
| `middle-c-scale-midi-json`           | capability | 2/3                     |
| `note-ops-split-direct-notes`        | capability | 2/3                     |
| `rack-pad-ops`                       | capability | 2/3                     |
| `swing-and-quantize`                 | capability | 2/3                     |
| `transform-random-baked-or-replayed` | capability | 1/3                     |
| `velocity-shaping`                   | capability | 0/3                     |
| **total**                            |            | 376/402 (134 scenarios) |

**Nine of the 26 failures share one cause.** The model reads the drum clip's raw
notes, guesses that `Ab1` is the snare and `E1` the hats (it is the other way
round), and never reads the pad names. Every edit then lands on the wrong drum:
`drum-transforms` (2 of 3), `velocity-shaping`,
`transform-random-baked-or-replayed` and `swing-and-quantize`.

- `bar-beat-zip-streams`: hand-listed 16 note positions instead of the bracket
  and repeat notation, at 17–23K output tokens.
- `context-follow-global`: ignored the pinned "no velocity above 80" rule and
  wrote notes at the default 100.
- `context-onboarding-no-import`: the judge failed it for asking whether to save
  preferences it already had in memory.
- `context-onboarding-records-decline`: got to work without saving the decline
  to memory.
- `context-write-layer-global`, `context-write-layer-project`: wrote the context
  straight away instead of asking first.
- `device-move-pairing`: the moved devices landed in the wrong order (Utility
  before Channel EQ).
- `drum-transforms`: the drum mix-up twice; once left the start of the time
  range off a selector (`Ab1 2|2-2|2.5`).
- `legato-transforms`: called `legato()` without the tolerance argument.
- `melody-pitch-midi-json`: wrote the melody an octave low (C3 as 48).
- `middle-c-scale-midi-json`: wrong pitches for the C minor scale (61 and 64 in
  place of 62 and 65).
- `note-ops-split-direct-notes`: wrong note lengths after the split (0–1 and 4–6
  for 0–2 and 4–8).
- `rack-pad-ops`: said the rack had no C3 pad and asked what to do instead of
  copying onto it.
- `swing-and-quantize`: the drum mix-up; it took the on-beat `E1` notes for the
  hats and said swing would change nothing.
- `transform-random-baked-or-replayed`, `velocity-shaping`: the drum mix-up.
