# Object Paths

A path names a location in the Live Set: `t0/s3` is a session clip slot, `t0/d1`
a device. One grammar serves every tool that needs to say _where_.

Status: this describes the **end state** — everything except the `[...]`
coordinate and `loc:` ships today. Treat it as the reference an implementation
is checked against.

## Parts

The reasoning is here; lookups and per-topic detail live beside it.

| File                                           | What is in it                                               |
| ---------------------------------------------- | ----------------------------------------------------------- |
| [path-catalog.md](path-catalog.md)             | Every path shape with its Live API path; creating by path   |
| [take-lanes.md](take-lanes.md)                 | Addressing take lanes; lane reads, copies and moves         |
| [tolerance.md](tolerance.md)                   | Hidden params, tolerant values, surplus segments, conflicts |
| [results-and-errors.md](results-and-errors.md) | How results and messages spell paths; drum chain spellings  |
| [lists-of-paths.md](lists-of-paths.md)         | Comma-separated lists: skipped entries, create order        |

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
segment  := "s"<n> | "l"<n> | "l+" | "d"<n> | "d+" | "c"<n> | "c+" | "rc"<n>
           | "p"<note> | "p*" | "inst" | "mfx"<n> | "afx"<n>
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

A `+` names a place rather than a thing, so it is taken only by the tool that
creates that kind of object, and a `+` root is a whole path — `t+/s0` names
nothing yet. On create, `t2` inserts at 2 while `t+` appends. `rt<n>` is refused
there: Live always adds a return track at the end, so a path naming a position
it can't honor would silently create the track somewhere else.

Segments have to nest the way Live does, and a path that doesn't is a parse
error rather than a missing object later: a track holds devices, a device holds
chains, return chains, and drum pads, and each of those holds devices. A drum
pad also takes a `c<n>`, picking among the chains that share its note. So
`t0/c0` and `t0/d0/d1` are rejected. `c+` goes wherever a `c<n>` may, but only
last: the chain it appends is empty, so nothing can hang below it.

**A device can also be addressed by type.** `inst` is the container's
instrument, `mfx<n>` its n-th MIDI effect, `afx<n>` its n-th audio effect —
0-based and counted within that type, because Live keeps a device list sorted
MIDI effects → instrument → audio effects. These sit anywhere a `d<n>` may and
nest by the same rules. `inst` takes no index: a container holds at most one
instrument. A rack counts as one device of its own type, so `t0/inst` on a track
holding a Drum Rack is the rack, never something inside it. Return and main
tracks hold only audio effects, so `inst` and `mfx<n>` never resolve there.
Nothing to resolve — no instrument, an index past the last effect of that type —
is reported once, on the target: the miss says what the container does hold
(`nothing at path "t2/afx2": t2 has 2 audio effects (afx0-afx1)`). `instrument`,
`midifx<n>` and `audiofx<n>` also parse: tolerated, and deliberately documented
nowhere but here.

**Input only — a result never emits one.** Spelling `afx<n>` off a Live path
needs a device-list read on the per-object hot path, where `d<n>` comes free
from string manipulation. Making them canonical is a separate decision that
needs a measurement
([ADR-0041](../../decisions/0041-device-type-segments-are-input-only.md)).

Every shape, with the Live API path it names, and the rules for creating by path
are in [path-catalog.md](path-catalog.md).

## Song-timeline positions

A point on the song timeline has two spellings, and **every param that takes one
takes both**: a bar|beat position (`5|1`, song meter), or `loc:<name>` naming a
locator. `loc:` also accepts a locator id (`loc:27`), and `locator:` is accepted
as an undocumented spelling of the prefix.

The prefix is **required, never sniffed**. Resolving a bare `"Verse"` by name
because it doesn't look like bar|beat would turn a locator named `5|1`, or a
typo'd bar|beat, into a silent name lookup.

This is what the `[...]` coordinate holds, and what `playback`'s `startTime`,
`loopStart` and `loopEnd`, `update-clip`'s `arrangementSplit`, and
`arrangementStart` on `create-clip`, `update-clip` and `duplicate` take
directly. The params that used to spell the second half separately are retired
into it — see [Tolerance](tolerance.md).

**Song timeline only.** `create-clip`'s `start` and `firstStart` are
clip-relative and must not accept `loc:`.

**A missing locator is reported where the spelling puts it.** Inside a `[...]`
coordinate it is that entry's own miss: the clip the entry was written for says
`not moved: ...` on its own entry, the rest of the batch still moves, and a lone
clip throws (ADR-0042). `arrangementStart` and `arrangementSplit` are read as
one list before anything moves — the same as a malformed bar|beat in them — so a
missing name there refuses the call, on every tool that takes them.

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
| `t0/l1`                   | ✅ arrangement   | ❌        | ✅     | —      |
| `t0/l+`                   | ❌ update-track  | ❌        | ✅     | —      |
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
| `t0[5\|1]` | the clip covering there | that lane, that position            |
| `t0`       | ❌ names many clips     | that lane, keep the clip's position |
| `[5\|1]`   | ❌ names many clips     | keep the clip's lane, that position |

**Complete on create.** A create tool has no source to borrow the other half
from, so an arrangement path must name both — `t0` alone and `[5|1]` alone are
errors there.

**Complete as a source.** A partial path names more than one clip, so a tool
addressing a specific clip refuses it. Both partials work as destinations.

`t0[5|1]` resolves to the clip **covering** `5|1`, even if it started earlier —
a clip running from 3|1 through bar 6 is at `[5|1]`. When no clip covers the
position, the path resolves to nothing and the target is reported like any other
that isn't there (ADR-0042).

### Which lists pair and which broadcast

A value that **fully determines a location pairs 1:1** with the items; anything
else broadcasts one value across them (ADR-0031). That single rule covers what
used to be a carve-out:

- `t0/s3` and `t0[5|1]` can't broadcast — a slot or spot holds one clip, so
  three clips into one destroys two. Several sources name one each, in order; a
  longer list isn't dealt out a few per source either.
- `[5|1]` can — each clip keeps its own lane, so the landing spots differ.
  Scenes are the exception: they share every track, so each needs its own.
- `name` and `color` can — a property, not a place.

## `path` vs `toPath`

- `path` — where the object is, or where a new one goes.
- `toPath` — where it moves or gets copied to. **Only on tools that also name a
  source** (`ids`, `id`, or their own `path`).

So `create-clip` and `create-device` use `path` for a destination: there is no
source to distinguish it from.

## Not paths

**Device parameters**, and deliberately. A parameter is a property of its
device, not an object of its own (Principles, Addressing), so it is never a
target — it is the payload of an `update-device` call whose target is the
device, named there by `name` or `id`.

One second spelling did grow anyway: a `params` name may carry a path prefix, so
`{name: "c0/d0/Volume"}` on `t1/d0` writes a nested device's param. It is
load-bearing for a drum pad `sample` write, whose target device does not exist
yet and so can't be addressed as a path — at any depth, so the prefix may cross
into a rack nested in a pad (`pC1/c0/d0/pD1/sample`). Whether the general form
should survive is open.

**Locators as objects.** `loc:` names a point in time. Creating, deleting and
renaming a locator stays on `update-live-set`'s own params — that is object
management, and it raises questions the coordinate doesn't answer (how do you
address one that doesn't exist yet?).

**`a<n>`**, an index into a track's arrangement clip list. It's unstable and
means nothing to a user. Time is what a user already thinks in, and that's what
the `[...]` coordinate spells.
