# ADR-0056: A send's return resolves by id, name, path, then prefix

- **Status:** Accepted
- **Date logged:** 2026-10-01
- **Related:** [ADR-0042](0042-a-skipped-target-keeps-its-slot.md),
  [ADR-0050](0050-an-entry-explains-itself-in-detail.md)

## Context

`sendReturn` and `sends[].return` take a return's id, name, path (`rt0`, return
tracks only) or letter prefix (`A` for `A-Reverb`). One value can fit more than
one return, and the order was never written down. When two fit, the code raised
a `WARNING:`, though the fact is about one send.

## Decision

**First hit wins: id, exact name, path, letter prefix.** Case-insensitive,
except ids.

- An id is exact and can't be shared. Only the ids of the returns being
  addressed count.
- A name beats a path, and a path beats a prefix.
- A prefix matches only before `-` or a space, and an exact name beats it:
  `Delay` finds `Delay`, not `Delay 2`.

When the value also fit another return, the winner is used and the send's own
entry says so in `detail` (`matched by id; "12" is also the name of "Delay"`).
It shows even when the level landed. It never raises a `WARNING:`.

A clash needs a return whose name is another return's id (digits) or an `rt<n>`
path. Live prefixes return names with their send letter (`A-`, `A `), so this
can only happen past Z, where a return gets no letter. The check guards the
order.

## Alternatives rejected

- **Path before name.** A name is what the user called the return, so it wins.
- **Refuse a clash.** The order is deterministic, so there is nothing to refuse.
- **A `WARNING:` block.** The fact is about one send, so it goes on its entry.

## Consequences

- Return tracks and rack return chains share one resolver. Chains have no path
  form.
