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
- **update-clip's per-target loop still drops and warns.** Its targets are
  re-ordered and its results re-assembled per clip, so it does not fit the
  helper yet. The move and arrangement helpers are in the same state.
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
- **A type-addressed device path that names nothing still warns as well.**
  `t0/inst` on a track with no instrument substitutes a fallback index and warns
  once per request; the entry then says the path found nothing. Folding that
  warning into the entry's reason belongs with the device-by-type work
  (ADR-0041).
