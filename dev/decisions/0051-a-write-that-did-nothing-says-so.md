# ADR-0051: A write that did nothing says so

- **Status:** Accepted
- **Date logged:** 2026-09-25
- **Amends:** [ADR-0042](0042-a-skipped-target-keeps-its-slot.md)

## Context

An audit of `ok: false` found no entry marked failed that did any work. It found
the opposite: writes that did nothing but read as hits. It also found locators,
duplicate and the named-twice entries saying things differently from the other
tools.

## Decision

**A write the tool can't do is refused on the target's entry**, the same way
routing already is: a `detail` naming what didn't land, `ok: false` when it was
everything asked of that target, and a throw when that target was the call's
only one. This covers:

- a track's `pan` in split mode, `leftPan`/`rightPan` in stereo mode, and a gain
  or pan Live has disabled;
- `mute`/`solo` on the main track, and `arm` on a track that can't be armed;
  turning one of those off is a no-op (a `detail`, no `ok`), since it is already
  off;
- a chain or drum pad's gain, pan or send whose parameter Live has disabled — in
  the entry, not a `WARNING:`, and a refused send keeps its place in `sends`.

**Nested entries count.** When every nested write failed (`sends`, device
`params`, `actions`) and nothing else was asked of the target, the target is
`ok: false` with a `detail` saying none landed. A lone one throws like any
other, and the error names each write that failed. A change the call made on the
way still counts as landed: a pad instrument swapped or a Simpler created for a
sample that then didn't load keeps the target's entry, since a throw says
nothing changed.

**A clip another clip in the call was moved onto says so**, whether it was
buried or held back: `deleted: true` and the same `detail`. A duplicate copy a
later copy deleted is reported the same way (`deleted: true` and a `detail`),
replacing `overwritten: true`. One a later copy only cut short still exists, so
it keeps its entry with a `detail` saying so.

**Locators follow the rest of the tools:**

- `create` where a locator already is does nothing. With no `locatorName` that's
  a no-op (a `detail`, no `ok`); with one, the name didn't land, so it's
  `ok: false` and the `detail` points to `rename`. The existing locator is never
  renamed by a create.
- `delete` of a locator that isn't there is a no-op, as `ppal-delete` of a
  missing target is.
- A no-op is not labelled a skip: `operation: "skipped"` goes with `ok: false`
  only.
- A lone locator refusal throws when the locator was the call's only work. When
  the call also changed something else (tempo, say), the locator keeps its
  `ok: false` entry so the error doesn't hide what landed.

**Named twice, last wins, in one wording.** A target named again later still
gets written by the later mention, so the earlier entry is not a failure: a
`detail`, no `ok`. A destination named again later means the earlier source's
clip was never made or moved there, so that move or create is refused:
`ok: false` when it was all that was asked. Both say "named again … later in
this call".

## Alternatives rejected

- **Rename the existing locator on a create.** A create that edits something
  else surprises; `rename` already does that job.
- **`ok: false` for deleting a missing locator.** The delete's goal is already
  met, as ADR-0042 holds for every other delete.
- **Always throw a lone locator refusal.** The call may have set tempo or other
  song state; throwing would hide that it landed.

## Consequences

- A model can trust a hit: a write with nothing behind it is marked.
- Scripts reading `overwritten: true` off duplicate, or a locator no-op's
  `operation: "skipped"`, need updating; see
  [the migration guide](../../docs/guide/migration.md).
