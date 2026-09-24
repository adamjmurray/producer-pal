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
- create-clip paired `path` against `arrangementStart` by cycling the shorter of
  the two; duplicate did the same with `toPath` and `arrangementStart`.

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

**Destinations are the exception.** A lane or slot holds one object, so a lone
destination sent to three sources would bury two of them. Destinations pair
exactly: one source takes any number, several sources take one each, in order.
Anything else — one for several, or a few per source — is refused before
anything changes (`requireDestinationPerSource`).

A bare arrangement position (`[5|1]`, or `arrangementStart` with no track) is
not a whole destination: each clip lands at it on its own track. So it
broadcasts to several clips, like a name. So does a track with no position when
the positions pair one per clip. A track with one position (`t2[5|1]`, or `t2`
with one `arrangementStart`) names one place again. Scenes share every track, so
their positions always pair one per scene.

## Alternatives rejected

- **Cycle everywhere.** Consistent, but a cycled destination overwrites, and a
  caller who miscounted gets a plausible-looking result instead of a warning.
- **Pair exactly everywhere.** Would break the common `arrangementStart: "5|1"`
  against several clip ids — one position for a batch, each clip on its own
  track, is what a caller means. Every other destination does pair exactly.
- **Deal a longer list out a few per source** (`id: "c1,c2"` with four slots).
  Nobody could predict which copy went where without counting, so it's refused
  like any other mismatch.

## Consequences

- Pairing warnings name the param and the item (`name: 3 names for 2 clips`)
  instead of the tool. The tool is already obvious from the response the warning
  is attached to.
- The create tools now warn when a list is short, not only when it's long.
- A mismatch on the two params that between them decide how many clips to make —
  create-clip's `path` against `arrangementStart`, duplicate's `toPath` against
  it — makes only the clips both lists name, and warns. Refusing the whole call
  was considered: a create tool building the wrong NUMBER of things is worse
  than building none. It lost because it would be a third rule, which is the
  thing this ADR exists to remove; the warning says exactly which positions got
  nothing.
- duplicate's source list pairs the same way: with several `id`s, `toPath` names
  one destination per source, and only a bare position covers them all. A list
  never lands every source on every spot.

## What the evals found

`color` cycling was published behavior — every schema description said so — so
changing it needed evidence, not reasoning. Three probes now live in
`evals/scenarios/defs/pairing/`, each asking for something "alternating", the
phrasing most likely to invite a short list.

**Baseline, with the cycling wording still in the schemas:**

| Probe                         | Gemini 3 Flash | Sonnet 4.5  | Codex/luna  |
| ----------------------------- | -------------- | ----------- | ----------- |
| `color` over 6 clips          | short form     | short form  | spelled out |
| create-clip `path` × 4 starts | spelled out    | —           | —           |
| duplicate `toPath` × 4 starts | spelled out    | spelled out | —           |

Gemini's own reflection named the cause: the schema said "cycles if fewer than
positions", so it wrote fewer. Rewording that one line to "one per position, in
order (does not cycle)" flipped both models to spelling every color out, first
try.

So the dependency was our own description, not a model habit — and the two
destination sites were never leaned on at all, even though duplicate's schema
advertised the cycling explicitly. All three fold into the rule.

Re-run the probes with
`scripts/eval -t color-list-pairing -t arrangement-destination-pairing -t duplicate-destination-pairing`.
