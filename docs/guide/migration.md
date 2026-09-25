---
title: Migration Guide
description:
  Upgrading a script that drives Producer Pal. What changed in 2.3 and 2.4, what
  is deprecated, and an adapter script that rewrites the old arguments.
head:
  - - meta
    - name: keywords
      content:
        Producer Pal migration, Ableton API migration, breaking changes, Ableton
        Live scripting, REST API upgrade
  - - meta
    - property: og:title
      content: "Migration Guide: Producer Pal"
  - - meta
    - property: og:description
      content:
        What changed for scripts in Producer Pal 2.3 and 2.4, what is
        deprecated, and how to rewrite the old arguments.
---

# Migration Guide

This page is for **scripts**: anything calling Producer Pal through
[MCP](/guide/npx-cli), the [REST API](/guide/rest-api), or an
[agent skill](/guide/skills). If you only chat with Producer Pal, there is
nothing here for you: the assistant reads the current tool descriptions on every
conversation and writes calls in the current spelling.

There are two migrations here and they are not equally urgent:

| What                        | When                          | Urgency                                                        |
| --------------------------- | ----------------------------- | -------------------------------------------------------------- |
| **Response fields** moved   | 2.3, and trimmed again in 2.4 | **Do this now.** No field kept a back-compat key.              |
| **Input params** deprecated | removed in a later release    | Forward notice. Everything still works, and warns, until then. |

Most upgrade guides lead with the deprecations. This one leads with the
responses, because that is the half that breaks the moment you install 2.3.

## Responses changed in 2.3

Fields were renamed, removed, and reshaped across most tools, and **not one kept
a back-compat key**. A script reading a removed field sees `undefined` rather
than an error, so these fail quietly.

The theme is that a result now says _where_ its object is, once, in a `path` you
can pass straight back into the next call, instead of scattering `trackIndex`,
`sceneIndex`, `deviceIndex` and `arrangementStart` across the response.

| Tool                                            | Change                                                         | What to do                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `ppal-read-live-set`                            | `masterTrack` → `mainTrack`                                    | rename the key you read                                                                                  |
| read-live-set, read-track, select               | `type` is gone from return tracks and the main track           | read `path` (`rt0`, `mt`); `type` is now only `midi`/`audio`, on regular tracks                          |
| create-track, read-track, read-live-set, select | `trackIndex`, `returnTrackIndex` removed                       | parse `path` (`t3`, `rt0`)                                                                               |
| create-scene, read-scene, read-live-set         | `sceneIndex` removed                                           | parse `path` (`s2`)                                                                                      |
| create-device                                   | `deviceIndex` removed                                          | parse `path` (`t1/d2`)                                                                                   |
| every clip result                               | `arrangementStart` removed                                     | the clip's `path` carries it: `t0[5\|1]`                                                                 |
| `ppal-delete`                                   | a successful delete reports `deletedPath`, not `path`          | branch on the key: `deletedPath` means removed, `path` means still there                                 |
| `ppal-playback`                                 | `currentTime` removed                                          | it was never the playhead; read `startTime` for where the next play begins                               |
| `ppal-playback`                                 | `arrangementLoop: {start, end}` → `loop`/`loopStart`/`loopEnd` | read the three flat fields                                                                               |
| `ppal-playback`                                 | `sceneIndex`, `sceneName` → `scene: {id, path, name}`          | read `scene.name`; `scene.path` is an address you can spend                                              |
| `ppal-duplicate`                                | a buried copy has no `id`                                      | `{path, overwritten: true}` marks a copy this call destroyed (plus `created` when that copy made scenes) |
| `ppal-duplicate`                                | `name` removed from scene→arrangement clip entries             | it only echoed your own argument; entries are `{id, path}`                                               |
| update-device, create-device                    | a device inside a drum pad reports `p<pitch>/c<n>`, not `c<n>` | don't rebuild rack-relative chain paths from a write result                                              |

`type` is the subtle one. It used to answer two questions (which signal a track
carries, and what role it plays) and now answers only the first. A script
branching on `type === "return"` or `type === "master"` gets `undefined`.

### Fields that became conditional

`ppal-playback`'s `loop`, `loopStart` and `loopEnd` come back only when your
call didn't name them. Don't read them unconditionally.

The device tools' `params` hold **one entry per param you sent**, in order. A
param nothing was written to comes back as `{name, ok: false, reason}` with no
`value`; one whose value Live changed on the way in (a clamp, the nearest step
of a coarse ladder) carries the value it reads as plus a `reason`. Key off
`value`, not the entry's presence.

`ppal-delete` can return an array where it used to return a single object, since
failures are now included instead of dropped. Its results are also in **request
order** now, not internal deletion order, so you can pair results to targets by
index.

The read tools do the same: `ppal-read-clip`, `-track`, `-scene` and `-device`
take comma-separated `id`/`path` lists, and a call naming two or more targets
returns an array in request order, with a target that couldn't be read holding
its slot as `{id or path, ok: false, reason}`. Naming one target still returns
the object on its own.

**A read now says it on the target's own entry, not in a warning.**
`ppal-read-clip` used to answer an empty clip slot with
`{id: null, type: null, name: null, path}` and a warning. Naming that slot on
its own is now an error (`no clip at t0/s3`), and in a list the slot holds its
place as `{path, ok: false, reason}`, so check for `ok`, not for `id: null`. A
read that landed but couldn't produce part of the answer carries a `reason` on
that target's entry and no `ok`: `ppal-read-track` for a send count that doesn't
match the Set's return tracks and for a track with more than one instrument,
`ppal-read-device` for why a drum pad or drum chain has no drum map of its own.

**Every write tool now answers the same way, and `ppal-delete` has no `deleted`
field.** `ppal-update-track`, `-scene` and `-device` used to drop a target they
couldn't reach and warn. They return an entry for every target named, in order,
with a failed one holding its slot as `{id or path, ok: false, reason}`, so
`update-track` with `path: "t0,t99"` is now a two-entry array. `ok` appears only
on a skip, never on a success. On `ppal-delete`, `deleted: true` is gone
(`deletedPath` already says the object was removed) and `deleted: false` is now
either `ok: false` with a `reason`, or, for a target that was already gone,
`reason: "nothing to delete"` with no `ok`. Check for `ok`, not `deleted`.

**`ppal-update-clip` and `ppal-duplicate` answer the same way.** update-clip
returns an entry for every id or path you named, in order: one whose path held
no clip, whose id doesn't exist, or whose update failed partway holds its slot
as `{id or path, ok: false, reason}`, so `path: "t0/s0,t0/s99"` is a two-entry
array. A clip that was updated but not as asked (a move Live turned down, a
destination another clip in the call claimed, a take-lane leftover, a split a
lane clip can't take) carries a `reason` beside its normal fields and no `ok`;
those used to be warnings. So does a param the clip could do nothing with
(`notes` or `duplicateLoop` on an audio clip, `gainDb`, `pitchShift`, `warpMode`
or `warping` on a MIDI one, `firstStart` on a clip that isn't looping), and
where that was everything you asked of the clip, its entry is `ok: false`. A
refused move with nothing else asked for that clip landed nothing, so it is
`ok: false`. A clip named twice gets one entry per mention: the update runs as
the last mention asks, and the earlier ones point to it. A `name` or `color`
list pairs with the targets you named, so a skipped one keeps its place in the
list instead of shifting the names after it onto the wrong clips, and every
piece a split cuts a target into takes that target's name. `ppal-duplicate`
likewise returns one entry per destination you named, with a destination no copy
landed at holding its slot as `{path, ok: false, reason}` instead of dropping
out of the array.

That covers device, chain and drum-pad copies too. A destination that used to
drop out of the array with a warning now keeps its slot as
`{path, ok: false, reason}`, spelled the way you wrote it in `toPath`, and a
source that can't be copied at all reports the same reason on every destination
it was given. A copy that landed but isn't what you asked for (a chain short a
device, a pad copy that layered onto chains already there) carries a `reason`
and no `ok`.

**`ppal-duplicate`'s remaining warnings moved onto the copy's entry too.** A
`routeToSource` copy says what it did to the source (armed it, set its input to
`"No Input"`, or why it couldn't route at all) on the new track's own `reason`,
and a track copy that had to drop the Producer Pal device says so there. A
copied chain carries the sends the destination rack had no return chain for, and
its source rack's macro mappings not coming along. A refusal to copy a chain
between racks of different kinds now names both in words (`an instrument rack`,
`a drum rack`) instead of Live class names like `InstrumentGroupDevice`. What is
left as a warning is only what no entry can carry:
`count ignored: <what> copies go one per toPath`, and
`withoutClips/withoutDevices ignored: routeToSource always copies without clips and devices`
(one line for the pair, naming only what you sent).

**`ppal-create-clip` answers per destination named.** A `path` list mixing clip
slots and arrangement positions used to come back clip slots first and the
arrangement after; it now comes back in the order you named them, and `name` and
`color` pair with that place. A destination that got no clip (an occupied clip
slot, a track that won't take the clip, a create Live declined, a take lane past
the cap, one the request ran out of time for) used to drop out of the array with
a warning, and now holds its slot as `{path, ok: false, reason}`. Where that was
the only destination you named, the reason comes back as the call's error
instead of an empty array.

It says the rest on the clip's entry too: a `firstStart` sent without
`looping: true` used to warn (and, with `looping` left out, was dropped without
a word); the created clip now carries
`reason: "firstStart ignored: set looping: true to use it"` and no `ok`, since
the clip was made.

**`ppal-create-device` keeps a failed path's slot.** It used to drop the path
and warn, and threw when every path failed. A call naming two or more paths now
returns one entry each, in order, with a path it couldn't create at holding its
slot as `{path, ok: false, reason}`, including when that is all of them. A
single path still throws. Its refusal also names the cause when Live gives none:
an instrument aimed at a chain that already has one reads
`could not insert "Operator" at end in path "t3/d+": the destination already has an instrument, and only one is allowed`.

**`ppal-update-device` reports a param the object can't take on its entry.**
`gainDb`, `pan`, `mute`, `solo`, `sends` and the rest sent to an object with no
use for them used to warn once per param. The target's entry now carries
`reason: "gainDb, pan not applicable to a device"`, and where they were
everything you asked of it the entry is `ok: false`, and a lone target throws. A
`sends` entry naming no return chain of the rack is that send's own
`{return, ok: false, reason}` under the chain or pad it was sent to, matching
how `ppal-update-track` reports a send a track can't take (no mixer, no sends,
no send for that return).

**`ppal-update-track` reports a send that names no return track the same way.**
A `sendReturn` (or a `sends` entry) matching no return track of the Set used to
be one warning for the whole call. Every track you named now carries
`{return, ok: false, reason: 'no return track matching "Verb" (Available: A-Reverb, B-Delay)'}`
in its `sends`, with the return spelled the way you wrote it.

**A color Live snapped to its palette lands on the target's entry.** Live keeps
about 70 colors and snaps anything else to the nearest one. That used to be a
warning; `ppal-create-track`, `ppal-create-scene`, `ppal-create-clip`,
`ppal-update-track`, `ppal-update-scene` and `ppal-update-clip` now put the
color it landed on in that target's own entry, with
`reason: "color #FF0000 is not in Live's palette; landed as #FF3636"` and no
`ok`, since the color was set. A color that lands exactly as asked says nothing
at all, so `color` in a result always means "not what you sent".

**The rest of update-device's and update-track's warnings moved onto entries.**
A refused move (a chain, the Producer Pal device, a drum pad in another rack, a
destination past the end), a `macroCount` rounded up to the next even number, a
chain trim a device move left behind or carried, a stacked pad's per-layer
settings, and an `abCompare` or `macroVariation` the device doesn't have are all
`reason` on the target's own entry now. It is `ok: false` where they were
everything you asked of that target, and a lone target throws. Same for
`ppal-update-track`: `monitoringState` on a track that can't be armed, input
routing on a group or return track, and a routing name the track doesn't have.
`wrapInRack` throws instead of returning `null` when it can't wrap anything, and
names each device it dropped on the new rack's `reason`. A `macroVariationIndex`
that contradicts its `macroVariation` (sent alone, missing for `load`/`delete`,
or sent beside `create`/`revert`/`randomize`) is refused before anything is
written.

**`ppal-delete` entries no longer carry `type`.** You sent it, so the entry
doesn't repeat it. Pair entries to targets by position, as everything else does.

**`ppal-update-live-set` reports `scale` only when Live stores a different
spelling** than the one you sent, with a `reason` saying why (`"F# Dorian"` in,
`"Gb Dorian"` out). A scale stored the way you asked for it, and `scale: ""`
disabling it, now say nothing. The respelling note left `$meta`, which keeps
only the "applied"/"disabled" line.

**`ppal-create-clip` reports an audio clip's `warping` only when Live didn't
settle on the state you asked for.** Omit `warping` and it still comes back,
since Live chose it. `length` is unchanged: an audio clip's region comes from
the sample, never from your argument.

**`ppal-select` refuses a comma-separated `path`.** It takes one target per
call, because Live holds one selection, and now says so instead of complaining
that the path isn't a track or scene. `ppal-context`'s `name` and
`ppal-live-api`'s `path` take one value each for the same reason.

**Two move reports moved onto entries too.** A device copy Live turned down now
names what Live objected to on its destination entry, after the
`could not be moved to "t0/d1"` the reason already carried:
`the destination already has an instrument, and only one is allowed`. And a
`ppal-update-clip` move into an occupied slot carries
`reason: "overwrote the existing clip at t1/s0"` on the moved clip's entry.

**`ppal-playback`'s clip actions answer per target named.** `play-session-clips`
and `stop-session-clips` used to report only `playing`, and quietly warned past
an id they couldn't use. They now carry a `clips` array with one entry per `id`
or `path` you named, in order: `{id, path}` for a slot they acted on, and
`{id or path, ok: false, reason}`, spelled the way you wrote it, for one that
named no session clip, or no clip slot. A slot you named twice (once by id, once
by path) is still acted on once, at its last mention, and the earlier entry says
so in a `reason`. Naming a single target that fails is now an error instead of a
warning, and a call where every target failed reports `playing` as it found it
rather than claiming a launch. The other actions are unchanged and have no
`clips`.

**A call naming one target that can't be done now throws** instead of returning
an empty array with a warning. `ppal-update-track path="t99"` is an error, as is
an update-clip or duplicate call whose one target got nothing done; deleting
something already gone is not, since nothing was left to do.
`ppal-update-live-set`'s locator result also carries prose in `reason` now, in
place of slugs like `locator_not_found`.

**`ppal-update-live-set` refuses a `scale` it can't read.** A misspelled root or
scale name used to be dropped with a warning while the rest of the call landed,
which read as a success. It is now an error, raised before anything in the call
is written, naming the roots and scale names Live accepts. `tempo` in the same
tool has always worked this way.

### Three values read differently without the field changing

- **An all-digit name is a string.** A track named `5678` used to serialize as
  the JSON number `5678`. Strict type checks will notice.
- **Gain is rounded to 0.01 dB.** A gain of -6.333333 used to read back as
  -6.333000183105469. Exact comparisons need the same rounding.
- **`update-live-set`'s `scale` is the spelling Live stores**, not yours:
  `"F# Dorian"` in, `"Gb Dorian"` out, and only when the two differ. Every read
  already said this; the write result was the one that disagreed.

### Error and warning text

`Error executing tool 'ppal-update-clip': <reason>` is now `Error: <reason>`,
and no warning carries a tool-name prefix any more. Anything matching on that
text needs updating.

## Write results say less in 2.4

**A write reports only what didn't land as asked.** A value you sent that Live
kept is no longer echoed back, so a result with nothing but an `id` and `path`
means every write in the call worked. What still comes back is a value Live put
somewhere else, read off the object and carrying a `reason` that names the
fields it applies to ("gainDb, pan read back as shown, not as sent"), plus state
that governs what the call did.

| Tool                         | Gone when the write landed                      | Still there                                                                      |
| ---------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `ppal-update-track`          | `gainDb`, `pan`, `leftPan`, `rightPan`, `sends` | `panningMode: "split"`, when you set a pan param in split mode without naming it |
| update-device, create-device | a `params` entry's `value` for a bare number    | `{id, name}` for that entry; the value for a unit, enum label, or note name      |
| `ppal-update-device`         | a chain's `gainDb`, `pan`, `sends`              | `{id, path}`, plus a `reason` when one applies                                   |
| `ppal-update-live-set`       | `tempo`, `timeSignature`, `scale`               | `scale` plus a `reason`, when Live spells it its own way                         |
| `ppal-playback`              | `startTime` you sent as a bar\|beat             | `startTime` you didn't send, or that a `loc:` name resolved to                   |

Two things moved rather than vanished. A `sends` array now holds only the sends
Live didn't give the level you asked for, so no `sends` means every one landed;
one nothing could be written to keeps its slot as
`{return, returnId, ok: false, reason}`. And a refusal that used to warn is a
`reason` on the track's own entry now: `pan` sent in split panning mode,
`leftPan`/`rightPan` sent in stereo, or a mixer or send param a rack macro owns.

**A locator id is Live's own id now.** `ppal-read-live-set` used to report
`locator-0`, a position in the list that shifted whenever an earlier locator was
added or removed. It now reports Live's id (`"27"`), which stays with the
locator, and `locatorId` and `loc:` take it back (`loc:27`). A locator named
with nothing but digits reads as an id, so its `position` falls back to one.

**`ppal-update-live-set`'s locator results stop echoing your arguments.** A
create reports `{operation, id}`; a rename, and a delete by id or time, report
the id of the locator they touched; a delete by name keeps its `count` and the
name it matched. The `time` and `name` you sent don't come back.

`operation` also answers in the words the schema publishes: `create`, `delete`
and `rename`, not `created`, `deleted` and `renamed`. A skip still reads
`skipped`.

**`ppal-playback` stops reporting the scene's name.** A `play-scene` answers
`{id, path}` for the scene it fired; the name it never changed is a read, so
`ppal-read-scene` is where it comes from now.

**`ppal-library` with one `searches` entry answers like a plain search.** One
entry needs no grouping, so the result is `{items, ...}` rather than
`{results: [{label, items}]}`. An empty `searches: []` is refused up front
instead of quietly running the top-level filters.

**A deprecated index names the path you should have sent.** `trackIndex: 3` now
warns `use "path" instead (e.g. path: "t3")` rather than naming `path` alone.

**Two whole-call warnings moved onto the entry.** `ppal-select`'s
`openPluginWindow` on a device that isn't a VST/AU is a `reason` on
`selectedDevice`; a clip that landed on a take lane says so on its own entry
(`expand the take-lanes arrow on the track header in Live to see it`), and a
copy `ppal-duplicate` had to re-create says where it landed and what that cost
on the copy's entry.

**An arrangement write says what it ran over.** Creating, moving or lengthening
a clip into a range another clip occupies overwrites it, as it always has. What
is new is that the written clip's entry carries a `reason` naming what that
cost: `overwrote the clip at t0[4|1]`, `shortened the clip at t0[4|1]`, or
`split the clip at t0[1|1] into t0[1|1] and t0[4|1]`, several joined with `; `.
The whole-call warning `N clips on t0 moved to the same position` is gone, and
so are the four warnings about an unlooped audio clip that couldn't reach the
`arrangementLength` you asked for. That clip's entry now says
`arrangementLength unchanged: the audio file has no more content to show`, or
`arrangementLength landed at 2bar: ...` when it grew part of the way. A script
matching on any of that warning text needs to read the entries instead.

`ppal-select` is unchanged: what it reports is the selection it made.

**A clip destination past the last scene makes the scenes up to it.**
`ppal-create-clip` always did; `ppal-update-clip`'s `toPath` and
`ppal-duplicate`'s `toPath` used to refuse one ("destination t1/s20 does not
exist", "no clip slot there") and now create the same way. Whichever tool made
them, that entry carries a `created` field naming them (`created: "s8-s9"`); a
`ppal-duplicate` copy that then failed names them in its `reason` instead. And a
destination past the auto-create cap is still refused. `ppal-update-scene` is
unchanged: its `path` names a scene to update, not a place to make one, and a
path past the last scene is refused with `ppal-create-scene` named in the
reason.

**A clip slot that already holds a clip is replaced.** `ppal-create-clip` used
to refuse an occupied slot ("a clip already exists at t0/s0") and now deletes
what was there, the way `ppal-duplicate` and `ppal-update-clip`'s `toPath`
already do. The new clip's entry says so, with
`reason: "overwrote the existing clip at t0/s0"`.

**An arrangement position names the clip covering it.** As a target, `t0[5|1]`
used to find only a clip starting at bar 5. It now finds the clip playing there,
even one that started earlier. As a destination it still means where the new
clip starts.

**`wrapInRack` puts every device in one chain.** The devices you name land in
series in a single chain, the way Live's Group (Cmd/Ctrl+G) does it: MIDI
effects, then the instrument, then audio effects, each kind in the order you
named them. 2.3 gave each device its own chain, even when wrapping only effects.
`deviceCount` is the number of devices in that chain. A `toPath` with no index
(`t2`, `t2/d+`) appends the rack; 2.3 put it first.

### Results name what a call had to make first

A path that reaches past the end makes the objects below it, and the entry now
says which: `created: "c2-c3"` for rack chains on `ppal-create-device` and
`ppal-update-device`, `created: "l1-l3"` for take lanes on `ppal-update-track`
(it used to be `created: true`, naming only the lane you asked for), and
`created: "s5-s7"` for the scenes a `ppal-create-scene` padded a gap with.

`ppal-update-device` also reads `macroCount` back off the rack instead of
assuming the write took: a count that didn't land reads
`reason: "macroCount landed at 8, not 4: Live keeps a mapped macro visible"`,
and lowering the count on a mapped rack says which macros went with it.

### Chains say `chain`, not Live's class name

A chain's `type` was Live's class name, `Chain` or `DrumChain`. It is now
`chain` or `drum-chain`, matching the lowercase words every other `type` field
already used. A script switching on the old spelling needs the new one.

Errors and warnings dropped their Live class names too:
`is not a track (found Scene)` now reads `(found scene)`. The few that printed a
raw Live path (`live_set return_tracks 0`) print the path you wrote instead.
`ppal-update-device` says it that way on the target's own entry as well:
`not applicable to a drum pad chain` and `cannot update a track` where they used
to read `DrumChain` and `Track objects`.

## Deprecated params

Every param below still works in 2.4 and emits a deprecation warning saying what
to use instead. They will be removed in a later release.

A param that warns is not always one of these. `ppal-read-clip` takes
`trackIndex` and `sceneIndex` as **aliases**: names a model reaches for on its
own, folded onto `path`. They warn too, and they are staying.

They all say the same thing: an object is named by **one `path`**, counting from
0, instead of by a scattering of index params. `t2` is the third track, `rt0`
the first return, `mt` the main track, `s1` the second scene, `t2/s1` a clip
slot, `t2[5|1]` a spot on an arrangement, `t2/l0` a take lane.

| Old                                                  | New                                                 |
| ---------------------------------------------------- | --------------------------------------------------- |
| `trackIndex` + `trackType`                           | `path`: `t2`, `rt0`, `mt`                           |
| `trackIndex: -1` on create-track                     | `path: "t+"` (append)                               |
| `sceneIndex`                                         | `path: "s2"`                                        |
| `count` on create-track / create-scene               | one path entry per object: `path: "t+,t+,t+"`       |
| `slot: "1/0"`, `slots`, `toSlot`                     | `path` / `toPath`: `t1/s0`                          |
| `arrangementStart: "5\|1"`                           | fused onto the path: `t1[5\|1]`                     |
| `takeLane: "1"`                                      | `/l0` on the path                                   |
| `locator: "Chorus"` on duplicate                     | `toPath: "[loc:Chorus]"`                            |
| `startLocator`, `loopStartLocator`, `loopEndLocator` | `startTime` / `loopStart` / `loopEnd`: `loc:Chorus` |
| `devicePath` on select                               | `path`                                              |
| `inputRoutingTypeId` and the other three `*Id`       | drop the `Id` suffix                                |
| `deviceName` on create-device                        | `device`                                            |
| `split` on update-clip                               | `arrangementSplit`, but see below                   |

The `*Id` and `deviceName` rows are plain renames: the `*Id` survivors already
accept a name or an id. Most of the rest are mechanical. **Four are not**, and a
find-and-replace on them writes a call that quietly does the wrong thing.

### `count` becomes one path entry per object

`ppal-create-track` and `ppal-create-scene` used to make several objects from
one path plus a `count`. Now the path names each one, the way `ppal-create-clip`
and `ppal-create-device` always have. `name` and `color` lists pair with it 1:1,
and `count` sent alongside a path list is refused.

```js
// before: three tracks on the end
{ path: "t+", count: 3, name: "Kick,Snare,Hat" }
// after
{ path: "t+,t+,t+", name: "Kick,Snare,Hat" }
```

Repeating an index inserts in list order, so `path: "t2,t2"` puts the first new
track at `t2` and the second at `t3`. Each result reports where its object ended
up, which is what `count` could never say once entries named different places.

### `takeLane` counts from 1; `l<n>` counts from 0

| Old           | New                                    |
| ------------- | -------------------------------------- |
| `takeLane: 1` | `t0/l0`, the first take lane           |
| `takeLane: 2` | `t0/l1`                                |
| `takeLane: 0` | `t0`, the **main lane** (no take lane) |

So it is off by one everywhere, and at zero it isn't a take lane at all. A take
lane in a path also always needs its track: `t1/l0[5|1]` works, `l0[5|1]` is
refused.

`takeLane: "new"` is gone: name the lane by index instead, and lanes up to it
are created as needed. Read a track's `takeLanes` first and use the next free
index: the per-track cap is small, and no lane can be deleted.

```js
// before: two clips, one new lane
{ trackIndex: 1, arrangementStart: "21|1,25|1", takeLane: "new" }
// after
{ path: "t1/l0[21|1],t1/l0[25|1]" }
```

### `takeLaneName` is deprecated

It still works on `ppal-create-clip` and `ppal-duplicate`, with a warning, and
will be removed. Name a take lane with `ppal-update-track` instead:
`path: "t2/l0"` and `name`, which also works on a lane that already has a name.
See below.

### Take lanes are `ppal-update-track`'s in 2.4

Nothing to migrate: this is where the lane params went. A take lane is a target
of the track tools now, addressed by the same path a clip destination uses:

| To                        | Call                                                     |
| ------------------------- | -------------------------------------------------------- |
| add a lane                | `ppal-update-track` `path: "t2/l+"` (one lane per entry) |
| name one, adding up to it | `ppal-update-track` `path: "t2/l2"` with `name`          |
| read one                  | `ppal-read-track` `path: "t2/l0"`                        |

`name` is the only param a lane takes; any other one is reported on that lane's
entry and changes nothing. A call whose lanes would put a track over the cap is
refused before it creates any, because no lane can be deleted.

The cap itself went from 8 lanes per track to 10. It is Producer Pal's, not
Live's.

### `arrangementStart` becomes a coordinate, not a param

It stops being its own param and becomes a `[…]` coordinate on the destination
path, so it has to be **paired with a track** rather than renamed in place. The
bar|beat value itself doesn't change.

```js
// before
{ trackIndex: 1, arrangementStart: "33|1,37|1" }
// after: one destination track broadcasts across every position
{ path: "t1[33|1],t1[37|1]" }
```

On `ppal-update-clip` and `ppal-duplicate` there was never a destination-track
param: the clip stayed on its own track. A path spells that as a bare
coordinate.

```js
// before
{ path: "t1[41|1],t1[45|1]", arrangementStart: "49|1,53|1" }
// after
{ path: "t1[41|1],t1[45|1]", toPath: "[49|1],[53|1]" }
```

## `split` is not a rename either

`ppal-update-clip` has both `split` (deprecated) and `arrangementSplit` (the
survivor), and **they read positions in different coordinate systems**:

- `split` positions are offsets from **each clip's own start**.
- `arrangementSplit` positions are on the **song timeline**.

The same value cuts somewhere else. On a clip starting at bar 13, `split: "2|1"`
cuts at song bar 14; `arrangementSplit: "2|1"` on that clip matches nothing at
all and warns that it cut nothing.

Converting means adding each clip's arrangement start to each offset, which
means reading the clips first. There is no offline rewrite, which is why the
adapter script below leaves `split` alone and tells you so.

## Three values, not params, are also retiring

These don't show up as a param rename because it's the **value** that retires:

| Old                                       | New                                              | Deprecated since |
| ----------------------------------------- | ------------------------------------------------ | ---------------- |
| `ppal-create-track` `type: "return"`      | `path: "rt+"`                                    | 2.2              |
| `ppal-library` `action: "searchBatch"`    | `action: "search"` with a `searches` list        | 2.3              |
| a device path in front of `params[].name` | address the device by `path`, send the bare name | 2.3              |

### The `params[].name` prefix

On `ppal-create-device` and `ppal-update-device`, a param name could carry a
device path in front of it. The device gets addressed by `path` instead:

```js
// before
{ path: "t5/d0", params: [{ name: "pC1/c0/d0/Volume", value: "-6" }] }
// after
{ path: "t5/d0/pC1/c0/d0", params: [{ name: "Volume", value: "-6" }] }
```

Two things to know before you rewrite these:

- **A real param name containing a slash needs no change.** `Dry/Wet` on a
  Reverb is matched as a name first, and only falls back to path-routing when
  the device has no such param.
- **`params` applies to every path in a call.** So where the prefixed form let
  one call set a different value on each pad, the replacement needs one call per
  distinct value. Setting the _same_ value across pads still works in one call:
  `path: "t5/d0/pD1/d0,t5/d0/pE1/d0"`.

The drum-pad `sample` shortcut (`{name: "pC1/sample"}`) is **not** deprecated:
it creates the pad's Simpler as well as addressing it, so it isn't just a
spelling for a path.

## The adapter script

[`examples/migration/`](https://github.com/adamjmurray/producer-pal/tree/main/examples/migration)
has a zero-dependency adapter in both Node and Python that rewrites the
mechanical cases for you:

```bash
node ppal-migrate.mjs ppal-read-track '{"trackIndex": 2}'
# {"path": "t2"}

python ppal_migrate.py ppal-create-clip '{"trackIndex":1,"arrangementStart":"33|1,37|1"}'
# {"path": "t1[33|1],t1[37|1]"}
```

As a library it returns the rewritten args plus `notes`, anything it could not
translate on its own:

```js
import { migrateArgs } from "./ppal-migrate.mjs";

const { args, notes } = migrateArgs("ppal-update-clip", {
  path: "t1[9|1]",
  split: "2|1",
});
// args  -> unchanged
// notes -> ['split "2|1" left as-is: its positions are offsets from each
//           clip's start, and arrangementSplit reads the song timeline…']
```

**Always check `notes`.** An empty list means the call migrated cleanly.
Anything in it names a param the adapter left exactly as it was, because
answering needed a Live read or a judgement call: `split`, `params[].name`
prefixes, `searchBatch`, `takeLane` on a duplicate whose source is addressed by
`id`, a track and a scene selected on a return track, and any value the tool
itself refuses. A half-migrated call is worse than an untouched one.

It also exports `buildPath` and `parsePath` if you'd rather assemble paths from
parts than build strings by hand.

## Finding what you're still sending

Every deprecated param warns when you send it, and the warning says what to use
instead:

```
WARNING: param "takeLane" is deprecated and will be removed; use "path" instead.
Lanes count from 0 in a path: takeLane 1 is "l0", and takeLane 0 is the main
lane.
```

Over the REST API these arrive in a `warnings` array beside the result; over MCP
they're appended to the tool result. Run your existing scripts against 2.4, log
every warning, and you have the list of calls to fix, with no auditing by hand.
