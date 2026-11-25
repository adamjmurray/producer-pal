# Run 40

Run numbers refer to [recorded-runs.md](../recorded-runs.md).

```bash
scripts/eval-report --failures 2026-11-22T08-05-27Z
```

| scenario                             | kind       | inkling-2-mini (40)     |
| ------------------------------------ | ---------- | ----------------------- |
| `automation-arrangement-direct`      | capability | 2/3                     |
| `bar-beat-per-bar-spread`            | capability | 2/3                     |
| `bar-beat-zip-streams`               | capability | 1/3                     |
| `color-list-pairing`                 | regression | 2/3                     |
| `drum-pad-force-guard`               | capability | 2/3                     |
| `library-search-fanout`              | capability | 2/3                     |
| `middle-c-scale-barbeat`             | capability | 2/3                     |
| `path-topath-devices`                | capability | 2/3                     |
| `track-and-device-workflow`          | regression | 0/3                     |
| `transform-random-baked-or-replayed` | capability | 2/3                     |
| **total**                            |            | 395/408 (136 scenarios) |

**Five of the 13 failures are the model stopping to ask instead of writing.** In
all three `track-and-device-workflow` trials it found Wavetable's cutoff
(`Flt 1 Freq`, in Hz) and asked what "50%" should mean rather than pick a value;
update-device itself refuses `50%` on a Hz param, so the question is fair, but
qwen3.8-flash-next and Luna both picked one and passed. `drum-pad-force-guard`
and `path-topath-devices` stalled the same way.

- `automation-arrangement-direct`: said it wrote the pan automation, but none
  reached the clip at bar 5; that turn hit the output cap.
- `bar-beat-per-bar-spread`: wrote the chords on beats 1–4 of bar 1
  (`1|1,2,3,4`) instead of the downbeat of each bar.
- `bar-beat-zip-streams`: hand-listed 16 note positions instead of the bracket
  and repeat notation, twice.
- `color-list-pairing`: sent one color for six paths, leaning on cycling.
- `drum-pad-force-guard`: after "go ahead and replace it", asked again which
  kick to load and wrote nothing.
- `library-search-fanout`: the judge failed the reply for saying every sample
  was in the User Library when the closed hats were in the Core Library.
- `middle-c-scale-barbeat`: wrote the scale an octave high (C4 as middle C).
- `path-topath-devices`: said the rack had no empty C3 pad, only the 16 filled
  ones, and copied nothing.
- `track-and-device-workflow`: asked what "50%" cutoff means (see above).
- `transform-random-baked-or-replayed`: repeated one paragraph until the output
  cap and never wrote the LFO.
