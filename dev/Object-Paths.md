# Object Paths

A path names a location in the Live Set: `t0/s3` is a session clip slot, `t0/d1`
a device. One grammar serves every tool that needs to say _where_.

Status: the grammar below is the standard. Not all of it ships yet — see
[dev/plans/Path-Standardization.md](plans/Path-Standardization.md) for what's
built and what's left. The rejected alternatives are in
[ADR-0025](decisions/0025-object-path-grammar.md).

## The invariant

**A segment's index is the Live API index.** `t0/l1` is `take_lanes 1`, `t0/s3`
is `clip_slots 3`. No off-by-one, no 1-based segment, anywhere.

`p<note>` is the single exception: Live indexes `drum_pads` by MIDI note, so the
segment carries a note name. Nothing else gets an exception without an ADR.

## Grammar

```
path    := root ( "/" segment )*
root    := "t"<n> | "rt"<n> | "mt" | "s"<n>
segment := "s"<n> | "l"<n> | "l+" | "d"<n> | "c"<n> | "rc"<n> | "p"<note> | "p*"
```

All indices are 0-based. `<note>` is a note name (`C1`, `F#2`); `p*` is the drum
rack's catch-all pad.

Segments have to nest the way Live does, and a path that doesn't is a parse
error rather than a missing object later: a track holds devices, a device holds
chains, return chains, and drum pads, and each of those holds devices. A drum
pad also takes a `c<n>`, picking among the chains that share its note. So
`t0/c0` and `t0/d0/d1` are rejected.

| Path           | Names                             | Live API                              |
| -------------- | --------------------------------- | ------------------------------------- |
| `t0`           | regular track, or its arrangement | `tracks 0`                            |
| `rt0`          | return track                      | `return_tracks 0`                     |
| `mt`           | master track                      | `master_track`                        |
| `s3`           | scene                             | `scenes 3`                            |
| `t0/s3`        | session clip slot                 | `tracks 0 clip_slots 3`               |
| `t0/l1`        | second take lane                  | `tracks 0 take_lanes 1`               |
| `t0/l+`        | a new take lane, appended         | —                                     |
| `t0/d1`        | device on a track                 | `tracks 0 devices 1`                  |
| `t0/d0/c1`     | rack chain                        | `... chains 1`                        |
| `t0/d0/rc0`    | rack return chain                 | `... return_chains 0`                 |
| `t0/d0/pC1`    | drum pad                          | `... drum_pads 36`                    |
| `t0/d0/p*`     | catch-all drum pad                | `... chains` with `in_note` -1        |
| `t0/d0/pC1/d0` | device inside a drum pad          | `... drum_pads 36 chains 0 devices 0` |

Chains auto-create when referenced (up to 16), except the catch-all pad: Live
clamps a drum chain's `in_note` to 0-127, so a `p*` chain can't be made and a
write that would create one refuses instead. An existing one still resolves.
Take lanes auto-create up to the index named, capped at `MAX_TAKE_LANES`.

Each `l+` in a list appends its own lane, in the order written — `t0/l+,t0/l+`
gets two. Cycling doesn't multiply them: when a shorter destination list repeats
to cover a longer `arrangementStart` list, the repeats reuse the lane their `l+`
already made, so one written `l+` is always one lane.

## Which shapes are legal where

A path parses the same everywhere; what a tool accepts differs by what can
occupy the location.

| Shape             | Clips            | Devices   | Tracks | Scenes |
| ----------------- | ---------------- | --------- | ------ | ------ |
| `t0`              | ✅ arrangement   | ✅ append | ✅     | —      |
| `rt0`, `mt`       | ❌ no clip slots | ✅        | ✅     | —      |
| `s3`              | ❌               | ❌        | —      | ✅     |
| `t0/s3`           | ✅ clip slot     | ❌        | —      | —      |
| `t0/l1`, `t0/l+`  | ✅ arrangement   | ❌        | —      | —      |
| `t0/d1` and below | ❌               | ✅        | —      | —      |

A bare `t0` means the track itself for a device or track operation, and that
track's **arrangement main lane** for a clip operation — a session clip needs a
scene coordinate, so there is no ambiguity to resolve.

Rejecting a shape must name the caller's own concept: a clip tool given `t0/d0`
says clips go to a track or a slot, not that device paths are malformed.

## `path` vs `toPath`

- `path` — where the object is, or where a new one goes.
- `toPath` — where it moves or gets copied to. **Only on tools that also name a
  source** (`ids`, `id`, or their own `path`).

So `create-clip` and `create-device` use `path` for a destination: there is no
source to distinguish it from.

## Take lanes

The main arrangement lane has **no segment** — `t0` is it. `Track.take_lanes`
excludes the main lane, so `l0` is the first take lane and the segment index is
the Live API index like every other segment.

`takeLane` (1-based, `0` = main) is a hidden alias mapping `N → l(N-1)` and
`0 → no segment`. `takeLaneName` stays a published param: it is a property of a
lane being created, not an address.

**Writes to and from a lane re-create the clip**, because Live's arrangement
duplicate handles neither direction: `TakeLane` has no duplicate API, and
`Track.duplicate_clip_to_arrangement` silently no-ops when the _source_ is a
take-lane clip. So `duplicate` copies main→lane, lane→lane, and lane→main
(promote) by reading the notes and building a new clip — MIDI only, and envelope
automation is dropped.

**A lane is one-way**: nothing removes a take lane or a clip on one, so anything
needing the original gone is impossible, not unimplemented. `update-clip`'s
`arrangementStart` is the case to remember — a move is copy-then-delete, and the
delete can't happen, so it warns and leaves the clip alone rather than silently
copying. Deleting and comping stay in Live's UI.

## Tolerance

Four tiers, in order of preference.

1. **Hidden params.** `slot`, `slots`, `toSlot`, `devicePath`, `takeLane` are
   deprecated — accepted, warned, going away. `trackIndex` and `sceneIndex` on
   clip tools are permanent aliases: models reach for them unprompted, and
   catching the guess beats a round trip. See
   [hidden-param.ts](../src/tools/shared/tool-framework/hidden-param.ts).
2. **Tolerant values.** `"0/3"` is honored as `t0/s3` with a warning — it is
   what results said before 2.2.0, so it is a well-founded guess, not a typo. A
   bare `"0"` is honored only where the tool has exactly one legal
   single-segment shape (`create-clip` → `t0`; `read-clip` needs a scene, so it
   errors).
3. **Surplus segments narrow.** A path carrying more than the action needs is
   narrowed rather than refused: `ppal-playback`'s `play-scene` reads `t0/s1` as
   scene 1, because launching a scene fires every track and the track is spare.
   Silently — the caller already named the scene, so there is nothing to report.
   Only surplus bends. A path _missing_ what the action needs still errors,
   because there is nothing to recover, and it stays an error even where the
   reverse recovery looks symmetric: `play-session-clips` with `s3` is refused,
   since firing clips one at a time is a different Live call than launching the
   scene.
4. **Conflicts throw.** Two params naming different targets is never resolved by
   picking one. Honoring one and dropping the other is the silent
   wrong-destination bug this grammar exists to prevent. A path that names the
   same target twice over is not a conflict — `play-scene` with `t0/s1,t2/s1`
   fires scene 1.

## Results

Every write result — create, update, duplicate — reports `path` beside `id`, so
the next call can address what was just written without rebuilding the path from
indices. Clip results report nothing else positional: no `slot`, no
`trackIndex`. `delete` is the exception: after deleting `t2`, that path names a
different track, so a deleted object reports none.

| Object                 | Result                                      |
| ---------------------- | ------------------------------------------- |
| track                  | `path: "t0"` (or `rt0`, `mt`)               |
| scene                  | `path: "s2"`                                |
| device or chain        | `path: "t0/d0/c1/d0"`                       |
| session clip           | `path: "t0/s3"`                             |
| arrangement clip       | `path: "t0"`, `arrangementStart: "5\|1"`    |
| arrangement, take lane | `path: "t0/l1"`, `arrangementStart: "5\|1"` |

A clip slot pastes straight back into any `path`/`toPath` param. An arrangement
one doesn't address that clip — it names the track the clip is on, which is what
a destination needs and not what a source needs. So it works as a destination
(`create-clip`, `duplicate`), and a tool that wants one specific clip wants its
id. `select` takes it and selects the track.

Two objects report no path, because the grammar can't spell them without going
looking: a chain reached through a pad segment (`… drum_pads 36 chains 0 …`,
whose rack-relative chain index isn't in the path), and anything that resolved
to nothing.

Error messages follow: name the path and show the fix, never restate a
requirement in index terms.

## Not paths

Deliberate omissions, reasoned in
[ADR-0025](decisions/0025-object-path-grammar.md): arrangement clips (addressed
by id), locators (`locator` param, by id or name), track/scene addressing on the
read and update tools (`trackIndex` / `sceneIndex` stay), and
new-track/new-scene positions (they create the location rather than address
one).
