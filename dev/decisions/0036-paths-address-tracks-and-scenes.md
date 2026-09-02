# ADR-0036: Paths address tracks and scenes too

- **Status:** Accepted
- **Date logged:** 2026-09-02

## Context

[ADR-0025](0025-object-path-grammar.md) scoped paths to clips and devices and
named its own revisit condition: "if tracks or scenes ever grow a second
addressing spelling of their own."

They had one already. `trackIndex` counts regular tracks, so naming a return
track or the main track needed `trackType` beside it — two params for one
object, and a `type` that answered both which signal a track carries and what
role it plays. Meanwhile `rt0` and `mt` parsed, and `select` took them, but
`read-track` and `update-track` did not. A path a model read out of one result
would not go back into the next call.

## Decision

Tracks and scenes are addressed by `path`, like everything else. Reads and
writes take one and report one. `trackType` and the read tools' `index` params
retire; `type` says only `midi` or `audio`, and nothing at all on a return or
the main track, where the path carries the role.

Creating takes a path too, through three roots that name a place rather than a
thing: `t+` appends a track, `rt+` adds a return track, `s+` appends a scene.

Details in [dev/Object-Paths.md](../Object-Paths.md); the build order is in
[dev/plans/Path-Standardization.md](../plans/Path-Standardization.md).

## What this reverses in ADR-0025

- **"Move every tool onto `path`."** Rejected there because the track and scene
  tools were "small, long-stable, and have no competing spelling to reconcile."
  The second half was already untrue: `trackType` was the competing spelling,
  and it was the one a return track needed.
- **Insertion positions staying as `trackIndex` / `sceneIndex`.** Rejected
  partly because `create-track type:"return"` would collide with an `rt` root.
  The `+` roots settle it — `rt+` is the request, so `type: "return"` stops
  being offered (the handler still accepts it).

## Alternatives rejected

- **`rt<n>` as a create position.** Live always appends a return track, so a
  path naming a position it cannot honor would quietly build somewhere else.
  Refused on create; it still reads.
- **`type: "audio"` on a return and the main track.** The value would be
  constant, and it reads as an invitation to put an audio clip there, which Live
  does not allow. Absent says more than a constant.
- **A hard break on `create-track type:"return"`.** Unpublishing it teaches
  `rt+` without refusing a caller who names the old value. This is what
  separated the two enum trims in `param()`: a mode's own `excludeEnumValues`
  refuses a value, `default`'s only hides it.

## Consequences

- `type` no longer distinguishes a return track, so a result's `path` is the
  only thing that does. A reader keying off `type === "return"` breaks.
- A Live Set read reports `mainTrack`, not `masterTrack`. Internal identifiers
  mirroring the Live API property (`master_track`, `category: "master"`) keep
  the old spelling.
- Every read tool that reported an index now also reports a path, so the round
  trip only pays off if the Skills say the loop closes — hence the
  `object-paths` fragment.
- Graded before merging: three models across two eval scenarios used every new
  spelling correctly on the first attempt, including a local 27B under the
  reduced small-model schema.
