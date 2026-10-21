# Converting an audio clip

Part of [Clips, Playback and Sends](README.md).

Mechanics: [conversions.md](../../../live-api/conversions.md).

`ppal-update-clip` `convert` (`drums`, `melody`, `harmony`) makes a new track
from an audio clip, through the remote script. It runs last in the clip's turn,
after the other edits and after `envelopes`, on the clip those left. One
conversion per clip: each clip's entry reports its own, and one that fails
doesn't stop the rest, except as noted below.

The entry gets
`converted: { track: { id, path, name }, instrument?: { id, path, type, name }, clip?: { id, path, noteCount } }`.
`instrument` is the new track's first device (what Live loaded to play the
clip), missing when the track has none. `clip` is the MIDI clip, in the source's
slot (Session) or starting where it started (Arrangement); its `noteCount` can
be 0, which is an answer, not a failure. It is missing when the new track has
none there. Once the track appears, the call looks up to 1 s for the instrument
and clip, and returns at once when both are there.

- **Paths are read again at the end of the call.** Live doesn't say where the
  new track lands, and each conversion shifts the tracks after it. So once the
  call is done, every written entry's `path`, and the `path` of each `converted`
  track, instrument and clip, is read again. The param description says once
  that it adds a track; results don't warn.
- **Refused, so nothing changed**: not an audio clip, a take lane clip, a clip
  that is recording, one Live says isn't convertible, a Live without the
  conversions, no time left, or no remote script. With nothing else asked of the
  clip its entry is a skip; otherwise the entry stays and carries the reason in
  `detail`. Live's own message is passed on.
- **Live took the job but the result is unclear**: the entry stays, with a
  `detail`, never a throw. Live makes the track a moment after the route
  answers, so the call waits for a new regular track (up to 20 s, less when the
  request has less left). No track by then: the conversion was started, look for
  the track before converting again. Several new tracks (something else made
  one): none is reported as the clip's, and the detail names them. One track but
  no MIDI clip in the expected place: the track is reported with a `detail`.
- **After a conversion whose track wasn't found, or wasn't the only new one (or
  whose route went unanswered), the call's remaining conversions are skipped**,
  each as
  `not converted: an earlier conversion in this call didn't show its new track, so this one wasn't started; re-run it`.
  A late track would land in the next clip's comparison, and every clip would
  wait out the full 20 s.
- **`convert` with `arrangementSplit` or `split` is refused up front**: the
  split makes several clips and the conversion would have to pick one.
- **`convert` with a move (`toPath`, `toSlot`, `arrangementStart`) is refused up
  front**: the move changes where the clip is, and the conversion adds a track
  that shifts later paths. Move in one call, convert in the next.
