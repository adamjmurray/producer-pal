# ADR-0045: `c+` appends a rack chain

- **Status:** Accepted; extended to devices by
  [ADR-0046](0046-d-plus-appends-a-device.md)
- **Date logged:** 2026-09-13
- **Amends:**
  [ADR-0043](0043-a-plus-belongs-to-the-tool-that-creates-the-object.md)

## Context

Every other creating path spells append with a `+` — `t+`, `rt+`, `t2/l+` — but
a rack chain had none. `ppal-create-device` reached a chain by index and made
the chains up to it, so "add another chain with a device in it" meant reading
the rack first just to learn how many it already had. `ppal-duplicate` appended
a chain copy when `toPath` named a bare rack, which worked but taught nothing.

## Decision

`c+` appends a chain to the rack (or drum pad) the rest of the path names, and
is taken by the tools that make chains: `ppal-create-device`, `ppal-duplicate`
and `ppal-update-device`. The rule stays the one ADR-0043 states — a `+` belongs
to the tool that creates that kind of object — and a chain has three such tools
rather than one. Everything else refuses it, naming them.

`c<n>` is the indexed counterpart and is unchanged: on create-device it fills in
the chains up to `n`.

Neither spelling ever means "insert at n". Live's `insert_chain` only appends,
and there is no API for a rack return chain at all, so `rc<n>` names one that
already exists and nothing creates one.

A `c+` must be the last segment: the chain it makes is empty, so nothing can be
addressed below it.

**Drum Racks.** A chain in a Drum Rack belongs to a pad, and `insert_chain`
gives a new one `in_note` -1 — the catch-all pad, which sounds on every note no
pad claims. So `t0/d0/c+` on a Drum Rack is refused, pointing at the pad
spelling, the same way `c<n>` already refuses to auto-create there.
`t0/d0/pC1/c+` is accepted: a pad holds layered chains, `pC1/c<n>` already makes
them, and the pad supplies the note the new chain lands on.

`ppal-duplicate` is the exception, because a _copy_ carries its source's
`in_note`: `toPath: "t0/d0/c+"` into a Drum Rack lands on the source's own pad,
not the catch-all. It is the same destination the bare rack path names, which
still works but isn't taught.

## Rejected alternatives

- **Leave chains without a `+`.** Consistent with nothing else in the grammar,
  and it kept a read-then-write round trip for the commonest rack edit.
- **Let `c+` mean "insert at the end" everywhere, Drum Racks included.**
  Reporting the catch-all pad in the result would say where the chain went, but
  not undo it: a device there plays on every unclaimed note, which is never what
  "another chain" meant.
- **Refuse `t0/d0/pC1/c+` as well, on the grounds that a pad owns one chain.**
  It doesn't — Live layers several chains on one pad, and `pC1/c1` already
  addresses the second. Refusing would have made the grammar say something
  false.
