# ADR-0016: One fragment per notation is the tool-gating floor

- **Status:** Accepted
- **Date logged:** 2026-07-29

## Context

`src/skills/fragment-tool-gates.ts` drops a skills fragment when every tool it
teaches is disabled, so a caller stops paying for guidance it cannot act on. The
notation heads are gated on `NOTE_TOOLS`, one any-of list spanning **both** the
three read tools (`ppal-read-clip`, `-track`, `-scene`) and the two clip writers
(`ppal-create-clip`, `-update-clip`).

That makes the gate coarser than the content. A read-only caller — the read-only
subagent worker the gating feature cites its savings for — still receives the
whole authoring guide. Measured against `barbeat-standard` (~9.2k chars, ~2.3k
tokens), the sections a caller with no write tool can never use are:

| Section                                                                      | Share               |
| ---------------------------------------------------------------------------- | ------------------- |
| `### Editing Existing Notes (update-clip)` (names `preTransforms`)           | ~140 tok            |
| The `- copying bars` bullet (`@N=M` buffer syntax)                           | ~90 tok             |
| `## Examples`, `### Bar Copying`, `### Repeats with Variations`              | ~450 tok            |
| **Conservative subtotal**                                                    | **~680 tok (29%)**  |
| Repeat patterns (`x<count>@step`) + pattern brackets `[...]`                 | ~480 tok            |
| **Aggressive subtotal** (both are input-only sugar a serializer never emits) | **~1160 tok (50%)** |

The other heads have far less to give back: stark's write-only content is
essentially one merge sentence plus its input-only chord symbols, and
`midi-json` / `barbeat-basic` are small to begin with. The payoff is
concentrated almost entirely in `barbeat-standard`.

## Decision

Keep one fragment per notation per depth. The read/write split is **not** taken
now, and the coarse `NOTE_TOOLS` gate on the notation heads is deliberate rather
than an oversight.

The blocker is not the gate table — adding a `barbeat-authoring` fragment gated
on `[CREATE_CLIP, UPDATE_CLIP]` is a handful of lines. It is the override
contract. A slot name keys a user's override file to a built-in fragment
(ADR-0010), and splitting a fragment while KEEPING the `barbeat-standard` name
leaves anyone carrying an override in a state nothing can detect: their file
still holds the authoring sections, and the new fragment appends them a second
time. `RETIRED_SKILL_SLOTS` cannot help — it announces a slot that went _away_,
and this name does not. Retiring `barbeat-standard` to force the warning trades
a silent duplication for a silent loss of everyone's customization.

So the split needs an override-migration answer first, and that is a larger
change than the token saving justifies bundling into a gating fix.

## Alternatives rejected

- **Split now, keep the slot name** — silently duplicates the authoring sections
  for every user carrying a `barbeat-standard` override, with no mechanism that
  notices.
- **Split now, retire the slot name** — fires the intended warning, but orphans
  every existing override of the single most-customized fragment.
- **Gate the notation heads on the writers only** — strictly worse: a read-only
  caller then loses the grammar it needs to _parse_ what `ppal-read-clip`
  returns. `NOTE_TOOLS` spans both directions for exactly this reason.

## Consequences

- A read-only worker pays ~680–1160 tokens of authoring guidance it cannot use.
  Not incorrect output, just dead weight in a document whose stated design
  constraint is brevity.
- The one-fragment-per-notation granularity is now the documented floor, so a
  future reviewer reads it as a decision rather than a missed case.
  `fragment-tool-gates.ts` points here from `NOTE_TOOLS`.
- **Revisit trigger:** any of — an override-migration mechanism that can detect
  "this override predates a split" (which would also unblock re-carving other
  fragments); read-only workers becoming a common enough profile that ~1k tokens
  each is worth the churn; or `barbeat-standard` needing a split for an
  unrelated reason, at which point this saving comes along free. If reopened,
  the conservative subtotal is the safe cut — the repeat/bracket sugar is
  input-only in principle, but a model reading serialized output benefits from
  recognizing the forms it could have been written in.
