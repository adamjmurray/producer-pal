# Object Paths

A path names a location in the Live Set: `t0/s3` is a session clip slot, `t0/d1`
a device. One grammar serves every tool that needs to say _where_.

Status: this describes the **end state**. Everything except the `[...]`
coordinate and `loc:` ships today; see
[dev/plans/Path-Standardization.md](plans/Path-Standardization.md) for what's
built and what's left, and treat this file as the reference an implementation is
checked against. The rejected alternatives are in
[ADR-0025](decisions/0025-object-path-grammar.md) and
[ADR-0037](decisions/0037-arrangement-time-is-part-of-the-path.md).

## Why a path exists

Three rules the tool interfaces are built on. Everything below derives from
them, and a proposed exception has to argue with one of them.

1. **An object that exists is addressed by id or path**, on every tool that
   takes a target, and every result reports both.
2. **An object being created has no id yet**, so it is addressed by path alone.
3. **An error or warning about an object names its path and its id** — or the
   path alone, when there is no id to know (a path that resolved to nothing, an
   object not created yet).

## The invariant

**A segment's index is the Live API index.** `t0/l1` is `take_lanes 1`, `t0/s3`
is `clip_slots 3`. No off-by-one, no 1-based segment, anywhere.

`p<note>` is the single exception: Live indexes `drum_pads` by MIDI note, so the
segment carries a note name. Nothing else gets an exception without an ADR.

## Grammar

```
path     := ( root ( "/" segment )* )? coord?
root     := "t"<n> | "rt"<n> | "mt" | "s"<n> | "t+" | "rt+" | "s+"
segment  := "s"<n> | "l"<n> | "l+" | "l=" | "d"<n> | "c"<n> | "rc"<n> | "p"<note> | "p*"
coord    := "[" position "]"
position := <bar|beat> | "loc:" <locator>
```

All indices are 0-based. `<note>` is a note name (`C1`, `F#2`); `p*` is the drum
rack's catch-all pad. A path is a root with segments, a coordinate, or both —
never neither.

**Split on `,` and `/` only at bracket depth 0.** Both separators occur inside a
coordinate: a bar|beat position takes `±n<fraction>` offsets (`1|1-n/4`), and a
locator name is user-typed and may contain anything. This is one lexing rule and
it is not optional — it holds wherever a path param is cut up, including the
list-length check, which would otherwise call one destination two and refuse a
call for a mismatch that isn't there. Peeling the coordinate off first leaves a
body with no brackets, so splitting that on `/` needs no depth of its own.

The `+` roots name a place rather than a thing, so only the create tools take
one, and only as a whole path — `t+/s0` names nothing yet. On create, `t2`
inserts at 2 while `t+` appends. `rt<n>` is refused there: Live always adds a
return track at the end, so a path naming a position it can't honor would
silently create the track somewhere else.

Segments have to nest the way Live does, and a path that doesn't is a parse
error rather than a missing object later: a track holds devices, a device holds
chains, return chains, and drum pads, and each of those holds devices. A drum
pad also takes a `c<n>`, picking among the chains that share its note. So
`t0/c0` and `t0/d0/d1` are rejected.

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
| `t0/l=`        | the lane the `l+` before it made  | —                                      |
| `t0/d1`        | device on a track                 | `tracks 0 devices 1`                   |
| `t0/d0/c1`     | rack chain                        | `... chains 1`                         |
| `t0/d0/rc0`    | rack return chain                 | `... return_chains 0`                  |
| `t0/d0/pC1`    | drum pad                          | `... drum_pads 36`                     |
| `t0/d0/p*`     | catch-all drum pad                | `... chains` with `in_note` -1         |
| `t0/d0/pC1/c1` | one layer of a drum pad           | `... chains N` with that `in_note`     |
| `t0/d0/pC1/d0` | device inside a drum pad          | `... drum_pads 36 chains 0 devices 0`  |
| `t0[5\|1]`     | arrangement clip on the main lane | `tracks 0 arrangement_clips N`         |
| `t0/l1[5\|1]`  | arrangement clip on a take lane   | `... take_lanes 1 arrangement_clips N` |
| `[5\|1]`       | a song position, lane unspecified | —                                      |

Chains auto-create when referenced (up to 16), except the catch-all pad: Live
clamps a drum chain's `in_note` to 0-127, so a `p*` chain can't be made and a
write that would create one refuses instead. An existing one still resolves.
Take lanes auto-create up to the index named, capped at `MAX_TAKE_LANES`.

Each `l+` in a list appends its own lane, in the order written — `t0/l+,t0/l+`
gets two. One written `l+` is always one lane, however many clips land on it.

`l=` names the lane the `l+` before it appended, which is how a stack of takes
at chosen bars is written: `t0/l+[9|1],t0/l=[13|1]` is one new lane holding
both, where two `l+` would be two lanes. An `l=` with no `l+` before it in the
same list is refused up front — the lanes the earlier entries appended are
permanent, and Live has no delete, so a call that failed partway would strand
them.

## Song-timeline positions

A point on the song timeline has two spellings, and **every param that takes one
takes both**: a bar|beat position (`5|1`, song meter), or `loc:<name>` naming a
locator. `loc:` also accepts a locator id (`loc:locator-0`), and `locator:` is
accepted as an undocumented spelling of the prefix.

The prefix is **required, never sniffed**. Resolving a bare `"Verse"` by name
because it doesn't look like bar|beat would turn a locator named `5|1`, or a
typo'd bar|beat, into a silent name lookup.

This is what the `[...]` coordinate holds, and what `playback`'s `startTime`,
`loopStart` and `loopEnd`, `update-clip`'s `arrangementSplit`, and
`arrangementStart` on `create-clip`, `update-clip` and `duplicate` take
directly. The pairs that used to spell the second half as its own param —
`startLocator`, `loopStartLocator`, `loopEndLocator`, `duplicate`'s `locator` —
are retired: still accepted, no longer published, folded onto the position they
belonged to.

**Song timeline only.** `create-clip`'s `start` and `firstStart` are
clip-relative and must not accept `loc:`.

Managing locators is separate and unchanged: `update-live-set`'s
`locatorOperation` / `locatorId` / `locatorTime` / `locatorName` treat a locator
as an object to create, delete or rename, not as a coordinate.

## Which shapes are legal where

A path parses the same everywhere; what a tool accepts differs by what can
occupy the location.

| Shape                     | Clips            | Devices   | Tracks | Scenes |
| ------------------------- | ---------------- | --------- | ------ | ------ |
| `t0`                      | ✅ arrangement   | ✅ append | ✅     | —      |
| `rt0`, `mt`               | ❌ no clip slots | ✅        | ✅     | —      |
| `s3`                      | ❌               | ❌        | —      | ✅     |
| `t0/s3`                   | ✅ clip slot     | ❌        | —      | —      |
| `t0/l1`, `t0/l+`, `t0/l=` | ✅ arrangement   | ❌        | —      | —      |
| `t0/d1` and below         | ❌               | ✅        | —      | —      |
| `t0[5\|1]`, `t0/l1[5\|1]` | ✅ arrangement   | ❌        | —      | —      |
| `[5\|1]`                  | ✅ arrangement   | ❌        | —      | —      |

A bare `t0` means the track itself for a device or track operation, and that
track's **arrangement main lane** for a clip operation — a session clip needs a
scene coordinate, so there is no ambiguity to resolve.

Rejecting a shape must name the caller's own concept: a clip tool given `t0/d0`
says clips go to a track or a slot, not that device paths are malformed.

### Complete and partial

An arrangement location has two halves, the lane and the time, and a path may
name either or both:

| Path       | As a source             | As a destination                    |
| ---------- | ----------------------- | ----------------------------------- |
| `t0[5\|1]` | the clip starting there | that lane, that position            |
| `t0`       | ❌ names many clips     | that lane, keep the clip's position |
| `[5\|1]`   | ❌ names many clips     | keep the clip's lane, that position |

**Complete on create.** A create tool has no source to borrow the other half
from, so an arrangement path must name both — `t0` alone and `[5|1]` alone are
errors there.

**Complete as a source.** A partial path names more than one clip, so a tool
addressing a specific clip refuses it. Both partials work as destinations.

`t0[5|1]` means **starts at**, not covers: a clip running from 3|1 through bar 6
is not at `[5|1]`. That path resolves to nothing, and the call warns and skips
like any other target that isn't there (ADR-0035).

### Which lists pair and which broadcast

A value that **fully determines a location pairs 1:1** with the items; anything
else broadcasts one value across them (ADR-0031). That single rule covers what
used to be a carve-out:

- `t0/s3` can't broadcast — a slot holds one clip, so three clips into one slot
  destroys two.
- `[5|1]` can — each source keeps its own lane, so the landing spots differ.
- `name` and `color` can — a property, not a place.

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

**A lane is one-way**: nothing removes a take lane or a clip on one. A move off
a lane gets as close as Live allows — `update-clip` copies the content to the
destination (another lane, another track, or a session slot) and then empties
the original in place, leaving a muted `(moved) ...` placeholder it warns the
user to delete. MIDI really empties — the notes go. Audio can't: a clip's sample
can't be swapped, and writing a silent clip over it fails too, because an
arrangement clip's extent can't be stretched from the LOM (`end_marker` and
`loop_end` accept the write, `end_time` doesn't follow). So an audio take is
only muted. Everything else that needs the original gone (`arrangementSplit`,
`arrangementLength`, `ppal-delete`) still warns and skips. Deleting and comping
stay in Live's UI.

## Tolerance

Four tiers, in order of preference.

1. **Hidden params.** `slot`, `slots`, `toSlot`, `devicePath`, `takeLane` are
   deprecated — accepted, warned, going away, and so is every param a single
   spelling replaced. `startLocator`, `loopStartLocator` and `loopEndLocator`
   fold into the position they belonged to, as `loc:<what the caller sent>`. So
   does every index param the path replaced: `trackType` and `trackIndex` on
   `read-track` and `select`, `sceneIndex` on `read-scene`, `select` and
   `create-scene`, and `trackIndex` on `create-track`. `create-track`'s
   `type: "return"` goes the same way, trimmed out of the published enum but
   still accepted — `rt+` asks for one now. `arrangementStart` on `create-clip`,
   `update-clip` and `duplicate` joins them once the coordinate ships — a
   deprecation with a long runway, not a permanent alias: it is a name we
   coined, so a model that never reads it in the Skills has no reason to emit
   it, and the runway is for people scripting Live. `trackIndex` and
   `sceneIndex` on the _clip_ tools are permanent aliases, not part of that
   migration: models reach for them unprompted, and catching the guess beats a
   round trip. See
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
4. **Never pick one.** Honoring one param and dropping the other is the silent
   wrong-target bug this grammar exists to prevent. What to do instead depends
   on what the param names:
   - **A source — throw.** Where the call acts on one target (`read-clip`,
     `read-device`, `read-track`, `read-scene`, `update-device`, `playback`'s
     `play-scene`), two params naming different things has no answer, so it
     errors. Naming the same target twice over is not a conflict: `play-scene`
     with `t0/s1,t2/s1` fires scene 1, and `read-clip` takes an `id` that sits
     at the `path`.
   - **A set — union.** Where the call already acts on a list (`delete`,
     `duplicate`, `update-clip`, `update-track`, `update-scene`, `playback`'s
     clip actions), `id` and `path` both name members of it, so the targets
     combine. `delete` and `playback` also collapse duplicates, because firing
     or deleting an object twice is a different Live call than doing it once.
     The update tools don't: writing the same value twice lands the same way,
     and a slot per entry is what keeps a paired `name` or `color` list aligned.
     Neither does `duplicate` — a source named twice is two copies.

## Results

Every write result — create, update, duplicate — reports `path` beside `id`, so
the next call can address what was just written without rebuilding the path from
indices. No result repeats that address as an index: no `slot`, no `trackIndex`,
`sceneIndex`, `deviceIndex` or `returnTrackIndex` — no exceptions, so there is
nothing to remember. `delete` is the one place a result carries no path at all:
after deleting `t2`, that path names a different track.

| Object                 | Result                        |
| ---------------------- | ----------------------------- |
| track                  | `path: "t0"` (or `rt0`, `mt`) |
| scene                  | `path: "s2"`                  |
| device or chain        | `path: "t0/d0/c1/d0"`         |
| session clip           | `path: "t0/s3"`               |
| arrangement clip       | `path: "t0[5\|1]"`            |
| arrangement, take lane | `path: "t0/l1[5\|1]"`         |

Every path pastes straight back into any `path`/`toPath` param that accepts that
kind of object, arrangement clips included. `arrangementStart` is not reported
alongside it — that would be the address spelled twice, which is the rule above.

**A result never reports a locator.** `loc:Chorus` and `5|1` name the same point
and a result has to pick one; bar|beat is the one that always exists, doesn't
change meaning when a locator is renamed, and is readable without a second
lookup.

Naming an arrangement clip costs a `start_time` read and the song meter, where
every other kind formats from indices already in hand. Hoist the meter once per
request, not once per clip.

A drum chain has two spellings that both resolve — pad-relative `t0/d0/pC1/c1`
and rack-relative `t0/d0/c3` — and they number the rack differently, because the
rack's flat chain list is in creation order while the pad listing groups by pad.
Once a pad is layered, `c1` and `pC1/c1` name different chains.

A chain result gives the pad-relative spelling. It survives longer: the layer
index shifts only when that pad's own layers change, where a rack index shifts
on any chain added or removed anywhere in the rack. Live's own path is the
rack-relative one, so `objectPathForApi` converts it, which costs a rack read
and is why only a chain result gets the treatment.

A **device** inside a pad is the exception: naming it pad-relative would cost
the same rack read for a path that is reachable either way, so it reports the
rack-relative form — unless the call spelled its container through a pad, and
then that spelling is echoed back. `ppal-create-device`, `ppal-update-device`
and a device or chain copy's `toPath` all do this.

An update echoes whichever spelling still names where the object is. Only a
device move replaces the address the call reached the object by, and only once
Live confirms the device arrived — a refused move, a skipped Producer Pal
device, and a drum chain's pad re-map all keep the addressing spelling. The
re-map leaves the chain's path stale, but harmlessly: a container spelled
through a pad always resolves to a chain, and a chain's parent is the rack, so
the check below never matches and the path is re-derived from the new `in_note`.
A target named only by `id` spelled no container, so its path stays derived —
what a result owes a call that supplied no spelling is a separate question,
still open.

Echoing only ever replaces the container the call actually named. A chain copy
whose destination rack is spelled rack-relative (`toPath: "t0/d0/c2/d0"`) still
gets pad-relative ancestors in its result, because the conversion happens on the
way out of `objectPathForApi` and there is no pad spelling to echo in its place.

`pathField` does the substitution, and takes the resolved container along with
its spelling so it can check the spelling really names the object's parent
before trusting it (`insertionContainerPath` trims a trailing `d<n>` off an
insertion path to get the spelling; a path naming the object itself drops its
last segment instead). Two things about that check are load-bearing. The
container has to be resolved from the spelling: one taken off the object proves
nothing. And it has to be identity, not containment, in either direction —
`pC1/c1` minus its last segment is `pC1`, which resolves to the pad's _first_
layer, so a descendant test accepts a sibling chain, and an ancestor test would
graft the object's segments onto its grandparent. Only a parent written through
a pad is substituted: every other path has one spelling, and the derived path is
read from the object itself.

A **drum pad** result needs none of this. A Drum Rack nested inside a drum pad
has no pads of its own, so a rack with pads is always reachable without a pad
segment above it, and the pad path a result derives has only one spelling.

Beware the two chain orders. `pC1/cN` counts the rack's chains filtered by
`in_note`, **not** `pad.chains` — measured on 12.4.3 the two disagree once a pad
is layered, so reading a layer out of `pad.chains` labels it with another
layer's path.

Two things report no path: an object that resolved to nothing, and the rare
object whose Live path keeps a pad segment mid-path
(`… drum_pads 36 chains 0 …`) — its rack-relative index isn't in the path, and
naming the wrong layer is worse than naming none. Live normally hands back the
rack-relative path instead.

## Errors and warnings

Rule 3 in full: a message about an object names **both spellings** —
`t1/d0 (id 7)` — because the caller addressed it by one of them and can't be
expected to map the other back. When there is no id to know, the path stands
alone: a path that resolved to nothing is quoted as the caller wrote it, and an
object that doesn't exist yet has only a path. When there is no path to spell,
the id stands alone.

One helper owns this —
[`targetLabel`](../src/tools/shared/validation/object-path-for-api.ts) and its
variants, over `objectPathForApi`. A message that builds a path by hand is a
bug: it will drift the first time the grammar changes. That is also the check on
the coordinate work — once `objectPathForApi` spells `t0[5|1]`, every warning
gets it for free, so a large sweep means messages aren't going through the
helper.

Name the path and show the fix, never restate a requirement in index terms.

## Lists of paths

A path param takes a comma-separated list (`paths` is accepted as a plural
spelling wherever `path` is). Two shapes are refused rather than half-applied:

- **A list that reads through its own inserts.** Inserting a device renumbers
  the chain, so `path: "t0/d1,t0/d2"` would put both new devices at d1 and d2
  and push the originals past them — the second entry never lands where it was
  named. Refused before anything is created. Entries naming different chains are
  fine, and appending an audio effect renumbers nothing, so that stays allowed.
- **Several tracks or scenes from a path list.** Insertion points move:
  inserting at `t1` shifts everything after it, so every entry past the first
  would be in coordinates the caller never wrote. `count` says "consecutively
  from here", which can't drift, and is what the create tools take.

## Not paths

**Device parameters**, and deliberately. A parameter is a property of its
device, not an object of its own (Principles, Efficiency), so it is never a
target — it is the payload of an `update-device` call whose target is the
device, named there by `name` or `id`.

One second spelling did grow anyway: a `params` name may carry a path prefix, so
`{name: "c0/d0/Volume"}` on `t1/d0` writes a nested device's param. It is
load-bearing for a drum pad `sample` write, whose target device does not exist
yet and so can't be addressed as a path. Whether the general form should survive
is open.

**Locators as objects.** `loc:` names a point in time. Creating, deleting and
renaming a locator stays on `update-live-set`'s own params — that is object
management, and it raises questions the coordinate doesn't answer (how do you
address one that doesn't exist yet?).

Three of ADR-0025's calls have since gone the other way.
[ADR-0036](decisions/0036-paths-address-tracks-and-scenes.md) reversed the first
two: it kept tracks and scenes off the grammar, which broke once write results
started reporting `path` — a result handed back `t0` and no tool took it — and
it left out new-track and new-scene positions on the grounds that they create a
location rather than address one, which `t+`, `rt+` and `s+` are exactly.
[ADR-0037](decisions/0037-arrangement-time-is-part-of-the-path.md) reversed the
third: arrangement clips were addressed by id alone and locators sat outside the
grammar, so a warning about an arrangement clip named the lane and called it the
clip's path. `a<n>` stays rejected — the index into a track's arrangement clip
list is unstable and means nothing to a user. Time is what a user already thinks
in.
