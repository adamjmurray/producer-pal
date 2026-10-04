# Skip entries, tool by tool

How each write tool applies the entry rules in
[Tool Behavior](README.md#skips-no-ops-and-replaced-targets): one entry per
target named, `ok: false` plus a `detail` for a skip, and a `detail` alone for a
target that landed incomplete. This list follows the code; when it disagrees
with a tool, the tool wins.

- **update-clip answers per target named, not per clip reached.** Its targets
  resolve up front, and the entries come back in call order: a split target's
  pieces and a lengthened clip's tiles come right after its own. A path that
  can't be parsed refuses the call, and so does a `toPath` entry that can't be
  (`tX`). A path or id that finds no clip, a `toPath` entry that parses but
  names no place a clip can go (a scene), a target whose only requested work (a
  move, a position, a split) was refused, and a clip an earlier write of the
  call already cleared hold their slot as a skip. The `name` and `color` lists
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
  shortens or resizes, so a refused move leaves the clip as it was. A param the
  clip can't take is a detail on its entry, and a skip when it was all the call
  asked. The move and arrangement helpers report on the clip's entry through a
  per-call collector keyed by the clip id; a step that writes under a new id
  hands what it reports back to the id the caller named. Moves are written in an
  order that clears nobody's way, and one that can't be ordered is refused with
  the clip it would land on named. Known gap: if Live fails while a lengthened
  clip's last partial tile is in the holding area past the track's clips, that
  holding copy can be left there unreported.
- **create-clip answers per destination named.** Its `path` list, clip slots and
  arrangement positions mixed, comes back one entry per destination in the order
  the call named them, and `name`/`color` pair by that place — it used to answer
  every clip slot first and the arrangement after. A destination that got no
  clip holds its slot as a skip: a track that isn't there or won't take the
  clip, a transform its meter can't read, a create Live declined, a take lane
  past the cap, one the deadline never reached. A `firstStart` the call can't
  use — it only lands alongside `looping: true` — is a `detail` on that clip's
  entry rather than a warning, and no `ok`: the clip exists.
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
  slot as a skip. The `name`, `color`, routing and `sendReturn` lists pair by
  the target's place, so a skip doesn't slide them. A track named twice (id and
  path, or an id repeated) and a take lane named twice (by id and by path) are
  written as their last mention asks: the earlier keeps `{ id | path, detail }`
  with no `ok`, and becomes `ok: false` when the last one lands nothing. Two
  `l+` entries are two new lanes, not one. A throw after part of a target landed
  keeps its normal entry plus
  `<error>; already changed: name, color, gainDb, send A-Reverb, take lane l0 made`;
  later targets still run, and the deadline skips the ones it never reached. A
  `sends` entry a later one replaced is `{ return, returnId, detail }` with no
  `ok`, the same for a rack chain's sends in update-device; `ok: false` stays
  for a send that really failed.
- **update-device's `macroCount` says which mapped macros it hid.** Lowering the
  count hides macros and keeps their mappings, so a hidden one is no loss but
  would otherwise vanish unremarked. With the remote script, a rack with
  mappings is asked which macros are mapped before anything is written, and the
  entry's `detail` names those the count hid
  (`macro 7 hidden; its mapping is kept`). Without it, or when it can't answer,
  the detail says the hidden range keeps any mappings, and why the check failed.
  A remote script too old to have the route counts as not running. A target that
  also loads a preset isn't asked, since a replaced device makes the answer
  moot. The question is asked before the write, so nothing can fail after the
  count has changed. A rack Live won't take below 1 macro says where the count
  landed.
- **update-device's `pitchBendRange` and `notePitchBendRange` are `params`
  entries written through the remote script.** Only a Simpler has them (on
  another device the name is not found, as any unknown param). Each entry comes
  back as `{ name, value }` when it read back as asked, and `ok: false` with the
  reason otherwise: not a whole number in range (nothing is sent for it), the
  remote script isn't running or is too old ("needs the Producer Pal remote
  script"), the remote script refused, or it read back different
  (`landed at 11, not 12`). The entries are written ahead of the target's other
  writes, one call per Simpler, the last of each name. A route that doesn't
  answer may still have written: the entry says the value _may have changed_ and
  keeps its place (never a lone throw), and the Simplers after it in the call
  say they weren't tried and to re-run. A call with no time left says the value
  wasn't set and names the target to re-run. Where the sync param write is all
  there is (create-device, a rack's `pC1/d0/` shortcut) the entry says to use
  update-device on the Simpler's own path.
- **A take lane reports the params it has no use for.** `ppal-update-track`
  writes a lane's name and nothing else, so everything else the call sent is a
  `detail` on the lane's own entry, which otherwise reads like any other hit.
  `ok: false` only when the lane was neither created nor named, so nothing the
  call asked of it landed.
- **create-device answers per path named.** A path that finds no place for a
  device (no such track or rack, a scene, an index past the end, a device Live
  turned down, one the deadline never reached) holds its slot as
  `{path, ok: false, detail}`, and the other paths are still made. A device that
  is in the Set keeps its normal entry (`id`, `path`) when a later step threw (a
  name Live refused, a browser load's cleanup), plus a `detail` saying why and
  what landed: `<error>; already changed: device created`. Entries name each
  device where it sits after the call, since a later insert can push an earlier
  one down a slot. The `name` list pairs by the path's place, so a skip doesn't
  slide it. A `preset` file path that several same-named packs (or Places
  folders with no disk path) could hold is never guessed: that path's entry is
  `{path, ok: false, detail}` naming each candidate by its browser `uri`, and
  says to load the file from a uniquely named folder.
- **A `preset` name (create-device, update-device) is found wherever it's
  filed.** Live's browser is searched first, under the named device or, for
  update-device, then anywhere. A name it lacks is looked up in Live's library
  database, never by walking the Drums or Sounds sections (that can crash Live),
  and loads by file. The match is the same as in the browser: the whole name,
  any case, with or without `.adv`/`.adg`. One file loads; several refuse,
  listing their paths. Only the device's presets count when a device is named
  (racks by their rack class; any other device by the class of the presets filed
  in or just under its folder). update-device asks for the target's presets
  first and takes any preset only when it has none by that name. A plug-in or
  Max device named on create-device has no class to filter by, so its name isn't
  looked up in the database. The database is read as of Live's last save, so a
  preset added this session may not be found; with no database, today's "no
  preset" error stands.
- **A preset file is checked against the device a call names.** create-device
  with a `device` and an absolute file path (a Windows drive or network share
  too) reads the gzipped XML and refuses a file for another device, as it does a
  browser path: `preset "<path>" is not a preset for <device>`. An `.adv` is for
  the device its root element names; an `.adg` for the rack it holds, or (for a
  device that isn't a rack) the device it is built around, the first device of
  its first chain. A rack that merely holds the device isn't for it. A device
  with no known class (plug-ins, Max devices), or a file that can't be read,
  isn't checked. update-device takes any file, as it does any preset.
- **A preset that holds the Producer Pal device is refused after Live loads
  it.** The remote script looks through what `/load` or `/hotswap` loaded
  (chains, return chains, drum pads) and deletes what holds it, by device name
  (a renamed Producer Pal isn't caught). `/load`: 409 "nothing was loaded", so
  create-device's entry is `{path, ok: false, detail}`. `/hotswap`: Live had
  already replaced the device and can't give it back, so the slot is left empty,
  and the 409 says so. update-device's entry names the target by `path` (the old
  id is gone) with
  `preset not loaded: <why>; already changed: the device was replaced and removed; its slot is empty`,
  and nothing else is written to that target. Later targets still load at their
  current path. If the delete fails, the 409 says where the device is. Only a
  preset can hold it: Producer Pal loaded by name is judged on its own.
- **create-track answers per path named.** A track Live didn't make (an insert
  it refused, an answer with no track, one the deadline never reached) holds its
  slot as `{path, ok: false, detail}` in the caller's spelling (`t+`, `t2`,
  `rt+`), and the other tracks are still made. A track that exists keeps its
  normal entry (`id`, `path`) when a later step threw, plus
  `<error>; already changed: track created`. A failed insert moves the tracks
  after it, so those are planned again from what the Set holds, and every entry
  names its track where it sits after the call. `arm` on a return track is a
  `detail` on its entry, in update-track's words, not a failure: the track was
  made.
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
- **delete answers per target named.** A path that can't be parsed refuses the
  call. A path that parses but names the wrong kind of thing, an object this
  call won't remove (the Producer Pal device or its track, a take lane, a chain
  of the wrong type), or a delete Live ignored or threw on holds its slot as
  `{id | path, ok: false, detail}` in the caller's own spelling, and the other
  targets still run. A target with nothing there is a no-op: its spelling and
  `detail: "nothing to delete"`, no `ok`, and a lone one is satisfied. A removed
  object reports `{id, deletedPath}`, its address from before the call: every
  address is read before the first delete, since deleting shifts later siblings.
  A drum pad is cleared, not removed, so it reports `path`. An object named
  twice is deleted once, by its last mention; the earlier ones are
  `{id | path, detail}` with no `ok`, and fail with the last one if it fails. A
  drum chain Live parked on a spare pad before a throw keeps its normal entry,
  `<error>; already changed: moved the chain to a spare drum pad`. Targets are
  deleted from the highest position down, but entries stay in call order.
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
  Nothing is `deleted: true`. A copy that lands on the source clip itself is
  made after the others, which copy it whole; when a copy that must go last also
  has to come first to be cut short, the call is refused before anything is
  written.
- **duplicate: Live fails partway.** A copy that landed keeps its normal entry
  (`id`, where it is now) plus a `detail` of what landed and what didn't: a
  track or scene copy whose naming, coloring or clips failed, a copy Live threw
  on after making it, a device whose temp track couldn't be deleted, a pad whose
  chains couldn't be named, a take lane made for a clip that then failed. Only a
  copy nothing of which landed is `ok: false`.
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
- **update-live-set answers per locator named.** `locatorId`, `locatorTime` and
  `locatorName` make one target list, and `locator` carries its entries,
  unwrapped for one. A locator that can't be created, renamed or reached holds
  its slot as `{id | time | name, ok: false, detail}` in the caller's own
  spelling; one that needed no work (`delete` of a missing one) is a no-op with
  a `detail`. A locator named twice (by id and time, or a name that matches it)
  is acted on once, by the last mention; the earlier ones are
  `{id | time | name, detail}` with no `ok`, and fail with the last one if it
  fails. A locator made and then refused its name keeps
  `{operation: "create", id, detail}`, the detail ending
  `already changed: created`. A lone refusal throws only when no tempo, time
  signature or scale was sent; beside one it keeps its `ok: false` entry. Those
  whole-call params are written first and read back as before.
- **playback answers per clip slot named** for `play-session-clips` and
  `stop-session-clips`, in `clip` (unwrapped for one). An id naming no session
  clip, a slot that isn't there, and a launch Live threw on hold their slot as
  `{id | path, ok: false, detail}`, and the later slots still fire. A slot named
  twice fires once, by its last mention; the earlier one is
  `{id | path, detail}`. Slots the deadline never reached are skips. A lone skip
  throws.
- **select has one target**: nothing to list, so a refusal or a failed selection
  throws.
- **update-device: a target dead by its turn is a skip.** Targets resolve up
  front, so one inside a rack that an earlier target's `preset` replaced (or one
  an earlier forced pad-sample swap deleted) is gone when its turn comes. Every
  target kind is checked before any work: its entry is
  `{ id | path, ok: false, detail: "no longer exists: an earlier target in this call replaced it or its rack" }`,
  and nothing is written to it. A target that only moved keeps its path and is
  written as usual.
- **update-device's per-param drop paths became entries.** A `params` list
  answers with one entry per param sent: a disabled param, an ambiguous name, an
  unreadable value, a unit that can't be checked, a write Live ignored, a nested
  path that resolved to nothing, a resolution that threw, a param a chain or pad
  has no use for — each is `ok: false` with a detail on that param's own entry
  now, and warns nowhere. A param whose value Live changed on the way in (a
  clamp, the nearest step of a coarse ladder) reports the value it reads as plus
  a detail, and no `ok`. A specialized pseudo-param answers the same way: a
  `PseudoParam.write` returns the reason it refused a value rather than a
  boolean, so the refusal reaches the caller as that param's own entry.
- **The params that never go through `params` report on the target.** `gainDb`,
  `pan`, `mute`, `solo`, `sends` and the rest are their own arguments, so there
  is no param entry to hold them: a kind of object with no use for one collects
  it and the target's entry says `gainDb, pan ignored: can't be set on a device`
  — the type, without the label the entry already carries. They stop counting as
  work asked of that target, so a target they were the whole of keeps its slot
  as a skip and a lone one throws.
- **A rack's return chains are the rack's, so a send that names none is the
  chain's.** `sends` (and the `sendGainDb`/`sendReturn` pair) on a chain or pad
  naming no return chain of its rack is that send's own
  `{return, ok: false, detail}` on the chain's entry, the return spelled the way
  the caller wrote it. update-track's own three — no mixer, no sends, no send
  for that return — are facts about the track rather than about the Live Set,
  and answer the same way. Which return _tracks_ exist is a fact about the Set,
  so it is resolved once for the call, but a send naming none is still that
  send's own `{return, ok: false, detail}` on every track the call named.
- **A type-addressed device path that names nothing reports once.** `t0/inst` on
  a track with no instrument substitutes a fallback index, and what the
  container does hold rides back on the resolution instead of a warning: the
  target's own report carries it
  (`nothing at path "t0/inst": t0 has no instrument`), whether that is an
  entry's `detail` or a single-target error. The fallback index lands one past
  the last device, so `delete` reads it as the empty place an out-of-range
  `d<n>` names: `nothing to delete`, and no `ok`.
- **Chains a device path makes on the way are reported, also when the call then
  fails.** create-device, update-device (`toPath`, `wrapInRack`) and a device
  copy's `toPath` resolve a destination through one resolver, which makes the
  chains a path names past the last one. A success reports them as
  `created: "c1-c2"` on the entry (the rack's, for `wrapInRack`). A failure
  after them — a refused insert or move, a browser load that fails, a path that
  then names no device, Live making only some of the chains — ends its reason
  with `; left 3 empty chains: c1-c3`, the chain a `c+` appended included, since
  the path names that chain only once it exists. A failed move or copy names
  them in its reason instead of `created`. A lone target throws that reason; in
  a list it is the target's skip `detail`, the way created scenes are named: no
  device landed, so `ok: false`. Chain and drum-pad copies make no chains
  through a path (they append their own copy), so they have nothing to name.
  Wrapping an instrument keeps its undo-then-throw, and the chains `toPath` made
  before it began stay in the error. An instrument wrap's `toPath` slot reads
  against the container as the call found it, though Live keeps an instrument
  ahead of audio effects, so the rack may land before them.
- **The read tools answer per target named, through one `readFanOut`.** A target
  that can't be read holds its slot as `{id | path, ok: false, detail}`, and a
  lone one throws. A multi-target read checks the deadline before each target;
  every target it never reached gets the same skip the write tools give
  (`the request ran out of time; re-run for this <object>`). An empty clip slot
  is a miss: a lone `read-clip` throws `no clip at <path>`, a listed one is a
  skip, and `read-scene` and `read-track` leave it out of their clip lists.
