# ADR-0037: Arrangement time is part of the path

- **Status:** Accepted
- **Date logged:** 2026-09-02

## Context

Three rules the tool interfaces are built on:

1. An object that exists is addressed by **id or path**, on every tool that
   takes a target, and every result reports both.
2. An object being created has no id yet, so it is addressed by **path alone**.
3. An error or warning about an object names **its path and its id** — or the
   path alone, when there is no id to know.

Arrangement clips broke all three. A path named the _lane_ (`t0`, `t0/l1`), and
a lane holds many clips, so the clip itself was reachable only by id. Worse,
`targetLabel` emitted `t0/l1 (id 63)`: an id for the object and a path for a
different object, in one label shaped to look like both name the same thing.
Rule 3 was not merely unmet, it was misleading.

The missing coordinate was time, carried beside the path as `arrangementStart` —
a second spelling of one location, with its own list-pairing rule.

The same concept had a third spelling. A point on the song timeline could be
written as bar|beat or named by a locator, and every param that took one took
two: `startTime`/`startLocator`, `loopStart`/`loopStartLocator`,
`loopEnd`/`loopEndLocator`, `arrangementStart`/`locator`.

[Path-Standardization.md](../plans/Path-Standardization.md) Phase 5 considered
folding time into the path as `t0@5|1` and rejected it, on three grounds: the
two params are independently usable and `t0@5|1` always names both halves; a
bar|beat position can contain `/`, which `split("/")` would eat; and `@` already
means step interval and bar copy in bar|beat.

## Decision

**A path may end with one bracketed coordinate naming a point on the song
timeline**, and **a song-timeline position is either bar|beat or `loc:<name>`**.
The grammar, the legal shapes, and the list rules are in
[dev/Object-Paths.md](../Object-Paths.md); the build order is in
[Path-Standardization.md](../plans/Path-Standardization.md).

This reverses Phase 5 and, with it, two of ADR-0025's rejections — arrangement
clips as paths, and locators in the grammar. What stands from Phase 5's
reasoning is its framing, restated: a path names a location, and a location
holding exactly one object thereby names that object. Time is what makes an
arrangement location hold exactly one.

### Why Phase 5's objections don't survive

- **"It always names both halves."** The grammar already had a partial
  arrangement address: `toPath: "t2"` moves a clip to track 2 and keeps its
  start. It had lane-without-time and lacked time-without-lane. Adding `[5|1]`
  as a whole path makes it symmetric, and both idioms survive.
- **A bar|beat position can contain `/`.** True — `arrangementStart` accepts
  `±n<fraction>` offsets, so `1|1-n/4` is a real value. That is an argument
  _for_ a delimiter, not against a coordinate. Brackets enclose it. So does a
  locator name, which is user-typed and may contain `/`, `,` or spaces — no
  peel-the-tail scheme survives that, which is why the separator has to be a
  bracket rather than a sigil.
- **`@` is taken.** It is, which is why the syntax is `[...]` instead.

### What the bracket means

**A point on the song timeline.** Deliberately narrow: it admits bar|beat and
locators, and excludes everything else without an exception to remember.

The tempting wider reading — "a key into the parent where the index isn't a
usable address" — would admit device parameters, but it makes `p<note>` a
counterexample already in the field (a drum pad is exactly that, and it is a
segment). Widening the rule later is cheap; carrying an exception from the start
is not.

## Alternatives rejected

- **`t0@5|1`.** Phase 5's candidate. `@` is a third meaning in the time
  vocabulary itself (`1|1x4@n/4`, `@2=1`), which is the collision that matters —
  a model writes both in one call. `[..]` collides only with Stark's chord
  stacks (`[C Eb G]`), a different param and a different dialect, where nobody
  confuses a pitch stack with a location.
- **Sniffing the locator instead of prefixing it** — `startTime: "Verse"`
  resolving by name because it doesn't look like bar|beat. A locator named
  `5|1`, or a typo'd bar|beat, would silently become a name lookup. The prefix
  is required.
- **A path for device parameters** (`t0/d0[Cutoff]`). A param is never a target
  — it is the payload of an `update-device` call whose target is the device, and
  the map form is what makes `{Cutoff: 800, Resonance: 0.3}` one call. A param
  path would be a second spelling with no call that needs it. Revisit if a tool
  ever makes a parameter a target in its own right; automation curves are the
  plausible driver.
- **Moving locator management onto paths.** `update-live-set`'s
  `locatorOperation` / `locatorId` / `locatorTime` / `locatorName` manage
  locators as objects, not as coordinates, and raise their own questions (how do
  you address one that doesn't exist yet?). Unchanged by this ADR.
- **Merging `arrangementLength` or `arrangementSplit` in.** A length is a
  property and a split is an operation. Only the start was an address.
- **An `a<n>` segment.** Still rejected, for ADR-0025's original reason: the
  index into a track's arrangement clip list is unstable and means nothing to a
  user. Time is stable and is what a user already thinks in.

## Consequences

- **`t0[5|1]` means _starts at_, not _covers_.** A clip running from 3|1 through
  bar 6 is not at `[5|1]`; that path resolves to nothing and the call warns and
  skips per [ADR-0035](0035-malformed-calls-are-refused-up-front.md). This is
  the decision most likely to need adjusting: watch whether models recover in
  one turn from the warning (fine, teach it in the Skills) or retry the same
  path (the address needs rethinking).
- **`arrangementStart` leaves the responses**, by the existing rule that no
  result spells its address a second time. Breaking, and the release notes have
  to say so.
- **The list rule now derives instead of being carved out.** ADR-0031's
  "destinations are the exception, in one direction" becomes: a value that fully
  determines a location pairs 1:1; anything that doesn't broadcasts. `t0/s3`
  can't broadcast because a slot holds one clip; `[5|1]` can, because it lands
  each source on its own lane; a name can, because it is a property.
- **Naming an arrangement clip costs a Live API read.** `objectPathForApi` needs
  `start_time` and the song meter where it used to format a track index. Hoist
  the meter once per request, not once per clip.
- **Four params retire and three are unpublished.** Gone: `startLocator`,
  `loopStartLocator`, `loopEndLocator`, `duplicate`'s `locator`. Unpublished:
  `arrangementStart` on create-clip, update-clip and duplicate.
- **`loc:` is for song-timeline positions only.** `create-clip`'s `start` and
  `firstStart` are clip-relative and must not accept it.
