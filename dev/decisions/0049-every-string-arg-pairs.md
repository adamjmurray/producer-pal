# ADR-0049: Every string arg pairs per target, unless it's already a list

- **Status:** Accepted
- **Date logged:** 2026-09-23

## Context

[ADR-0048](0048-typed-args-stay-typed.md) kept number, boolean and enum args
typed, one value for every target. For strings it paired only those that "say
what or where each target is" and gave clip timing and a scene's `timeSignature`
one value.

That line couldn't be drawn without arguing each param. Color is a label, not a
what or a where. `arrangementLength` is arguably where a clip sits. And a
per-clip length has real uses: one clip holding an A-B phrase, laid out A-A-AB
with the first two copies half as long.

## Decision

**Pair by type.** Every string arg takes one value for every target, or a
comma-separated list with one per target. The exception is a string whose value
is already a list of its own — `notes`, `transforms`, `arrangementSplit`'s split
points — which applies to every target. Numbers, booleans and enums stay typed
(ADR-0048).

That brings back lists for clip `timeSignature`, `start`, `length`, `firstStart`
and `arrangementLength`, and a scene's `timeSignature`, and adds them for track
routing, `sendReturn`, `mappedPitch` and `quantizePitch`. Deprecated params keep
one value.

## Why

- **No judgment call.** Two questions settle any param: is it a string, and is
  its value already a list?
- **It follows ADR-0048's real reason.** Pairing numbers cost the schema's type
  checks. A string has none to lose.

## Alternatives rejected

- **Pair by role** (labels, what's created, where it goes). Smaller, but each
  new param reopens the argument: is routing a "where"?

## Consequences

- A literal comma in a string splits it when the call names more than one
  target, as it already did for `name`. With one target the whole value is
  literal.
- Each pairing param says so in its description, which the model reads on every
  call.
