# ADR-0016: One fragment per notation is the tool-gating floor

- **Status:** Accepted
- **Date logged:** 2026-07-29

## Context

`src/skills/fragment-tool-gates.ts` drops a skills fragment when every tool it
teaches is disabled, so a caller stops paying for guidance it can't act on. The
notation heads are gated on `NOTE_TOOLS`, one list spanning both the three read
tools and the two clip writers.

That gate is coarser than the content. A read-only caller still gets the whole
authoring guide. Measured against `barbeat-standard` (~2.3k tokens), the
sections a read-only caller can never use come to roughly 680 tokens
conservatively (the update-clip section, bar copying, and the examples), or
about 1,160 if you also count the repeat and bracket sugar, which is input-only
and never serialized. The other heads have far less to give back, so the payoff
is concentrated almost entirely in `barbeat-standard`.

## Decision

Keep one fragment per notation per depth. The read/write split is not taken now,
and the coarse gate is deliberate rather than an oversight.

The blocker isn't the gate table — adding a `barbeat-authoring` fragment gated
on the writers is a handful of lines. It's the override contract. A slot name
keys a user's override file to a built-in fragment (ADR-0010). Splitting the
fragment while keeping the `barbeat-standard` name leaves anyone with an
override in a state nothing can detect: their file still holds the authoring
sections, and the new fragment appends them a second time. `RETIRED_SKILL_SLOTS`
can't help — it announces a slot that went away, and this name doesn't. Retiring
the name to force the warning trades silent duplication for silently losing
everyone's customization.

So the split needs an override-migration answer first, which is a bigger change
than the token saving justifies.

## Alternatives rejected

- **Split now, keep the slot name** — silently duplicates the authoring sections
  for every user with an override.
- **Split now, retire the slot name** — fires the warning, but orphans every
  existing override of the most-customized fragment.
- **Gate the notation heads on the writers only** — strictly worse: a read-only
  caller then loses the grammar it needs to parse what `ppal-read-clip` returns.
  `NOTE_TOOLS` spans both directions for exactly this reason.

## Consequences

- A read-only worker carries ~680–1,160 tokens of authoring guidance it can't
  use. Not wrong output, just dead weight in a document whose design constraint
  is brevity.
- **Revisit trigger:** an override-migration mechanism that can detect "this
  override predates a split"; read-only workers becoming common enough that ~1k
  tokens each matters; or `barbeat-standard` needing a split anyway, at which
  point this saving comes free. If reopened, the conservative cut is the safe
  one — a model reading serialized output still benefits from recognizing the
  repeat and bracket forms it could have been written in.
