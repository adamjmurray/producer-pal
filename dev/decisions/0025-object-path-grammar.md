# ADR-0025: One object-path grammar, scoped to clips and devices

- **Status:** Superseded in part by
  [ADR-0036](0036-paths-address-tracks-and-scenes.md) — the scoping to clips and
  devices only — and by [ADR-0037](0037-arrangement-time-is-part-of-the-path.md)
  — arrangement clips and locators. The grammar itself stands.
- **Date logged:** 2026-08-16

## Context

Device params spoke a path grammar (`t1/d0`, `t0/d0/pC1`) while clips used bare
`trackIndex/sceneIndex` slots (`0/3`). 2.2.0 unified the destination params onto
`toPath`, which left one concept with two spellings across the toolset and two
parsers behind it — `parseDestinationPath` handles the clip shapes and punts
everything else to `resolvePathToLiveApi` as an opaque string.

Models paid for the split: `create-clip` drew `trackIndex` + `sceneIndex`
guesses on 8 of 10 first attempts in one eval, and a slot read out of a result
would not go back into a `path` param.

The grammar and its rules are in [dev/Object-Paths.md](../Object-Paths.md).

## Decision

One grammar, one parser, one result spelling. A path's segment index is always
the Live API index. `path` names where an object is; `toPath` names where it
goes, and only appears on tools that also name a source.

Paths address **clips and devices**. Tracks and scenes keep `trackIndex` /
`sceneIndex` on the read, update, and create tools.

## Alternatives rejected

- **Move every tool onto `path`.** The cleanest rule, and briefly the plan.
  Rejected because `read-track`, `read-scene`, `update-track`, and
  `update-scene` are small, long-stable, and have no competing spelling to
  reconcile — the confusion this grammar fixes is specific to clip slots. `s3`
  still parses and `select` takes it; `playback` names a scene with
  `sceneIndex`. Nothing unpublishes `sceneIndex`.
- **`trackIndex` / `sceneIndex` as insertion positions on `create-track` and
  `create-scene` → `path`.** They create the location rather than address one,
  and `create-track type:"return"` would collide with an `rt` root.
- **1-based take-lane segments, to match the existing `takeLane` param.** Would
  make `t0/l1` the _first_ lane while `t0/s1` is the _second_ scene. Rejected
  for the invariant: `Track.take_lanes` excludes the main lane, so 0-based `l`
  maps 1:1 onto the Live API and the main lane gets a natural spelling (no
  segment at all). The param becomes an alias instead.
- **No take-lane segment; keep `takeLane` as a sibling.** It looked like churn
  serving only the two tools that already worked. It is not: without `l`, a
  take-lane clip has no correct result path, so result round-tripping ships with
  a hole, and `update-clip` still cannot move a take-lane clip.
- **`lnew` for appending a lane.** `l+` reads as "one more" and is shorter; `+`
  already means that in duration syntax (`1bar+n/4`).
- **An `a<n>` segment for arrangement clips.** The index into a track's
  arrangement clip list is unstable and means nothing to a user. Arrangement
  clips are addressed by id, or found through `read-track`. _(The `a<n>`
  rejection stands; addressing by id alone was reversed by
  [ADR-0037](0037-arrangement-time-is-part-of-the-path.md), which spells the
  coordinate as time rather than an index.)_
- **A locator segment.** Locators are song-timeline objects, not points in the
  track/scene coordinate space. The `locator` param takes an id or a name.
  _(Reversed by [ADR-0037](0037-arrangement-time-is-part-of-the-path.md): once
  the grammar carries song time, a locator is one spelling of a point on it.)_
- **Reverse segment order (`s3/t0`).** One canonical spelling; the "did you
  mean" steer is cheap.
- **Keeping `slot` alongside `path` in results for a release.** Spends context
  on every clip result and re-teaches the spelling being retired, dragging the
  deprecation into 2.3.0. Results emit `path` only, including code-exec's
  `location` object — a user-visible break, announced in the release notes.
- **Erroring on a legacy `"0/3"` value instead of honoring it.** The error
  self-corrects in one round trip and never entrenches the old spelling, but it
  is the same trade already taken on hidden params: honor the well-founded
  guess, warn to teach.

## Consequences

- Merging the two parsers is a prerequisite, not cleanup. While they are
  separate, "one grammar" is a claim in a doc rather than a property of the code
  — the class of bug where `select path="rt0"` reports
  `Path must include at least a device index` recurs by construction.
- Take lanes must land before results, or take-lane clips have no path to
  report.
- `formatSlot` / `parseSlot` / `parseSlotList` retire with the deprecated `slot`
  / `slots` / `toSlot` params. Sequence the two removals together.
- Result changes break `location.slot` in user-written code transforms, the eval
  harness assertions, and the e2e result types.
- Revisit if tracks or scenes ever grow a second addressing spelling of their
  own — that is the condition that made clips worth moving.
