# ADR-0038: `l=` names the lane the `l+` before it appended

- **Status:** Accepted
- **Date logged:** 2026-09-03

## Context

[ADR-0037](0037-arrangement-time-is-part-of-the-path.md) put the song position
inside the path, which retires `arrangementStart`. One idiom went with it.

`toPath: "t2/l+"` with `arrangementStart: "9|1, 13|1"` stacks both copies on a
single new take lane: the destination list cycles, and a cycled repeat of one
written `l+` reuses its lane. Written as paths that becomes
`toPath: "t2/l+[9|1], t2/l+[13|1]"` — and each written `l+` appends its own
lane, so it is two lanes with one clip each. Both readings are wanted, and the
path spelling could only express one of them.

The lost one is not a corner: a stack of takes at bars the user chose is the
take-lane feature's own workflow.

## Decision

**A new segment, `l=`, names the lane the `l+` before it in the same list
appended.** `toPath: "t2/l+[9|1], t2/l=[13|1]"` is one new lane holding both;
`t2/l+, t2/l+` is still two lanes, which is what the variation workflow wants.

**An `l=` with no `l+` before it is refused up front**, before any lane is
created. Lanes are permanent — Live has no delete — so a call that appended
lanes for the earlier entries and then failed would strand them.

## Alternatives rejected

- **A coordinate holding several positions** — `t2/l+[9|1,13|1]`. Reads better
  and would shorten ordinary lists too, but it splits on commas inside the
  brackets, which is the one thing ADR-0037 put brackets there to avoid: a
  locator name is user-typed and may contain a comma. It would work everywhere
  except on the names most likely to need it, and that exception has to be
  remembered forever.
- **`l+0`, `l+1`** — number the appends explicitly. Self-describing, but `l+1`
  and `l1` differ by one character and name completely different lanes: one the
  second lane this call appends, the other the track's existing second lane.
- **Repeated `l+` entries share a lane.** Restores the stack without new
  grammar, but takes the variation workflow (`t2/l+,t2/l+,t2/l+` for three
  lanes) with it, and makes the meaning of `l+` depend on whether it carries a
  coordinate.
- **Keep `arrangementStart` alive for this one case.** The param the release
  exists to stop teaching, kept for the shape paths can't say — which is an
  argument for fixing the paths.

## Consequences

- **Two mechanisms implement one rule.** create-clip and duplicate resolve every
  destination's lane before writing any clip, so they number the `l+` entries
  and key the resolved lanes by that ordinal. update-clip resolves lanes as each
  clip moves — deliberately, so a clip that can't move doesn't leave a lane
  behind — so it carries the ordinals through the batch and shares the lanes it
  appends in a map.
- **`l=` names no clip.** Like `l+`, it is a lane that does not exist yet, so it
  is refused as a source or as a clip to read.
