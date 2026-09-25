# Live API Behavior

What Live actually does on reads and writes, verified by probing. Part of the
[coding standards](README.md).

## What Live Returns When There Is No Object

Verified against Live 12.4.3 (v8). A bad path, a bad index, a bad id and a path
cleared to `""` all behave the same, and none of them throw:

| Call             | Returns                |
| ---------------- | ---------------------- |
| `get(any)`       | `1` — **not an array** |
| `set(any, v)`    | `1`                    |
| `call(any)`      | `1`                    |
| `getstring(any)` | `1` — **not a string** |
| `getcount(any)`  | `0`                    |
| `info`           | `"No object"`          |

Read a bare `1` as "no object, no answer". It is not a success flag and not a
status code — `set` returns `1` on a valid object too, whether or not the write
lands. A read-only property, a wrong-typed value, an unknown property and an
out-of-range value all return `1` and change nothing. Reading the property back
is the only way to know a write worked.

Keeping that sentinel out of tool code is most of what the wrapper is for:

| Wrapper call      | On a nonexistent object |
| ----------------- | ----------------------- |
| `getProperty`     | `undefined`             |
| `getPropertyList` | `[]`                    |
| `getChildIds`     | `[]`                    |
| `getColor`        | `null`                  |
| `getName`         | `""`                    |
| `exists()`        | `false`                 |

So the `Array.isArray` checks in those methods are load-bearing, not defensive
habit — they are what turns `1` into an ordinary empty value. This is also why
raw `.get("property")?.[0]` is banned: on a missing object it yields `undefined`
by luck rather than by check, and `.get("property")[1]` throws outright.

`exists()` can't use Live's `valid` field, obvious as that looks: `valid` reads
`1` for a bad path, a bad index, a bad id and a cleared path alike — it
describes the wrapper, not the target. It checks the object id instead.

## A Drum Rack Inside a Drum Pad Has No Pads

Verified against Live 12.4.3. A Drum Rack nested in another rack's drum pad has
an **empty `drum_pads` collection**. Live's own UI shows no pad grid for it
either — this is how Live works, not a bug and not a read that came out short.

So such a rack serializes its pads with no `id`. The pads themselves still come
through: they are grouped from the rack's `chains` by `in_note`, which is why
`processDrumPads` works off chains rather than the pad collection. Only the pad
id is missing, because there is no pad object to take one from.

Reading a `p<note>` path does the same. A pad path resolves through the rack's
chains, so it reads back on a nested rack — and on the catch-all `p*`, which is
a chain group with no pad object either.

Don't "fix" this by falling back to another lookup, and don't assert a pad id in
a test for a rack nested on a pad.

A nested rack's pads therefore **move but never delete**. `DrumChain` offers
only `delete_device`/`insert_device`, and the API's one chain-removal primitive
is `DrumPad.delete_all_chains` — which such a rack has no pad to call. Writing
`in_note` works fine, so a pad can be re-pointed but not emptied out of
existence. The closest real action is deleting the chain's devices.

## A Chainless Drum Pad Ignores Every Write

Verified against Live 12.4.3. A pad with no chains takes `mute` and `solo`
writes and drops them — `set` returns 1 and the read-back stays 0, where the
same write on a pad that has a chain lands. So a chainless pad is inert, not
merely hidden: reporting a write to one as successful is reporting a lie.

## An All-Digit Name Comes Back as a Number

Live hands back a `name` property as a number, not a string, when the name is
all digits (a locator, track, chain, or clip named `"5678"`). Always read a name
through `getName()`, never `getProperty("name")` — it normalizes the number to a
string and reports `""` instead of `"undefined"` for an object with no name.

## `pad.name` Is a UI Label, Not Data

It reads the chain's name at one chain, the note name (`"C♯1"`) at zero, and
`"Multi"` at two or more — and a user can name a chain "Multi", so a layered pad
and a single-chain one are indistinguishable by name alone. Count the chains to
tell them apart. Writes to it are silently dropped, and Live's `set` still
returns 1.

## A Frozen Track Refuses Clip Writes

Verified against Live 12.4.5, on a track with `is_frozen` reading 1:

| Call                               | On a frozen track          |
| ---------------------------------- | -------------------------- |
| `create_midi_clip` (arrangement)   | refused — returns bare `1` |
| `create_audio_clip` (arrangement)  | refused                    |
| `create_clip` (session slot)       | refused                    |
| `duplicate_clip_to_arrangement`    | refused — returns bare `1` |
| `duplicate_clip_to` (session slot) | refused — returns bare `1` |
| `delete_clip`                      | works — the clip is gone   |

A refused copy returns `1` for a frozen destination and for a type mismatch
alike; a real copy returns `["id", n]`.

An earlier probe on 12.4.3 recorded `duplicate_clip_to_arrangement` as working
on a frozen track, and code and tickets were reasoned from that. Two independent
probes on 12.4.5 disagree, so treat the create and duplicate rows as settled and
the old reading as wrong. `delete_clip` is the one row carried over from 12.4.3
and not re-probed since.

A same-track move never consults `clipCopyBlocker` — that only checks a named
destination — and runs through duplicate and delete, so on a frozen track it has
no guard in front of a refusal. Not verified end to end.

The refusal shows up as the bare `1` above — the same "no object, no answer"
sentinel a call on a nonexistent object returns, so the two are
indistinguishable from the return alone. Read back to tell them apart.

`["id", 0]` is **not** a failure signal: it is Live's void return, and a
successful `delete_clip` answers with it on an unfrozen track too. It only
carries meaning from a call that otherwise returns an object, where it says no
object came back.

`is_frozen` is read-only and Track has no freeze function, so freezing a track
in a probe means driving Live's **Edit → Freeze Track** menu. That acts on the
UI's selected track, and writing `live_set view selected_track` does not move it
— the write reports as applied and the menu still acts elsewhere.

## The Song Loop Doesn't Read Back In The Same Request

Probed against Live 12 through the 2.3.0-rc2 build, on `e2e-test-set`, in both
directions. This is the Set's own loop, not a clip's.

`live_set loop` takes a `set` and lands it, but a `get` later in the **same**
request still answers with the value from before the write. A tool that writes
the song loop and reads it back reports the state it just replaced, one call
behind forever.

`live_set loop_start`, `live_set loop_length` and `live_set start_time` don't do
this — they read back exactly, right after a write. `live_set is_playing` and
`live_set current_song_time` do, for a different reason: Live updates the
transport asynchronously, so a read in the request that started or stopped it
answers with the old state.

So a call that writes the song loop takes the new value from its own arg. A read
is true only when nothing in the same request wrote it — which includes a write
the tool refused to make.
