# ADR-0019: A notation head may split off a `-write` sibling

- **Status:** Accepted
- **Date logged:** 2026-07-30
- **Supersedes:** [ADR-0016](0016-notation-head-gating-granularity.md)

## Context

ADR-0016 made one fragment per notation per depth the tool-gating floor, so a
read-only caller pays for the authoring guide it cannot use. It was explicit
that the gate table was not the blocker — a `-write` fragment gated on the two
clip writers is a handful of lines — and that the override contract was:
splitting `barbeat-standard` while keeping the name duplicates the authoring
sections for anyone carrying an override of it, with nothing able to detect
that. Its revisit trigger was an override-migration answer.

The answer turned out not to be a mechanism. Adam's call: **nobody has
customized skills yet**, so there is no install base to migrate. That removes
the only thing standing in the way, and the window where a split is free is now.

The measured case for taking it: `barbeat-serializer.ts` emits only
`v/n/p pitch(es) bar|beat` with comma-merged beat lists and `±n` offsets. It
never emits a repeat pattern, a pattern bracket, a bar copy, or a `v0`, so a
read-only caller provably never encounters that syntax. The carve moved 5,275 of
the head's 8,954 chars — **59%** — behind the writers' gate.

## Decision

A notation head MAY spin its authoring syntax out into a `-write` sibling
fragment, gated on `NOTE_WRITE_TOOLS` (`ppal-create-clip`, `ppal-update-clip`).
The base head keeps both its name and its meaning: the format, minus what only a
writer can use.

That last part is the load-bearing bit. Because the base name survives, the
standard driver's `@include "./{notation}-standard.md"` line never changes, no
slot is retired, no alias is added, and each notation opts in separately. The
`-read` / `-write` symmetry considered first would have renamed the base ref,
which forces an alias for every notation that _isn't_ split — real complexity
bought for nothing.

Only `barbeat-standard` is split. `stark-standard` and `midi-json` register an
EMPTY `-write` fragment so the notation-templated ref resolves, the same
present-but-empty shape `code-transforms` uses in a release build.

**Carried out since (2026-08-02):** `barbeat-basic` and both stark heads are
split too, and the basic driver gained the second notation line the standard one
already had. This is the "costs no new decision" follow-through the last
Consequence below anticipated, not a change of decision. midi-json still has no
authoring half, so it now registers an empty `-write` fragment at both depths.

## Consequences

- A read-only worker's bar|beat guidance drops from ~8,950 to ~3,680 chars.
- `barbeat-standard-write` `requires` `barbeat-standard`, and
  `NOTE_WRITE_TOOLS ⊂ NOTE_TOOLS`, so the requires-subset invariant holds and
  gating still needs no transitive close.
- Two lines had to be **rewritten rather than moved**, and they are where a
  regression would surface first: the meter paragraph in `## Positions & Meter`
  (its "use a repeat pattern instead" prescription moved to the write half; the
  meter FACT stayed, since reading positions in 6/8 needs it), and the
  comma-list bullet (its "or repeat pattern" clause moved, restated by the write
  half's lead-in). Leaving either mention behind is the `transforms-core`
  failure mode — vocabulary whose grammar is gone.
- If someone _does_ turn out to have a `barbeat-standard.md` override, their
  copy of the authoring sections ships alongside the built-in write fragment.
  The only signal is the existing ⚠ "default changed since you forked" badge in
  the Skills editor. Accepted on the no-install-base call.
- `transforms-core` gates on `[create-clip, update-clip, duplicate]` and
  mentions `v0` in `notes` strings and "generate with repeats/bar-copies". A
  caller with read tools + `ppal-duplicate` but no clip writer now keeps those
  mentions while the write half drops. Left alone deliberately: trimming
  mentions in `transforms-core` is exactly what cost a `drum-transforms` eval
  turn before.
- Extending the carve to `barbeat-basic` (`## Generate notes`, 642 of 1,445
  chars) and to stark costs no new decision — add the body, add the slot.
  stark's head is composed from shared string consts, so it means restructuring
  that composition rather than moving sections. midi-json is symmetric enough
  that splitting it would buy nothing. _(Done — see the note above. Measured:
  barbeat-basic carves 37%, stark 22% at both depths. stark's seam is chord
  symbols alone; its bracket voicings stay on the read side because the
  serializer emits them, which meant rewriting the Voicings bullet's chords-line
  clause onto the write half rather than moving it.)_

## Alternatives rejected

- **Keep the coarse `NOTE_TOOLS` gate** (ADR-0016's position) — correct only
  while an override-migration answer was required. It no longer is.
- **`-read` / `-write` symmetry** — renames the driver's notation ref, forcing
  alias entries folding `stark-standard-read` → `stark-standard` and
  `midi-json-standard-read` → `midi-json`, plus a retired slot name, to buy
  nothing a user can see.
- **Sentence-level trimming inside the `v` / `n` / `p` bullets** — would harvest
  a few hundred more chars, but each cut is a judgment call with nothing to
  catch a mis-sort. The seam runs by whole bullet and section; ambiguous lines
  stay on the read side, where both audiences get them.
