# ADR-0042: A skipped target keeps its slot in the result

- **Status:** Accepted
- **Date logged:** 2026-09-12
- **Amends:** [ADR-0009](0009-warn-and-skip-error-handling.md)

## Context

A call naming N targets answered with fewer than N entries. `update-track`,
`update-scene` and `update-device` dropped a target they couldn't reach and said
so in a warning; `delete` kept the slot but marked it `deleted: false` and
warned as well. So the same event was reported four ways across the write tools,
and in two of them the caller had to match a warning's prose back to a position
in an array that no longer had a slot for it.

Worse, a dropped target reads as a success. `update-track` with `path: "t0,t99"`
returned one entry, and a model that skims past the `WARNING:` block sees a call
that did what it asked.

The read tools had already settled the shape
([0543a591](https://github.com/adamjmurray/producer-pal/commit/0543a591)): one
entry per target, and a target that couldn't be read holding its slot as
`{ id | path, ok: false, reason }`.

## Decision

**N targets named, N entries back, in the order named.** A target the call
couldn't carry out keeps its slot as a skip entry:

- `id` or `path` is **exactly the caller's spelling** of that target, under the
  param that named it. It is all they have to match the entry on.
- `ok` appears **only on a skip**. A target that worked says so by having a
  result, and a key per hit is paid for again and again in the caller's context
  window.
- `reason` is prose — the same words a single target would have thrown. No
  snake_case slugs.
- **A skip is never also a warning.** Anything about a target belongs in that
  target's entry; warnings are for what no entry can hold.

**One target that can't be done throws.** Nothing was written and there is no
list for an entry to hold a place in, so the reason goes back as the error it
would have been all along. `update-track path="t99"` used to return `[]` and a
warning.

**A target that needed no work is not a skip.** It gets its normal entry plus a
`reason` saying why there was nothing to do, and no `ok`: `delete` of a missing
`t99` is `{ path: "t99", type: "track", reason: "nothing to delete" }`. The
delete it asked for has already happened, so a lone one is satisfied rather than
refused — only a lone `ok: false` throws.

**A target the call could only half serve keeps its normal entry too.** Some
params landed and some did not, so the entry is the one a full hit would have
plus a `reason` naming what did not land. `ok: false` is for the other case:
nothing the call asked of that target landed.

**A read miss stays `ok: false` even so.** A read can't be satisfied by an
absent object: there is nothing to report about it, where a delete's goal is
exactly that absence.

Malformed calls are still refused up front (ADR-0035) — a hole in a list, a
single-target location param beside a list. Those are about the call, not a
target, so no entry exists yet to carry them.

## Alternatives rejected

- **Keep dropping a target and warning.** What this replaces. A short array
  can't be paired against the call by index, and the result reads as a complete
  success to a model that doesn't read warnings.
- **`ok: true` on every hit.** Symmetrical, and it spends context on every entry
  of every list read to say what the entry's own existence says. Results nest
  inside a Live Set read, where that cost is paid per object.
- **`deleted: true` / `deleted: false` everywhere.** `delete`'s own spelling,
  generalized. `deletedPath` already says the object was removed, and a second
  flag per hit carries no information the address doesn't; the false case is
  what `ok: false` now says in a way every tool can share.
- **"nothing to delete" as `ok: false`.** Simpler to implement and wrong: it
  would make `delete t99` an error for a Set that is already in the state the
  caller asked for, and a model retrying it can never succeed.
- **A skip entry for a target that needed no work, with no reason.** Silent
  no-ops read as hits. The reason is what stops a model from believing a clip it
  never had was deleted.

## Consequences

- **`deleted` is gone from `ppal-delete`.** A removed object reports
  `deletedPath`, a pad that was cleared reports `path`, and a failure reports
  `ok: false` with a reason. Documented for callers in
  [migration](../../docs/guide/migration.md).
- **Per-target warnings moved into entries.** The Producer Pal device, the host
  track, the main track, a take-lane clip, a rack chain, a delete Live refused —
  each is a `reason` on its own entry now, and warns nowhere.
- **One helper owns the fan-out.**
  [`writeFanOut`](../../src/tools/shared/validation/lists/write-fan-out.ts) runs
  each target's body in a try/catch and turns a throw into that target's skip
  entry, sharing the entry shape with
  [`readFanOut`](../../src/tools/shared/validation/lists/read-fan-out.ts)
  through
  [`named-targets.ts`](../../src/tools/shared/validation/lists/named-targets.ts).
  A per-target body therefore throws where it used to warn-and-continue —
  including update-device on an object it can't write and on a drum pad with no
  chains, which Live ignores every write to.
- **A path lookup reports a miss instead of raising it.** `existingId` returns
  the reason, and a resolver throws only for a path naming the wrong kind of
  thing — which is what lets `delete` tell "nothing is there" (a no-op) from
  "that isn't a track" (a skip). The warn-and-null list lookup stays for the
  tools whose per-target loops are not yet converted.
- **update-clip answers per target named, not per clip reached.** Its targets
  resolve up front, the plan carries which target each clip (and each piece a
  split cut it into) belongs to, and the results are assembled back into call
  order. The `name` and `color` lists pair by that target's place too, so a skip
  doesn't slide the names after it onto the wrong clips and every piece of a
  split takes the name its own target asked for. A target whose path or id found
  no clip, or that the deadline never reached, holds its slot as a skip; so does
  one whose only requested work — a move, a position, a split — was refused
  outright, since where the clip still sits is nothing the caller asked about. A
  clip named twice holds its second slot as a normal entry saying the update
  already happened, and a clip that was written but not as asked keeps its entry
  with a `reason`: a throw partway, a move refused beside a name or a length
  that landed, a re-create and what it cost, a take-lane leftover. A param the
  clip can't take — notes, preTransforms, duplicateLoop or quantize on an audio
  clip, warp markers on a MIDI clip, firstStart on a clip that isn't looping or
  past its content end, warping off while looping — is a reason on its entry
  too, and a skip when it was all the call asked of the clip. The move and
  arrangement helpers report all of it on the clip's entry instead of warning,
  through a per-call collector keyed by the clip id the call found; a step that
  writes under a new id — a move re-creates the clip — hands its reasons back to
  the id the caller named. One target never answers with no entries: a split
  whose pieces the rescan can't find says so too.
- **A take lane reports the params it has no use for.** `ppal-update-track`
  writes a lane's name and nothing else, so everything else the call sent is a
  `reason` on the lane's own entry, which otherwise reads like any other hit.
  `ok: false` only when the lane was neither created nor named, so nothing the
  call asked of it landed.
- **duplicate answers per destination named.** A destination no copy landed at
  keeps its slot as `{path, ok: false, reason}` — a missing clip slot, a track
  that won't take the clip, a copy Live declined, a take lane past the cap, a
  re-create that failed, a destination the deadline never reached, one the plan
  dropped because a clip slot can't take an arrangement copy. A copy that landed
  incomplete is a clip entry with a `reason`, not a skip: it exists, so losing
  it from the result would cost the caller a clip. The path is spelled the way a
  copy that landed there would report it, so it pastes back into `toPath`. The
  deadline warning still names what it never reached, and counts only copies
  that exist.
- **A device, chain or drum-pad copy also answers per destination**, addressed
  by the caller's own spelling of that `toPath` entry. It names a rack or a pad
  rather than a clip, and the caller has only what they wrote to match it on.
  Where nothing named a destination — a chain or device appending to its own
  rack — the entry is addressed by the source's `id` or `path` instead. A
  destination that used to drop out with a warning (no rack there, a rack of the
  wrong kind, a path naming something that isn't a pad, a pad copied onto
  itself, a destination Live wouldn't take the copy at) is that entry's `reason`
  now. So is a source no destination could be copied from, such as a return
  chain: it is reported on every destination it was given, and a lone one
  throws. A copy that landed incomplete keeps its entry with a `reason` rather
  than being rolled back — a chain whose devices didn't all cross, a pad copy
  that layered onto chains already there. `count`, which none of these types
  uses, is still a warning: it is about the call, not a destination.
- **update-device's per-param drop paths became entries.** A `params` list
  answers with one entry per param sent: a disabled param, an ambiguous name, an
  unreadable value, a unit that can't be checked, a write Live ignored, a nested
  path that resolved to nothing, a resolution that threw, a param a chain or pad
  has no use for — each is `ok: false` with a reason on that param's own entry
  now, and warns nowhere. A param whose value Live changed on the way in (a
  clamp, the nearest step of a coarse ladder) reports the value it reads as plus
  the reason, and no `ok`. A specialized pseudo-param whose `write` refuses the
  value is the one left: it still reports no entry and warns, because that
  contract is a boolean across every device spec.
- **A type-addressed device path that names nothing reports once.** `t0/inst` on
  a track with no instrument substitutes a fallback index, and what the
  container does hold rides back on the resolution instead of a warning: the
  target's own report carries it
  (`nothing at path "t0/inst": t0 has no instrument`), whether that is an
  entry's reason or a single-target error. The fallback index lands one past the
  last device, so `delete` reads it as the empty place an out-of-range `d<n>`
  names: `nothing to delete`, and no `ok`.
