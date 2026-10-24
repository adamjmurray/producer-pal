# Skip entries: Live Set, playback and reads

Part of [Skip entries, tool by tool](README.md).

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
  `already changed: created`. A locator made past the song's end whose temp
  clip, session clip or scene Live then won't remove keeps
  `{operation: "create", id, detail}`, the detail saying what stayed. A lone
  refusal throws only when no tempo, time signature or scale was sent; beside
  one it keeps its `ok: false` entry. Those whole-call params are written first
  and read back as before.
- **playback answers per clip slot named** for `play-session-clips` and
  `stop-session-clips`, in `clip` (unwrapped for one). An id naming no session
  clip, a slot that isn't there, and a launch Live threw on hold their slot as
  `{id | path, ok: false, detail}`, and the later slots still fire. A slot named
  twice fires once, by its last mention; the earlier one is
  `{id | path, detail}`. Slots the deadline never reached are skips. A lone skip
  throws.
- **play-session-clips skips an empty slot** as
  `{path, ok: false, detail: "no clip to play"}`, with no `id`, and never fires
  it: Live answers a fired empty slot by stopping whatever its track is playing.
  A group track's slot holds no clip but launches its members' clips in that
  scene, so it fires, and its entry is `{path}` plus a `detail` saying what that
  did to the tracks inside it (all depths, read before the fire):
  `launched t11/s0 (id 31); stopped t12 (id 85), which has no clip in s0`. A
  track with a clip there launches; one with none stops only when it was playing
  or queued and its empty slot has a stop button. A track it doesn't touch isn't
  named, and with none touched there is no `detail`. The other slots still fire,
  and `playing` and the multi-clip transport restart count only the slots that
  fired. `stop-session-clips` on an empty slot still stops its track; on a group
  track's slot it stops every track inside, and the `detail` names those that
  were playing or queued:
  `stopped the tracks in this group track: t10 (id 7), t11 (id 8)`.
- **select has one target**: nothing to list, so a refusal or a failed selection
  throws.
- **The read tools answer per target named, through one `readFanOut`.** A target
  that can't be read holds its slot as `{id | path, ok: false, detail}`, and a
  lone one throws. A multi-target read checks the deadline before each target;
  every target it never reached gets the same skip the write tools give
  (`the request ran out of time; re-run for this <object>`). An empty clip slot
  is a miss: a lone `read-clip` throws `no clip at <path>` (or the group-track
  wording, for a group track's slot), a listed one is a skip, and `read-scene`
  and `read-track` leave it out of their clip lists.
