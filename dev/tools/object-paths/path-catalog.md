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
and `s+` by the create tools, `l+` by `ppal-update-track`, because a take lane
is an aspect of its track rather than an object a tool makes on its own
([ADR-0043](../../decisions/0043-a-plus-belongs-to-the-tool-that-creates-the-object.md)).
`c+` is the chain's, taken by the tools that make chains: `ppal-create-device`,
`ppal-duplicate` and `ppal-update-device`
([ADR-0045](../../decisions/0045-c-plus-appends-a-rack-chain.md)). `d+` is the
device's, taken by those same three
([ADR-0046](../../decisions/0046-d-plus-appends-a-device.md)). Every other path
must name something that already exists, or an index a tool fills in up to. A
tool that only reads or writes an existing object refuses a `+` and says which
tool takes it.

`t0/d+` appends a device to the track, `t0/d0/c0/d+` to that chain, and `d<n>`
inserts at n. A bare container (`t0`, `t0/d0/c0`, `t0/d0/pC1`) appends too — it
is what results and reads spell a container as — but `d+` is the spelling to
teach, since it says what happens. One marker covers every device type: Live's
`insert_device` appends within the section for the device's own type, so nothing
has to say which.

Live's `insert_chain` only ever appends, so neither `c+` nor `c<n>` can mean
"insert at n": `c<n>` fills in the chains up to n, and `c+` adds one past the
last. Rack return chains can't be created at all. A `c+` on a Drum Rack is
refused and points at the pad spelling — a new, empty chain has no note, so it
would land on the catch-all pad and sound on every note no pad claims. On a pad
(`t0/d0/pC1/c+`) it appends a layer, which does have a note.
