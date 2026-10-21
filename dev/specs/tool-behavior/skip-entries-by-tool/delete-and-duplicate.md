# Skip entries: delete and duplicate

Part of [Skip entries, tool by tool](README.md).

- **delete answers per target named.** A path that can't be parsed refuses the
  call. A path that parses but names the wrong kind of thing, an object this
  call won't remove (the Producer Pal device or its track, a take lane, a chain
  of the wrong type — a return or main track never hosts the device, since it
  takes only audio effects and Producer Pal is a MIDI effect), or a delete Live
  ignored or threw on holds its slot as `{id | path, ok: false, detail}` in the
  caller's own spelling, and the other targets still run. A target with nothing
  there is a no-op: its spelling and `detail: "nothing to delete"`, no `ok`, and
  a lone one is satisfied. A removed object reports `{id, deletedPath}`, its
  address from before the call: every address is read before the first delete,
  since deleting shifts later siblings. A drum pad is cleared, not removed, so
  it reports `path`. An object named twice is deleted once, by its last mention;
  the earlier ones are `{id | path, detail}` with no `ok`, and fail with the
  last one if it fails. A drum chain Live parked on a spare pad before a throw
  keeps its normal entry,
  `<error>; already changed: moved the chain to a spare drum pad`. Targets are
  deleted from the highest position down, but entries stay in call order. A
  track inside a group the call also names goes last, lowest first, so its group
  goes before it. Deleting a group track also deletes every track inside it,
  nested groups included. Its entry lists them in `detail`, as `path (id N)`
  from before the call, in track order:
  `also deleted the 3 tracks inside this group track: t13 (id 124), t14 (id 125), t15 (id 126)`.
  A track the call also named, in any spelling and at any depth, is left out of
  that list and gets no delete of its own: its entry is a plain
  `{id, deletedPath}`, and the group has no detail when nothing else went with
  it. If the group wasn't deleted (refused or skipped), a track named with it is
  deleted like any other track. A track Live deleted before a throw is
  `already changed: deleted the track`, and a group's adds what went with it:
  `already changed: deleted the track, also deleted the track inside this group track: t2 (id b)`.
  Live silently ignores a delete of the only track in a group track (a group
  counts), so that target is skipped at its turn, just before the Live call
  (after any earlier delete in the call), naming the nearest group track that
  can be deleted:
  `Live won't delete the only track in a group track; delete group track t11 (id 103) instead, which deletes both`
  (`the tracks inside it too` when that group holds more). If that group holds
  the Producer Pal device, the detail names that group as one that can't be
  deleted, and suggests none.
- **duplicate answers per copy named, in the order named.** Every copy of every
  source is a target: `count` copies of a track or scene, one per destination of
  a clip, device, chain or pad, one per scene position, one per lane a track
  copies onto. A destination no copy landed at keeps its slot as
  `{path, ok: false, detail}` — a track that won't take the clip, a copy Live
  declined, a take lane past the cap, a re-create that failed, a destination the
  deadline never reached, one the plan dropped because a clip slot can't take an
  arrangement copy. A copy that landed incomplete is a clip entry with a
  `detail`, not a skip: it exists, so losing it from the result would cost the
  caller a clip. The path is spelled the way a copy that landed there would
  report it, so it pastes back into `toPath`.
- **duplicate: a source that names nothing is a skip, not a refusal.** An id
  that isn't there, a path that parses but finds nothing, a track that isn't
  regular, or one of the wrong type keeps the place of every copy it was to make
  as `{id | path, ok: false, detail}` (a clip's or device's copies are addressed
  by their destination), and the other sources still copy. A path that can't be
  parsed refuses the call, and so does a `toPath` entry that can't be, for every
  kind of copy: a destination written wrong is never a per-copy skip.
- **duplicate: a copy a later copy replaces is left unwritten.** Two copies to
  one clip slot, or one a later copy covers whole on an arrangement lane (a lane
  copy's clips each need covering, a scene copy's clips each on their track),
  keep their place as
  `{path, detail: "overwritten later in this call by <where>"}`, no `ok`; one
  the later copy covers only part of is written first and says
  `shortened by <where> later in this call`, and its `id` and `path` follow what
  is left of it. Said only once the later copy really landed, else the earlier
  one is `ok: false`
  (`not written: <later> was meant to replace it, but failed`). A copy cleared
  by something nobody predicted loses its `id` and says it was overwritten.
  Nothing is `deleted: true`. Copies are made in the order named, so the later
  of two overlapping copies wins whichever source it came from, and a source
  named twice, apart (`A,B,A`), is two turns. A copy that lands on the source
  clip itself is made after that source's other copies, which copy it whole;
  when a copy that must go last also has to come first to be cut short, the call
  is refused before anything is written. Each such copy trims the source for the
  next, so when a source has two or more, they are made from a spare: a full
  copy of the source, parked past the end of its track just before the first of
  them and deleted after the last, however the call ends (a refused copy, the
  deadline). A spare Live won't delete stays where it is, and an entry says so
  (`a spare copy of the source clip is still at <where>; delete it`): the last
  copy's, or the first's when the last never got its turn (the deadline). If the
  spare can't be made, none of those copies is. A take-lane source has no spare:
  its clips can be neither duplicated nor deleted through the API, so its copies
  on its own lane still copy what an earlier one left of it.
- **duplicate: Live fails partway.** A copy that landed keeps its normal entry
  (`id`, where it is now) plus a `detail` of what landed and what didn't: a
  track or scene copy whose naming, coloring or clips failed, a copy Live threw
  on after making it, a device whose temp track couldn't be deleted, a pad whose
  chains couldn't be named, a take lane made for a clip that then failed. Only a
  copy nothing of which landed is `ok: false`.
- **duplicate: automation written for another length.** A session clip with
  automation copied to the arrangement at an `arrangementLength` other than its
  own has its track automation lane written for the span first. If that stops
  early (a failure, the request deadline) the copy is still made, and its
  `detail` says how far the lane got
  (`automation written for the first 4 of 10 beats only (<why>)`, or
  `automation not written (<why>)`). If the copy then fails, the lane has still
  changed, so the entry is a normal one (no `ok: false`) whose `detail` adds
  `already changed: automation written for ...`; in a scene copy, the position
  keeps its entry. A clip whose scratch copy can't be made is refused before
  anything changes.
- **duplicate: a session clip's automation written to the lane.** Copying a
  session clip with automation (MIDI, or warped audio) to the arrangement, at
  any length, makes Live write that automation to the track's arrangement lane
  over the copy's span, replacing what the lane held there for those parameters.
  The copy's first entry (a clip copy's, or each track's in a scene copy) says
  `wrote its automation to the track's arrangement lane over this span`, once. A
  copy that stopped early says its own note above instead. A clip with no
  automation, an unwarped audio clip and an arrangement source write nothing, so
  say nothing. An arrangement source gets no "automation left behind" note
  either: the lane can't be read, so it can't tell whether anything was left,
  and checking every parameter on the track costs too much. The tool
  descriptions warn before the call instead.
- **duplicate: a device copy that can't be placed.** With the remote script,
  Live copies a device right after the original. Nothing is moved or deleted
  until the device in that slot is checked to have the original's name and
  class. If the move to `toPath` then fails, the copy is deleted again and the
  entry is `ok: false`; if it can't be deleted (or no longer looks like the
  copy), the detail says where it may be left. A request that timed out is
  checked the same way: a copy that landed keeps its entry plus a `detail`,
  otherwise the entry says Live may have made it anyway.
- **duplicate: devices on return and main tracks.** With the remote script they
  copy like any other device. Without it they are refused
  (`cannot duplicate devices on return and main tracks`), since the temp-track
  route can't reach them. Instruments, and destinations in the original's own
  container, take the temp-track route either way.
- **duplicate: a copy lands where Live put it.** A track or scene copy is found
  by what is new in the Set, not assumed to follow its source, and every entry
  names its copy where it is after the call, once the later copies have shifted
  it. A palette color Live snapped to is on the entry (`color` and a `detail`),
  for a track, scene, clip or lane copy.
- **duplicate: a group track's copy lists the tracks it took along.** Live
  copies every track inside the group, at any depth, and the group's entry says
  so by their paths after the call: `detail`:
  `also copied the 2 tracks inside this group track: t12 (id 47), t13 (id 48)`.
- **A device, chain or drum-pad copy also answers per destination**, addressed
  by the caller's own spelling of that `toPath` entry. A move Live turned down
  hands back why rather than warning it, so the destination's `detail` says what
  the caller can act on
  (`the destination already has an instrument, and only one is allowed`) instead
  of only that the copy didn't move. It names a rack or a pad rather than a
  clip, and the caller has only what they wrote to match it on. Where nothing
  named a destination — a chain or device appending to its own rack — the entry
  is addressed by the source's `id` or `path` instead. A destination that used
  to drop out with a warning (no rack there, a rack of the wrong kind, a path
  naming something that isn't a pad, a pad copied onto itself, a destination
  Live wouldn't take the copy at) is that entry's `detail` now. So is a source
  no destination could be copied from, such as a return chain: it is reported on
  every destination it was given, and a lone one throws. A copy that landed
  incomplete keeps its entry with a `detail` rather than being rolled back — a
  chain whose devices didn't all cross, a pad copy that layered onto chains
  already there.
