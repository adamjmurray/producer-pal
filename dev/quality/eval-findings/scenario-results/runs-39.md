# Run 39

Run numbers refer to [recorded-runs.md](../recorded-runs.md).

```bash
scripts/eval-report --failures 2026-11-19T07-41-22Z
```

| scenario                       | kind       | qwen3.8-flash-next (39) |
| ------------------------------ | ---------- | ----------------------- |
| `arpeggio-bracket-idiom`       | capability | 2/3                     |
| `automation-write-curve`       | capability | 2/3                     |
| `context-onboarding-no-import` | regression | 2/3                     |
| `context-write-layer-global`   | regression | 2/3                     |
| `create-and-edit-clip`         | regression | 1/3                     |
| `drum-backbeat-stark`          | capability | 2/3                     |
| `drum-transforms`              | capability | 2/3                     |
| `library-search-fanout`        | capability | 1/3                     |
| `locator-navigation`           | capability | 2/3                     |
| `melody-transforms`            | capability | 2/3                     |
| `path-topath-clips`            | capability | 2/3                     |
| **total**                      |            | 395/408 (136 scenarios) |

**New since run 37: three turns ended without the write they were asked for.**
In two `create-and-edit-clip` trials the model read the track, wrote nothing,
and said it had created the clip (once naming a clip id). In `path-topath-clips`
it answered the connect result's "report status, then wait" line instead of the
request. Same model and quant as run 37, where neither scenario failed. The
cause is not known yet.

- `arpeggio-bracket-idiom`: hand-listed the arp pitches instead of the `[...]`
  bracket cycle.
- `automation-write-curve`: bent the volume ramp above the straight line (fast
  then slow) when asked for slow then fast.
- `context-onboarding-no-import`: said it already knew the user's preferences
  from earlier sessions, though global context was empty. Failed in run 37 too.
- `context-write-layer-global`: wrote global context before asking.
- `create-and-edit-clip`: claimed a clip it never wrote, twice (see above).
- `drum-backbeat-stark`: red on purpose (see the eval-findings README); the
  pattern left out 2 of the 22 notes, starting with the kick on beat 2.
- `drum-transforms`: ended the hats' LFO range at `2|2` instead of `2|3`, the
  same time-range slip as run 37.
- `library-search-fanout`: the judge failed the reply both times: once for
  invented sample descriptions, once for naming the wrong library folder.
- `locator-navigation`: looped `29|1–33|1` instead of `25|1–33|1`.
- `melody-transforms`: wrote `legato(0.05)` where the check wants `legato()`.
- `path-topath-clips`: answered the connect prompt instead of making the clip
  (see above).

Fixed since run 37: `device-copy-in-place`, `device-mapped-macros`,
`note-ops-split` and `swing-and-quantize` all went 3/3.
