# Results, Errors and Warnings

How results, errors and warnings spell a path, including a drum chain's two
spellings. Part of [Object Paths](README.md).

## Results

Every write result — create, update, duplicate — reports `path` beside `id`, so
the next call can address what was just written without rebuilding the path from
indices. No result repeats that address as an index: no `slot`, no `trackIndex`,
`sceneIndex`, `deviceIndex` or `returnTrackIndex` — no exceptions, so there is
nothing to remember.

`delete` reports its address under the key that says whether the object is still
there. `deletedPath` is where the object _was_: after deleting `t2` that path
names a different track, so it addresses nothing worth calling again. `path`
means the target outlived the call — a drum pad, whose 128 slots are permanent,
so a delete clears its chains and leaves the slot. The rack then reads exactly
as it would for a pad that was never filled; see
[ADR-0034](../../decisions/0034-a-drum-pad-is-a-slot-chains-are-layers.md).
There is no `deleted` flag: the key is the answer, and a target the call
couldn't delete says so as a skip.

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

A result always gives the pad-relative spelling — for the chain, and for
anything hanging below it, a device included. It survives longer: the layer
index shifts only when that pad's own layers change, where a rack index shifts
on any chain added or removed anywhere in the rack. Live's own path is the
rack-relative one, so `objectPathForApi` converts it, which costs a rack read
per drum-chain ancestor in the path. A path with no chain segment at all, or one
under a non-drum rack, pays only a cheap type check to find that out and stops
there.

Rack-relative still resolves on input — it is Live's own numbering, and older
results handed it out, so refusing it would break a caller holding one of those.
Resolving one against a real drum chain warns once per request (see
[Errors and warnings](#errors-and-warnings)), so the caller learns the pad
spelling before a layered pad makes the two disagree.

An update echoes whichever spelling still names where the object is. Only a
device move replaces the address the call reached the object by, and only once
Live confirms it arrived — a refused move, a skipped Producer Pal device, and a
drum chain's pad re-map all keep the addressing spelling. The re-map leaves the
chain's path stale, but harmlessly: a container spelled through a pad always
resolves to a chain, and a chain's parent is the rack, so the check below never
matches and the path is re-derived from the new `in_note`. A target named only
by `id` spelled no container, so its path stays derived — which is the same
pad-relative answer echoing would have given.

Echoing only ever replaces the container the call actually named, and it can
only ever agree with the derived path now: a chain copy whose destination rack
is spelled rack-relative (`toPath: "t0/d0/c2/d0"`) gets pad-relative ancestors
either way.

`pathField` does the substitution. It takes the resolved container as well as
its spelling, so it can check that the spelling really names the object's parent
before trusting it. Two things about that check are load-bearing: the container
must be resolved **from the spelling**, since one taken off the object proves
nothing, and the test must be **identity, not containment**, in either
direction. `pC1/c1` minus its last segment is `pC1`, which resolves to the pad's
_first_ layer — so a descendant test accepts a sibling chain, and an ancestor
test grafts the object's segments onto its grandparent.

Only a parent written through a pad is substituted. Every other path has one
spelling, and the derived path is read off the object.

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

[Rule 3](README.md#why-a-path-exists) in full: a message about an object names
**both spellings** — `t1/d0 (id 7)` — because the caller addressed it by one of
them and can't be expected to map the other back. When there is no id to know,
the path stands alone: a path that resolved to nothing is quoted as the caller
wrote it, and an object that doesn't exist yet has only a path. When there is no
path to spell, the id stands alone.

One helper owns this —
[`targetLabel`](../../../src/tools/shared/validation/object-path-for-api.ts) and
its variants, over `objectPathForApi`. A message that builds a path by hand is a
bug: it drifts the first time the grammar changes. That's also the check on the
coordinate work — once `objectPathForApi` spells `t0[5|1]` every warning gets it
free, so a large sweep means messages aren't going through the helper.

Name the path and show the fix, never restate a requirement in index terms.

A path that names a drum chain rack-relative — the chain itself or anything
below it — warns once per request, even off a rack with no layered pad yet:
teaching the rule only after it bites is too late. The warning carries the
pad-relative spelling, so the caller can start writing it. A comma-separated
list making the same point several times over only gets told once.
