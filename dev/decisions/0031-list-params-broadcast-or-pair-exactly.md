# ADR-0031: A comma-separated param broadcasts one value or pairs exactly

- **Status:** Accepted
- **Date logged:** 2026-08-30

## Context

Most tools take a list of items — ids, paths, a `count` — and let the other
params be comma-separated to vary per item. How the two lists lined up was
decided per param, and the answers disagreed:

- `name` broadcast a single value and paired a list positionally, warning both
  ways.
- `color` cycled: `"red,blue"` over six clips gave red, blue, red, blue, red,
  blue.
- `toPath` on update-clip paired 1:1 and refused to broadcast.
- `arrangementStart` was one value for the whole call, with no list form.
- create-clip pairs `path` against `arrangementStart` by cycling the shorter of
  the two; duplicate cycles `toPath` and `arrangementStart` against `count`.

A caller can't tell which rule a param uses by looking at it, and the rules
disagree exactly where a wrong guess costs something.

## Decision

One rule, in `src/tools/shared/validation/list-pairing.ts`:

- **1 value** → covers every item, no warning.
- **N values** → pair 1:1 in order.
- **anything else** → warn with both counts, apply positionally, leave the tail
  unset.

Nothing cycles. Cycling and broadcasting only disagree when both lists are
longer than 1 and unequal — two destinations against three positions — which is
the one case nobody writes on purpose.

**Destinations are the exception, in one direction.** A clip slot holds one
clip, so broadcasting a lone slot to three clips would destroy two of them.
`pairExact` is for those; `pairValues` broadcasts, because an arrangement
position holds any number of clips and a name is a property, not a place.

## Alternatives rejected

- **Cycle everywhere.** Consistent, but a cycled destination overwrites, and a
  caller who miscounted gets a plausible-looking result instead of a warning.
- **Pair exactly everywhere.** Would break the common `arrangementStart: "5|1"`
  against several ids — one position for a batch is what a caller means.

## Consequences

- `color` still cycles, and every schema description says so.

  **What the evals found.** `color-list-pairing` and
  `arrangement-destination-pairing` ask for six clips alternating two colors,
  and for clips alternating across two arrangement tracks. Asked to alternate
  colors, Gemini 3 Flash and Sonnet 4.5 both wrote the two-color short form and
  leaned on cycling; Codex/luna spelled all six out. Gemini's own reflection
  named the cause: the schema says "cycles if fewer than positions", so it wrote
  fewer. Rewording that one line to "one per position, in order (does not
  cycle)" flipped both models to spelling every color out, first try.

  So the dependency is our own description, not a model habit — `color` can join
  the rule as long as the wording changes with it. create-clip's cycling of
  `path` against `arrangementStart` never got used: both models wrote
  `path: "t0,t0,t1,t1"` against four positions unprompted.

  duplicate's cycling is untested and has a stronger case for staying, since a
  cycled destination there makes an extra copy rather than an overwrite.

- Pairing warnings name the param and the item (`name: 3 names for 2 clips`)
  instead of the tool. The tool is already obvious from the response the warning
  is attached to.
- The create tools now warn when a list is short, not only when it's long.
