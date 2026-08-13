# ADR-0020: `looping` preserves the clip's region

- **Status:** Accepted
- **Date logged:** 2026-08-09

## Context

Live keeps two regions per clip and `looping` picks which one plays — the
markers while it is off, the loop brace while it is on. Flipping the flag
reveals whatever the other pair was last left with rather than carrying the
region over, so `ppal-update-clip` with a bare `looping` used to resize the clip
with no warning, in both directions. See the loop toggle section of
`dev/Coding-Standards.md` for the mechanics.

## Decision

`looping` changes the loop flag and nothing else. `update-clip` restates the
region that was playing into the pair that `looping` newly selects, unless the
call gives `start`/`length` of its own.

## Alternatives rejected

- **Match Live's UI** — its Loop button restores the brace it remembers. But the
  inactive pair is invisible through `ppal-read-clip`, so the model cannot
  predict it, report it, or restore it deliberately. It would be the one
  parameter whose result the model can't reason about.
- **Warn and let the region jump** — spends context on a common operation to
  report something the caller almost never wanted, and the usual next move is a
  second call putting the region back.

## Consequences

- The bare form now agrees with `looping` plus `start`/`length`, which already
  preserved the region because the flag is written before the region.
- Where a toggle happens, both of Live's pairs end up holding the same region,
  so nothing stale is left to surface later.
- A caller wanting Live's remembered brace can't get it from us. Nothing could
  ask for it before either — it has never been readable.
