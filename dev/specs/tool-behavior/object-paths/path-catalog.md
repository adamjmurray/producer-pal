# Path Catalog

Every path shape and what it names in the Live API, plus how a path creates
objects. The grammar is in [README.md](README.md#grammar).

## Shapes

| Path           | Names                             | Live API                               |
| -------------- | --------------------------------- | -------------------------------------- |
| `t0`           | regular track, or its arrangement | `tracks 0`                             |
| `rt0`          | return track                      | `return_tracks 0`                      |
| `mt`           | main track                        | `master_track`                         |
| `s3`           | scene                             | `scenes 3`                             |
| `t+`           | a new track, appended             | —                                      |
| `rt+`          | a new return track                | —                                      |
| `s+`           | a new scene, appended             | —                                      |
| `t0/s3`        | session clip slot                 | `tracks 0 clip_slots 3`                |
| `t0/l1`        | second take lane                  | `tracks 0 take_lanes 1`                |
| `t0/l+`        | a new take lane, appended         | —                                      |
| `t0/d1`        | device on a track                 | `tracks 0 devices 1`                   |
| `t0/d+`        | a new device, appended            | —                                      |
| `t0/inst`      | the track's instrument            | the `devices N` whose `type` is 1      |
| `t0/mfx0`      | its first MIDI effect             | the first `devices N` with `type` 4    |
| `t0/afx1`      | its second audio effect           | the second `devices N` with `type` 2   |
| `t0/d0/c1`     | rack chain                        | `... chains 1`                         |
| `t0/d0/c+`     | a new rack chain, appended        | —                                      |
| `t0/d0/rc0`    | rack return chain                 | `... return_chains 0`                  |
| `t0/d0/pC1`    | drum pad                          | `... drum_pads 36`                     |
| `t0/d0/p*`     | catch-all drum pad                | `... chains` with `in_note` -1         |
| `t0/d0/pC1/c1` | one layer of a drum pad           | `... chains N` with that `in_note`     |
| `t0/d0/pC1/c+` | a new layer on that pad           | —                                      |
| `t0/d0/pC1/d0` | device inside a drum pad          | `... drum_pads 36 chains 0 devices 0`  |
| `t0[5\|1]`     | arrangement clip on the main lane | `tracks 0 arrangement_clips N`         |
| `t0/l1[5\|1]`  | arrangement clip on a take lane   | `... take_lanes 1 arrangement_clips N` |
| `[5\|1]`       | a song position, lane unspecified | —                                      |

## Creating by path

Chains auto-create when referenced (up to 16), except the catch-all pad: Live
clamps a drum chain's `in_note` to 0-127, so a `p*` chain can't be made and a
write that would create one refuses instead. An existing one still resolves.
Depth changes nothing: a pad on a Drum Rack nested in another rack's pad
(`t0/d0/pC1/c0/d0/pD1`) creates its chain the same way. Take lanes auto-create
up to the index named, capped at `MAX_TAKE_LANES`.

A `+` is accepted only by the tool that creates that kind of object: `t+`, `rt+`
and `s+` by the create tools, `l+` by `ppal-update-track` (and by
`ppal-duplicate` copying a track onto a lane), `c+` and `d+` by
`ppal-create-device`, `ppal-duplicate` and `ppal-update-device`. Every other
path must name something that already exists, or an index a tool fills in up to.
A tool that only reads or writes an existing object refuses a `+` and names the
tool that takes it. It is a rule about which tool, not about where the `+` sits
in the path.

A take lane is an aspect of its track (it can't exist apart from one, and Live
gives it a name and nothing else), so `ppal-update-track` makes them, with
`t2/l+`; each `l+` in a list appends its own. Putting lanes on
`ppal-create-track` was rejected: a create tool makes standalone objects, and it
would have to tell "make a track" from "make a lane on this one" out of one
`path` list. A `takeLane` param on update-track would be an index beside the
path grammar, for the one object the grammar can already spell, and would have
to answer what `0` means.

`t0/d+` appends a device to the track, `t0/d0/c0/d+` to that chain, and `d<n>`
inserts at n. One marker covers every device type: Live's `insert_device` with
no index appends within the section for the device's own type, so the type is
Live's business, not the path's (`mfx+`/`inst+`/`afx+` would be three spellings
for one behavior). A bare container (`t0`, `t0/d0/c0`, `t0/d0/pC1`) appends too.
It is what results and reads spell a container as, so refusing it would break a
caller pasting a path back, but `d+` is the spelling to teach because it says
what happens.

**An index past the end of a container is refused**, by every tool that places a
device, in the same words
(`"t0/d9" is past the end of a container holding 2 devices`): `ok: false` on
that path's entry, a throw when it was the only path. `d+` is how to append.
Appending anyway would guess what the caller meant, and Live itself silently
drops such an index in a move. The check runs before anything is made, so a
browser device is never loaded for a refused path and no chain or pad layer is
created first: a chain that doesn't exist yet holds no devices, so only index 0
or `d+` is in range there. A path earlier in the list that creates a chain
counts toward later indices; a refused path inserts nothing. Index 0 on an empty
chain is an append, since it is the end.

Live's `insert_chain` only ever appends, so neither `c+` nor `c<n>` can mean
"insert at n": `c<n>` fills in the chains up to n, and `c+` adds one past the
last. Rack return chains can't be created at all. A `c+` must be the last
segment, since the chain it makes is empty.

**Drum Racks.** A new chain in a Drum Rack gets `in_note` -1, the catch-all pad,
which sounds on every note no pad claims, so `t0/d0/c+` there is refused and
points at the pad spelling. Reporting the catch-all in the result would say
where the chain went but not undo it. `t0/d0/pC1/c+` is accepted: a pad holds
layered chains (`pC1/c1` addresses the second), and the pad supplies the note.
The exception is `ppal-duplicate`, since a copy carries its source's `in_note`:
`toPath: "t0/d0/c+"` into a Drum Rack lands on the source's own pad, the same
place the bare rack path names.

## Naming a return in a send

`sendReturn` and `sends[].return` take an id, name, path (`rt0`) or letter
prefix. The order and clash rules are in
[Sends](../clips-playback-and-sends.md#sends).
