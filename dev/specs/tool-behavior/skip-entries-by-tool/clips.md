# Skip entries: clips

Part of [Skip entries, tool by tool](README.md).

- **update-clip answers per target named, not per clip reached.** Its targets
  resolve up front, and the entries come back in call order: a split target's
  pieces come right after its own. A path that can't be parsed refuses the call,
  and so does a `toPath` entry that can't be (`tX`). A path or id that finds no
  clip (a path into a group track's slot says
  `track t9 (id 12) is a group track; it holds no clips`), a `toPath` entry that
  parses but names no place a clip can go (a scene), a target whose only
  requested work (a move, a position, a split) was refused, and a clip an
  earlier write of the call already cleared hold their slot as a skip. A split
  that misses a clip is not a skip: one list cutting many clips is expected to
  miss some, so those clips keep plain entries, and a call or position that cut
  nothing anywhere gets one WARNING for the call. A MIDI note that crosses a cut
  stays in the earlier piece and ends at the cut, so that clip's entry says
  `N notes crossed a cut and now end at it`. Each note counts once, however many
  cuts it crosses, and only cuts that landed count; a note that ends at a cut or
  loop end, or is muted, does not. If the notes can't be read, the cut goes
  ahead and says nothing: the count is only a diagnostic. The `name` and `color`
  lists pair by the target's place, so a skip doesn't slide them. The deadline
  skips every target it never reached; a split that already cut keeps its
  pieces, each saying what did not run.
- **update-clip: a skipped clip's path can go stale.** A conversion's new track,
  a move or a split changes what a later path names, so a skipped clip's entry
  adds `that clip is now <path> (id N)`, read after all the writes; see
  [Tool Behavior](../skips-and-replaced-targets.md).
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
  lengthen whose move fails anyway is skipped. A resize changes the one clip in
  place. A lengthen first clears what it grows over with a temp clip that is
  deleted on every path; one Live won't delete is a `detail` on the entry. A
  throw after a shorten keeps `already changed: shortened`. A param the clip
  can't take is a detail on its entry, and a skip when it was all the call
  asked. The move and arrangement helpers report on the clip's entry through a
  per-call collector keyed by the clip id; a step that writes under a new id
  hands what it reports back to the id the caller named. Moves are written in an
  order that clears nobody's way, and one that can't be ordered is refused with
  the clip it would land on named. Known gap: when a target throws partway,
  notes gathered for that clip before the throw are not carried onto its failure
  entry.
- **update-clip: a step sequencer clip takes no note work.** A Live 13 step
  sequencer clip is a MIDI clip whose steps the API can't read or write (its
  notes calls reach a hidden list and change nothing visible: `add_new_notes`
  returns ids and a read returns those notes, so a read-back can't catch it, but
  they never play). `notes`, `preTransforms`, `transforms`,
  `quantize`/`quantizeGrid`/`quantizePitch`, `duplicateLoop` and `code` are each
  ignored on it the way an audio clip's are:
  `notes ignored: the clip is a step sequencer` on its entry, a skip when that
  was all the call asked, and nothing written to it. Every transform counts as a
  note transform, so the whole param is ignored, `gain` and `pitchShift` too.
  The other params in the call (name, color, looping, region, meter, `toPath` to
  a slot or the arrangement's main lane) still land. A note edit that can't be
  read is not refused for such a clip, since nothing is read for it. The clip is
  told apart by a list read of `midi_clip_type` equal to 1, only for a MIDI
  clip; on Live 12 the property answers a bare number, which never counts.
  `scale` is left as it is for MIDI clips.
- **update-clip: a clip whose new meter can't read the notes or transforms is a
  skip.** A bar|beat range or constant that is fine in one clip's meter and not
  in another's (`1|5-2|1` is a bar in 4/4, backwards in 3/4) is checked per
  meter, with the meter each clip will have after `timeSignature`. A clip that
  can't read it is `{id, ok: false, detail: <the parse error>}`, written nothing
  (not even its meter or name), and the other clips go on. The call is refused
  instead when every meter fails, or a clip the call will split fails: a cut
  can't be undone.
- **create-clip answers per destination named.** Its `path` list, clip slots and
  arrangement positions mixed, comes back one entry per destination in the order
  the call named them, and `name`/`color` pair by that place — it used to answer
  every clip slot first and the arrangement after. A destination that got no
  clip holds its slot as a skip: a track that isn't there or won't take the
  clip, a transform its meter can't read, a length that spans nothing in its
  meter, a create Live declined, a take lane past the cap, one the deadline
  never reached. A `firstStart` the call can't use — without `looping: true`, or
  at or past the region's end — is a `detail` on that clip's entry rather than a
  warning, and no `ok`: the clip exists.
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
- **A clip's own scale (`scale`) is MIDI-only and needs Live 12.4.15.** Each
  clip keeps its own scale; writing one changes that clip alone, and a clip made
  without one starts with the Live Set's. update-clip and create-clip take a
  `scale` (`"C Major"`, `""` for none) with a list form, one per clip. It is
  written before the clip's notes and transforms. The entry reports `scale` only
  when Live stores a different spelling than the one asked for, with a `detail`
  (a sharp root comes back flat), like update-live-set. A param the clip can't
  take is a `detail` on its entry, never a warning, and a skip when it was all
  update-clip was asked of that clip:
  - `scale ignored: the clip is audio`, on an audio clip.
  - `scale ignored: requires Live 12.4.15 or later`, on every clip of a call run
    on older Live, where clips have no scale. Everything else in the call goes
    ahead. The version is asked once per call.
  - Live fails partway: the clip keeps its entry with `already changed: scale`
    once its scale has begun to change.
- **A step sequencer clip reads as `type: "step-sequencer"`** (beside `"midi"`
  and `"audio"`) in read-clip and every listing that reuses its entry, with
  `detail: "steps can't be read"`. No `notes` or `mutedNotes` are shown for it,
  whatever `include` says; its timing, color and other clip fields read as a
  MIDI clip's. read-track drops a nested clip's type when it matches the
  track's, so there the type shows only on a step sequencer clip.
- **A Live 13 return-track clip reads as `type: "envelope"`**: neither MIDI nor
  audio (both flags 0), so it has no notes, sample, warp or scale fields, and
  its timing reads in beats. Its `path` is `rt0/s3`. read-track and read-scene
  list and count them (a scene entry names the return track in `trackName`); a
  nested one keeps its type, since the track's isn't `"envelope"`. Its
  `envelopes` read like any session clip's, on the return track's own mixer and
  devices (see
  [clip-envelopes.md](../clips-playback-and-sends/clip-envelopes.md#envelopes-on-a-return-track-clip)).
- **update-clip takes an envelope clip** by path or by id: `name`, `color`,
  `looping`, the region and marker params and `timeSignature` land as on a MIDI
  clip. Everything that needs notes or a sample is ignored per param, on the
  clip's entry, with `the clip is an envelope clip`: `notes`, `transforms`,
  `preTransforms`, `quantize`/`quantizeGrid`/`quantizePitch`, `duplicateLoop`,
  `code`, `scale`, `gainDb`, `pitchShift`, the warp params and `convert`
  (`gainDb, pitchShift ignored: the clip is an envelope clip`). `envelopes` is
  written as on a session clip. A `transforms` that can't be read still refuses
  the call; `notes` aren't read. A clip nothing landed on is skipped, or throws
  when alone. A `toPath` moves it to another return slot only; any other
  destination is that clip's
  `not moved: an envelope clip can only go to a return-track slot` (a regular
  clip sent to a return slot says
  `not moved: a return-track slot only takes an envelope clip`). A move whose
  copy landed but whose original wouldn't delete keeps the copy's entry with
  `the original at rt0/s0 could not be deleted`.
- **read-clip shows a MIDI clip's `scale` (and `scalePitches`) only when it
  differs from the Live Set's.** Both off is the same. A clip with its scale off
  while the Live Set's is on reads `scale: ""` (no `scalePitches`). A clip with
  its scale on while the Live Set's is off, or with another root or name, reads
  `"Root Name"` in the format read-live-set uses. Nothing is shown for an audio
  clip, or on Live older than 12.4.15. There is no include for it. The version
  and the Live Set's scale are read once per call, not per clip. read-track and
  read-scene clip entries don't show it.
- **A clip slot past the last scene is a destination, so it is created.**
  create-clip, update-clip's `toPath` and duplicate's `toPath` all make the
  scenes up to a slot that isn't there yet, sharing one helper, and the entry
  reports them as `created: "s8-s9"` (a target that then failed names them in
  its `detail`) — the path alone says what to make, and a caller can't pair its
  own request against scenes it was never told about. Past the auto-create cap,
  and on a track that isn't there, the destination is still refused.
  update-scene's `path` names a target rather than a destination, so it stays a
  refusal, with create-scene named in its `detail`.
