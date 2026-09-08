---
title: Migration Guide
description:
  Upgrading a script that drives Producer Pal. What changed in 2.3, what is
  removed in 2.4, and an adapter script that rewrites the old arguments.
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
        What changed for scripts in Producer Pal 2.3, what is removed in 2.4,
        and how to rewrite the old arguments.
---

# Migration Guide

This page is for **scripts**: anything calling Producer Pal through
[MCP](/guide/npx-cli), the [REST API](/guide/rest-api), or an
[agent skill](/guide/skills). If you only chat with Producer Pal, there is
nothing here for you: the assistant reads the current tool descriptions on every
conversation and writes calls in the current spelling.

There are two migrations here and they are not equally urgent:

| What                      | When                    | Urgency                                                        |
| ------------------------- | ----------------------- | -------------------------------------------------------------- |
| **Response fields** moved | already shipped, in 2.3 | **Do this now.** No field kept a back-compat key.              |
| **Input params** removed  | 2.4                     | Forward notice. Everything still works, and warns, until then. |

Most upgrade guides lead with the deprecations. This one leads with the
responses, because that is the half that breaks the moment you install 2.3.

## Responses changed in 2.3

Fields were renamed, removed, and reshaped across most tools, and **not one kept
a back-compat key**. A script reading a removed field sees `undefined` rather
than an error, so these fail quietly.

The theme is that a result now says _where_ its object is, once, in a `path` you
can pass straight back into the next call, instead of scattering `trackIndex`,
`sceneIndex`, `deviceIndex` and `arrangementStart` across the response.

| Tool                                            | Change                                                         | What to do                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `ppal-read-live-set`                            | `masterTrack` → `mainTrack`                                    | rename the key you read                                                         |
| read-live-set, read-track, select               | `type` is gone from return tracks and the main track           | read `path` (`rt0`, `mt`); `type` is now only `midi`/`audio`, on regular tracks |
| create-track, read-track, read-live-set, select | `trackIndex`, `returnTrackIndex` removed                       | parse `path` (`t3`, `rt0`)                                                      |
| create-scene, read-scene, read-live-set         | `sceneIndex` removed                                           | parse `path` (`s2`)                                                             |
| create-device                                   | `deviceIndex` removed                                          | parse `path` (`t1/d2`)                                                          |
| every clip result                               | `arrangementStart` removed                                     | the clip's `path` carries it: `t0[5\|1]`                                        |
| `ppal-delete`                                   | a successful delete reports `deletedPath`, not `path`          | branch on `deleted`: read `deletedPath` when true, `path` when false            |
| `ppal-playback`                                 | `currentTime` removed                                          | it was never the playhead; read `startTime` for where the next play begins      |
| `ppal-playback`                                 | `arrangementLoop: {start, end}` → `loop`/`loopStart`/`loopEnd` | read the three flat fields                                                      |
| `ppal-playback`                                 | `sceneIndex`, `sceneName` → `scene: {id, path, name}`          | read `scene.name`; `scene.path` is an address you can spend                     |
| `ppal-duplicate`                                | a buried copy has no `id`                                      | `{path, overwritten: true}` marks a copy this call destroyed                    |
| `ppal-duplicate`                                | `name` removed from scene→arrangement clip entries             | it only echoed your own argument; entries are `{id, path}`                      |
| update-device, create-device                    | a device inside a drum pad reports `p<pitch>/c<n>`, not `c<n>` | don't rebuild rack-relative chain paths from a write result                     |

`type` is the subtle one. It used to answer two questions (which signal a track
carries, and what role it plays) and now answers only the first. A script
branching on `type === "return"` or `type === "master"` gets `undefined`.

### Fields that became conditional

`ppal-playback`'s `loop`, `loopStart` and `loopEnd` come back only when your
call didn't name them. Don't read them unconditionally.

The device tools' `params` can be **longer** than the number of params you
wrote: a name that reached nothing comes back as `{name, reason}` with no
`value`. Key off `value`, not the entry's presence.

`ppal-delete` can return an array where it used to return a single object, since
failures are now included instead of dropped. Its results are also in **request
order** now, not internal deletion order, so you can pair results to targets by
index.

### Three values read differently without the field changing

- **An all-digit name is a string.** A track named `5678` used to serialize as
  the JSON number `5678`. Strict type checks will notice.
- **Gain is rounded to 0.01 dB.** A gain of -6.333333 used to read back as
  -6.333000183105469. Exact comparisons need the same rounding.
- **`update-live-set`'s `scale` is the spelling Live stores**, not yours:
  `"F# Dorian"` in, `"Gb Dorian"` out. Every read already said this; the write
  result was the one that disagreed.

### Error and warning text

`Error executing tool 'ppal-update-clip': <reason>` is now `Error: <reason>`,
and no warning carries a tool-name prefix any more. Anything matching on that
text needs updating.

## Params being removed in 2.4

Every param below still works today and emits a deprecation warning naming its
replacement. They are removed in 2.4.

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
| `slot: "1/0"`, `slots`, `toSlot`                     | `path` / `toPath`: `t1/s0`                          |
| `arrangementStart: "5\|1"`                           | fused onto the path: `t1[5\|1]`                     |
| `takeLane: "1"`                                      | `/l0` on the path                                   |
| `locator: "Chorus"` on duplicate                     | `toPath: "[loc:Chorus]"`                            |
| `startLocator`, `loopStartLocator`, `loopEndLocator` | `startTime` / `loopStart` / `loopEnd`: `loc:Chorus` |
| `devicePath` on select                               | `path`                                              |
| `inputRoutingTypeId` and the other three `*Id`       | drop the `Id` suffix                                |

The last row is a plain rename: the surviving param already accepts a name or an
id. Most of the rest are mechanical. **Two are not**, and a find-and-replace on
them writes a call that quietly does the wrong thing.

### `takeLane` counts from 1; `l<n>` counts from 0

| Old               | New                                    |
| ----------------- | -------------------------------------- |
| `takeLane: 1`     | `t0/l0`, the first take lane           |
| `takeLane: 2`     | `t0/l1`                                |
| `takeLane: 0`     | `t0`, the **main lane** (no take lane) |
| `takeLane: "new"` | `t0/l+`                                |

So it is off by one everywhere, and at zero it isn't a take lane at all. A take
lane in a path also always needs its track: `t1/l0[5|1]` works, `l0[5|1]` is
refused.

One `takeLane: "new"` also made **one** lane, however many positions landed on
it. A path says that by repeating `l+`: every `l+` in one path is the same new
lane.

```js
// before: two clips, one new lane
{ trackIndex: 1, arrangementStart: "21|1,25|1", takeLane: "new" }
// after
{ path: "t1/l+[21|1],t1/l+[25|1]" }
```

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

Every deprecated param warns when you send it, and the warning names its
replacement:

```
WARNING: param "takeLane" is deprecated and will be removed; use "path" instead.
Lanes count from 0 in a path: takeLane 1 is "l0", takeLane 0 is the main lane,
and takeLane "new" is "l+".
```

Over the REST API these arrive in a `warnings` array beside the result; over MCP
they're appended to the tool result. Run your existing scripts against 2.3, log
every warning, and you have the list of calls to fix, with no auditing by hand.
