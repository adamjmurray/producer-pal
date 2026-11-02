# Skip entries: scenes and tracks

Part of [Skip entries, tool by tool](README.md).

- **update-scene answers per target named.** Its targets resolve up front. A
  path that can't be parsed refuses the call; one that parses but names no scene
  holds its slot as a skip (`ppal-create-scene` named in the detail for a path
  past the last scene). The `name`, `color` and `timeSignature` lists pair by
  the target's place, so a skip doesn't slide them. A scene named twice (id and
  path, or an id repeated) is written as its last mention asks: the earlier
  keeps `{ id | path, detail }` with no `ok`, and becomes `ok: false` when the
  last one lands nothing. A throw after part of a scene landed keeps its normal
  entry plus `<error>; already changed: name, color, tempo, time signature`;
  later scenes still run, and the deadline skips the ones it never reached.
  `focus` selects the last scene written.
- **update-track answers per target named.** Its targets, tracks and take lanes,
  resolve up front. A path that can't be parsed refuses the call (a lane on a
  return or main track included); one that parses but names no track holds its
  slot as a skip. The `name`, `color`, routing and (deprecated) `sendReturn`
  lists pair by the target's place, so a skip doesn't slide them. A track named
  twice (id and path, or an id repeated) and a take lane named twice (by id and
  by path) are written as their last mention asks: the earlier keeps
  `{ id | path, detail }` with no `ok`, and becomes `ok: false` when the last
  one lands nothing. Two `l+` entries are two new lanes, not one. A throw after
  part of a target landed keeps its normal entry plus
  `<error>; already changed: name, color, gainDb, send A-Reverb, take lane l0 made`;
  later targets still run, and the deadline skips the ones it never reached. A
  `sends` entry a later one replaced is `{ return, returnId, detail }` with no
  `ok`, the same for a rack chain's sends in update-device; `ok: false` stays
  for a send that really failed.
- **create-track answers per path named.** A track Live didn't make (an insert
  it refused, an answer with no track, one the deadline never reached) holds its
  slot as `{path, ok: false, detail}` in the caller's spelling (`t+`, `t2`,
  `rt+`), and the other tracks are still made. A track that exists keeps its
  normal entry (`id`, `path`) when a later step threw, plus
  `<error>; already changed: track created`. A track that landed inside a group
  track (a path at one of its members' index) says so in a `detail`:
  `inside group track t9 (id 12)`. A failed insert moves the tracks after it, so
  those are planned again from what the Set holds, and every entry names its
  track where it sits after the call. `arm` on a return track is a `detail` on
  its entry, in update-track's words, not a failure: the track was made.
- **create-scene answers per path named, the same way.** A scene Live didn't
  make holds its slot as `{path, ok: false, detail}`; one that exists keeps its
  normal entry plus `<error>; already changed: scene created`. Empty scenes made
  to reach a path past the end are the scene's `created: "s2-s4"`; when the
  insert then fails they are named in its detail, where they sit after the call
  (`<error>; created s2-s4 to reach it`), and a scene made later doesn't claim
  them. A create Live ignored is a skip too, though a scene already stands at
  that index; the count of scenes tells. A capture is one target, so a lone
  failure throws; a capture that succeeded and then failed on its name or color
  keeps its entry with `already changed: scene captured`. A time signature Live
  changed (a numerator it clamps) is reported as the value read back plus
  `timeSignature read back as shown, not as sent`; one that can't be kept (a
  denominator that isn't a power of two) is refused up front. update-scene
  answers the same way, through the same code.
