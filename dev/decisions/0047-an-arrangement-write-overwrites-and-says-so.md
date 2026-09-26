# ADR-0047: An arrangement write overwrites, and says so on the entry

- **Status:** Accepted
- **Date logged:** 2026-09-19
- **Amended by:** [ADR-0050](0050-an-entry-explains-itself-in-detail.md) — the
  entry's `reason` was renamed `detail`.

## Context

The arrangement timeline has no empty slots. Creating a clip at `t0[5|1]`,
moving one there, or growing one into the bars after it all run over whatever is
standing in that range, and Live does it silently: it wipes a clip out, cuts one
short, or cuts one in two and hands the tail a new id. Nothing in the response
said so. `create-clip` was silent; `update-clip`'s only word on the subject was
a whole-call warning counting clips a batch had moved onto one spot, which named
neither what was destroyed nor where.

That leaves a caller unable to tell a clean write from one that cost them a clip
they never mentioned.

## Decision

**A write into an occupied arrangement range goes ahead.** That is what the
range means: a position on the timeline, not a slot that can be occupied. The
write is never refused, and there is no `force` to opt into it.

**The written clip's entry says what the write cost**, as a `detail`, naming
each clip by the arrangement path it had or has:

- `overwrote the clip at t0[4|1]` — it is gone.
- `shortened the clip at t0[4|1]` — it survives, cut at one end.
- `split the clip at t0[1|1] into t0[1|1] and t0[4|1]` — the write landed inside
  it.

Several are joined with `; `. The lane is photographed before the write and
compared after
([arrangement-write-effects.ts](../../src/tools/shared/arrangement/helpers/arrangement-write-effects.ts)),
so what is reported is what Live really did, not what the call predicted.

**`force` stays reserved for a destruction that is the only way to do what was
asked, and that the caller would not expect** — replacing a drum pad's sample,
which throws away the device already on the pad. Overwriting arrangement clips
is neither: it is the ordinary meaning of the position the caller named, and the
entry tells them about it afterwards.

## Alternatives rejected

- **Refuse the write and offer `force`.** Every arrangement write would need it
  the moment a Set has clips in it, so callers would pass it always and it would
  stop carrying information.
- **Keep the whole-call warning.** It counted clips instead of naming them, said
  nothing about a create or a resize, and a model that skims past `WARNING:`
  blocks reads the call as clean.
- **A `displaced` array of clip ids and paths.** More precise and more
  expensive: every arrangement write would carry a key, and the ids are dead the
  moment they are reported.

## Consequences

- `ppal-update-clip` no longer warns
  `N clips on <lane> moved to the same position`. The later clip's entry says
  `overwrote the clip at ...`, and a clip the call buried without ever moving it
  still reports `deleted: true` (ADR-0042).
- Every arrangement write pays a lane scan before and after it — the clips on
  one lane, with two property reads each. A create reuses the lane object the
  batch already resolved, so a batch pays one lookup, not one per clip.
- The unlooped-audio cap moved onto the entry too: a clip that could not grow
  says
  `arrangementLength unchanged: the audio file has no more content to show`, and
  one that grew part of the way says where it landed. Both used to be whole-call
  warnings about a single clip.
