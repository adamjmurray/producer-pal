# ADR-0053: create-device refuses an index past the end

- **Status:** Accepted
- **Date logged:** 2026-09-30
- **Related:** [ADR-0046](0046-d-plus-appends-a-device.md)

## Context

`ppal-create-device` with `t0/d9` on a two-device track appended the device and
raised a `WARNING:`. `ppal-update-device` refuses the same index on the target's
entry. The fact was about one target, which belongs on its entry, and the two
tools answered the same path differently.

## Decision

**An index past the end of a container is refused** by every tool that places a
device, in the same words
(`"t0/d9" is past the end of a container holding 2 devices`): `ok: false` with
the reason on the path's entry, and a throw when it was the call's only path.
`d+` is how to append.

The check runs before anything is made, so a browser device is never loaded for
a path that will be refused, and no rack chain or drum pad layer the path names
is made first: a chain that doesn't exist yet holds no devices, so only index 0
(or `d+`) is in range there. A path earlier in the same list that creates a
chain counts toward later indices. A refused path in a list inserts nothing, so
later paths are measured against the chain without it.

Index 0 on an empty chain is still an append: it is the end.

## Alternatives rejected

- **Keep appending, say so on the entry.** It guesses what the caller meant, and
  Live itself silently drops such an index in a move.

## Consequences

- `ppal-duplicate` to a device path already refused; all three tools now agree.
- Scripts relying on `t0/d<big>` to append need `t0/d+`; see
  [the migration guide](../../docs/guide/migration.md).
