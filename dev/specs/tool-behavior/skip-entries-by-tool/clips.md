# Skip entries: clips

Part of [Skip entries, tool by tool](README.md).

- **update-clip answers per target named, not per clip reached.** Its targets
  resolve up front, and the entries come back in call order: a split target's
  pieces and a lengthened clip's tiles come right after its own. A path that
  can't be parsed refuses the call, and so does a `toPath` entry that can't be
  (`tX`). A path or id that finds no clip (a path into a group track's slot says
  `track t9 (id 12) is a group track; it holds no clips`), a `toPath` entry that
  parses but names no place a clip can go (a scene), a target whose only
  requested work (a move, a position, a split) was refused, and a clip an
  earlier write of the call already cleared hold their slot as a skip. A split
  that misses a clip is not a skip: one list cutting many clips is expected to
  miss some, so those clips keep plain entries, and a call or position that cut
  nothing anywhere gets one WARNING for the call. The `name` and `color` lists
  pair by the target's place, so a skip doesn't slide them. The deadline skips
  every target it never reached; a split that already cut keeps its pieces, each
  saying what did not run.
- **update-clip: a clip named twice** (id and path, or an id repeated) is
  updated as its last mention asks. The earlier mention keeps its slot as
  `{ id | path, detail }` with no `ok`; if the last mention then fails with
  nothing landed, the earlier one becomes `ok: false`
  (`not written: <later> was meant to replace it, but failed`). Two moves to one
  slot, or a move or resize a later target goes over, work the same way: left
  unwritten (`overwritten later in this call by <where>`) when the later one
  covers all of it, written and noted `shortened by <where> later in this call`
  when it covers part; either is said only once the later write really landed. A
  clip cleared by a write nobody predicted, or an unwritten one cleared where it
  stood by another landing, drops its `id` and says it was overwritten (the
  lander says `overwrote the clip at <where>`), or follows what is left of it.
  Nothing is `deleted: true`.
- **update-clip: Live fails partway** leaves the clip's normal entry, naming
  what exists now (the copy a move made, not the source) and what landed:
  `<error>; already changed: name, copy at t1/s2`. A move is checked before it
  shortens or resizes, so a refused move leaves the clip as it was, and a
  lengthen whose move fails anyway is skipped. A shortening clip is cut by a
  temp clip that is deleted on every path; one Live won't delete is a `detail`
  on the entry, and a throw after the cut keeps `already changed: shortened`. A
  param the clip can't take is a detail on its entry, and a skip when it was all
  the call asked. The move and arrangement helpers report on the clip's entry
  through a per-call collector keyed by the clip id; a step that writes under a
  new id hands what it reports back to the id the caller named. Moves are
  written in an order that clears nobody's way, and one that can't be ordered is
  refused with the clip it would land on named. Known gap: if Live fails while a
  lengthened clip's last partial tile is in the holding area past the track's
  clips, that holding copy can be left there unreported. Another known gap: when
  a target throws partway, notes gathered for that clip before the throw are not
  carried onto its failure entry.
- **update-clip: a clip whose new meter can't read the notes or transforms is a
  skip.** A bar|beat range or constant that is fine in one clip's meter and not
  in another's (`1|5-2|1` is a bar in 4/4, backwards in 3/4) is checked per
  meter, with the meter each clip will have after `timeSignature`. A clip that
  can't read it is `{id, ok: false, detail: <the parse error>}`, written nothing
  (not even its meter or name), and the other clips go on. The call is refused
  instead when every meter fails, or a clip the call will split fails: a cut
  can't be undone.
- **update-clip: `envelopes` beside an `arrangementLength` that tiles is a
  skip.** Lengthening a looped arrangement clip (looped as the call leaves it)
  tiles it into new clips, and the envelopes would reach only the first. That
  clip is `{id, ok: false, detail}`, written nothing, and the other clips go on.
  An unlooped clip grows in place and a shorten makes no tiles, so both still
  take envelopes.
- **create-clip answers per destination named.** Its `path` list, clip slots and
  arrangement positions mixed, comes back one entry per destination in the order
  the call named them, and `name`/`color` pair by that place — it used to answer
  every clip slot first and the arrangement after. A destination that got no
  clip holds its slot as a skip: a track that isn't there or won't take the
  clip, a transform its meter can't read, a create Live declined, a take lane
  past the cap, one the deadline never reached. A `firstStart` the call can't
  use — without `looping: true`, or at or past the region's end — is a `detail`
  on that clip's entry rather than a warning, and no `ok`: the clip exists.
- **create-clip: a place named twice** (the same slot or arrangement spot) is
  written once, by its last mention. The earlier one is
  `{ path, detail: 'named again as "<where>" later in this call' }` with no
  `ok`, and fails with the later one if it does (`not written: …`). A later
  arrangement clip that covers an earlier one is the same: the earlier is left
  unwritten (`overwritten later in this call by <where>`) when the later covers
  all of it, and written then noted `shortened by <where> later in this call`
  when it covers part. The later entry says what it overwrote, naming only clips
  that were written. An audio clip is as long as its sample, which Live reads
  once the clip exists, so a later clip over one is found out afterwards: the
  earlier entry drops its `id` and says it was overwritten, or names what is
  left of it.
- **create-clip: Live fails partway** keeps the clip's normal entry (`id`,
  `path`) plus `<error>; already changed: <what landed>`: the scenes made, the
  clip, the clip it replaced or the arrangement clips it went over, its
  properties, its notes. Only a failure before the clip exists is a skip, and
  scenes made to reach the slot are named in its `detail`. A scratch clip or
  scene Live won't clear after the replacement landed is a `detail` on the new
  clip's entry, not a failure. `auto` that launched nothing (no clip slot got a
  clip) is a whole-call warning, `auto ignored: …`. A clip meter Live changed (a
  numerator it clamps) is reported as read back, but the clip's region is still
  laid out in the meter asked for.
- **A clip slot past the last scene is a destination, so it is created.**
  create-clip, update-clip's `toPath` and duplicate's `toPath` all make the
  scenes up to a slot that isn't there yet, sharing one helper, and the entry
  reports them as `created: "s8-s9"` (a target that then failed names them in
  its `detail`) — the path alone says what to make, and a caller can't pair its
  own request against scenes it was never told about. Past the auto-create cap,
  and on a track that isn't there, the destination is still refused.
  update-scene's `path` names a target rather than a destination, so it stays a
  refusal, with create-scene named in its `detail`.
