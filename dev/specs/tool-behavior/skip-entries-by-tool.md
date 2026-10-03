# Skip entries, tool by tool

How each write tool applies the entry rules in
[Tool Behavior](README.md#skips-no-ops-and-replaced-targets): one entry per
target named, `ok: false` plus a `detail` for a skip, and a `detail` alone for a
target that landed incomplete. This list follows the code; when it disagrees
with a tool, the tool wins.

- **update-clip answers per target named, not per clip reached.** Its targets
  resolve up front, the plan carries which target each clip (and each piece a
  split cut it into) belongs to, and the results are assembled back into call
  order. The `name` and `color` lists pair by that target's place too, so a skip
  doesn't slide the names after it onto the wrong clips and every piece of a
  split takes the name its own target asked for. A target whose path or id found
  no clip, or that the deadline never reached (unless a split already cut it:
  its pieces keep their entries), holds its slot as a skip; so does one whose
  only requested work — a move, a position, a split — was refused outright,
  since where the clip still sits is nothing the caller asked about. A clip
  named twice is updated as its last mention asks; the earlier mention holds its
  slot as a normal entry pointing at the later one, and a clip that was written
  but not as asked keeps its entry with a `detail`: a throw partway, a move
  refused beside a name or a length that landed, a re-create and what it cost, a
  take-lane leftover, a move that replaced the clip already in the destination
  slot. A param the clip can't take — notes, preTransforms, duplicateLoop or
  quantize on an audio clip, warp markers or the audio params (gainDb,
  pitchShift, warpMode, warping) on a MIDI clip, firstStart on a clip that isn't
  looping or past its content end, warping off while looping — is a detail on
  its entry too, and a skip when it was all the call asked of the clip. The move
  and arrangement helpers report all of it on the clip's entry instead of
  warning, through a per-call collector keyed by the clip id the call found; a
  step that writes under a new id — a move re-creates the clip — hands what it
  reports back to the id the caller named. One target never answers with no
  entries: a split whose pieces the rescan can't find says so too. A clip
  another clip in the same call was moved onto is skipped unwritten, with a
  `detail` naming the later clip and no `ok`
  ([replaced targets](README.md#a-later-target-replaces-an-earlier-one)). When
  several clips name one slot, the last one moves there and the others stay put,
  each with a detail naming that clip, or a skip when the move was all it was
  asked.
- **create-clip answers per destination named.** Its `path` list, clip slots and
  arrangement positions mixed, comes back one entry per destination in the order
  the call named them, and `name`/`color` pair by that place — it used to answer
  every clip slot first and the arrangement after. A destination that got no
  clip holds its slot as a skip: a track that won't take the clip, a create Live
  declined, a take lane past the cap, one the deadline never reached. A
  `firstStart` the call can't use — it only lands alongside `looping: true` — is
  a `detail` on that clip's entry rather than a warning, and no `ok`: the clip
  exists.
- **A clip slot past the last scene is a destination, so it is created.**
  create-clip, update-clip's `toPath` and duplicate's `toPath` all make the
  scenes up to a slot that isn't there yet, sharing one helper, and the entry
  reports them as `created: "s8-s9"` (a target that then failed names them in
  its `detail`) — the path alone says what to make, and a caller can't pair its
  own request against scenes it was never told about. Past the auto-create cap,
  and on a track that isn't there, the destination is still refused.
  update-scene's `path` names a target rather than a destination, so it stays a
  refusal, with create-scene named in its `detail`.
- **A take lane reports the params it has no use for.** `ppal-update-track`
  writes a lane's name and nothing else, so everything else the call sent is a
  `detail` on the lane's own entry, which otherwise reads like any other hit.
  `ok: false` only when the lane was neither created nor named, so nothing the
  call asked of it landed.
- **duplicate answers per destination named.** A destination no copy landed at
  keeps its slot as `{path, ok: false, detail}` — a track that won't take the
  clip, a copy Live declined, a take lane past the cap, a re-create that failed,
  a destination the deadline never reached, one the plan dropped because a clip
  slot can't take an arrangement copy. A copy that landed incomplete is a clip
  entry with a `detail`, not a skip: it exists, so losing it from the result
  would cost the caller a clip. The path is spelled the way a copy that landed
  there would report it, so it pastes back into `toPath`.
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
  already there. `count`, which none of these types uses, is still a warning: it
  is about the call, not a destination.
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
  it and the target's entry says `gainDb, pan not applicable to RackDevice` —
  the type, without the label the entry already carries. They stop counting as
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
