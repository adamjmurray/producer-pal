# Clip Markers

How Live's clip markers behave when `warping` and `looping` change. Part of the
[coding standards](README.md).

## Audio Clip Warping

Verified against Live 12. Marker properties are beats while a clip is warped and
seconds while it is not, and toggling `warping` does **not** convert them
uniformly:

| Toggle     | `start_marker` | `loop_start` / `loop_end` | `end_marker`   | `looping`   |
| ---------- | -------------- | ------------------------- | -------------- | ----------- |
| warp → on  | converted      | converted                 | converted      | unchanged   |
| warp → off | converted      | converted                 | **left as-is** | forced to 0 |

Two consequences:

- `end_marker` is the one property Live leaves stale on unwarp.
  `unwarpAudioClip` (`src/tools/clip/helpers/audio-clip-warping.ts`) exists only
  to restate it. Nothing needs restating when warp goes on.
- An unwarped audio clip can never be looping — setting `looping` forces
  `warping` back on. So any `isLooping` branch is unreachable in an unwarped
  code path.

Live's own conversion runs through the **warp grid**, not `beats * 60 / tempo`.
On a time-stretched clip the two differ; they only coincide when the grid
happens to match the Set tempo. Live exposes the grid as `warp_markers` but has
no `beat_to_sample_time`, so there is no cheap exact conversion — which is why
`unwarpAudioClip` resets `end_marker` to the whole sample instead of converting
it.

That does not affect `start`/`length`, which name a region rather than preserve
one. An unwarped clip plays in real time, so its region is beats at the Set
tempo in both directions: `markerBeatsPerUnit`
(`src/tools/clip/helpers/audio-clip-timing.ts`) is the one conversion, and
`audioClipTiming` reads back through the same factor.

Reading a marker also needs `markerClampSeconds`. A stale `end_marker` can point
past the end of the file, and read-clip clamps it to the sample — so anything
deriving a region from a marker has to clamp too, or a `length` taken from
read-clip writes back a region that starts past the end of the sample and plays
silence. The warp toggle is applied **before** the region write in
`processSingleClipUpdate`, so `warping: false` plus `start`/`length` in one call
compose: the unwarp resets `end_marker` first, then the region lands on top of
it, in seconds.

## The Loop Toggle

Verified against Live 12, MIDI and audio alike. Every clip has two regions, and
`looping` picks which one plays:

| `looping` | region that plays             |
| --------- | ----------------------------- |
| off       | `start_marker` / `end_marker` |
| on        | `loop_start` / `loop_end`     |

Flipping the flag does **not** carry the region across — it reveals whatever the
other pair was last left with, which on a fresh clip is the whole thing.
`calculateBeatPositions` restates the playing region into the newly selected
pair, so `looping` changes the loop flag and nothing else (ADR-0020).

Writing them is not symmetric, and these two are the ones that bite:

- `start_marker` is **ignored** while `looping` is off — the set reports success
  and does nothing. `loop_start` is the writable handle for the start then, and
  moving it drags `start_marker` along.
- A loop brace only survives a toggle if it was written while `looping` was on.

So `buildClipPropertiesToSet` writes the markers **before** switching looping
off, and the brace **after** switching it on.

Two more traps in the same write, which is why it moves the end first when the
new start lands at or past either current end: Live rejects a `loop_start` past
`loop_end`, and silently drops a `start_marker` past `end_marker`.
