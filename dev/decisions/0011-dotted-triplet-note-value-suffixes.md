# ADR-0011: Dotted (`d`) and triplet (`t`) note-value suffixes

- **Status:** Accepted
- **Date logged:** 2026-07-03

## Context

Dotted and triplet rhythms are core musical concepts, but bar|beat and the
transform grammar could only express them as explicit whole-note fractions: a
dotted quarter is `n3/8`, a quarter-note triplet is `n/6`, an eighth triplet is
`n/12`. Those spellings are lossless but make the model (and the user)
pre-compute the fraction, which cuts against bar|beat's "represent music the way
musicians think" ethos. Stark had already shipped a dotted `.` suffix,
validating the direction for a suffix shortcut.

A correction to the record motivated reopening this: a `t` suffix was **not**
previously tried-and-rejected. `t` was the original _duration token_, renamed to
`n` for teachability, and tuplets were made denominator-based (`/12`) by the
switch from meter-relative to absolute note values. So the suffix space was
open, not burned.

## Decision

Add a single optional `d` (dotted, ×3/2) or `t` (triplet, ×2/3) **letter**
suffix to the shared `unsignedFraction` note-value atom in both bar|beat and the
transform grammar. It scales whatever fraction precedes it, on any numerator:
`n/4d` = `n3/8`, `n/4t` = `n/6`, `n/8t` = `n/12`, `n3/8d` = 9/16. The two are
mutually exclusive and non-stacking. Because it rides the shared atom, it works
uniformly on durations, `±n` beat offsets, and `@n` step intervals.

Read-back is **full**: the serializers emit the `d`/`t` suffix for the
implicit-numerator power-of-two dotted (`n/1d`…`n/64d`) and triplet
(`n/1t`…`n/64t`) families in place of the equivalent plain fraction (a dotted
quarter reads back `n/4d`, an eighth triplet `n/8t`). Values with no
power-of-two base (`n3/8d` = 9/16, quintuplets) keep their plain fraction.
Beat-offset _positions_ are left un-sugared (`1|1+n/12`), since only
durations/lengths/`@step` carry the suffix on read-back.

## Alternatives rejected

- **The `.` glyph for dotted (as stark uses)** — rejected for bar|beat: `.` is
  already bar|beat's decimal glyph (decimal numerators `n1.5/4`, decimal beats
  `1|2.5`), so a dotted `.` would overload it. Letters sidestep the ambiguity.
  This **deliberately diverges from stark**, which keeps `.` because it has no
  decimals anywhere, so `.` is unambiguous there. Divergence between the two
  notations is acceptable.
- **No sugar — keep only the explicit fractions** — rejected: the fractions
  force the model to do the arithmetic, which it gets wrong more often than a
  named dotted/triplet and which reads nothing like how musicians notate rhythm.
- **Input-only (no read-back sugar)** — rejected in favor of full read-back so a
  clip round-trips through the same intuitive vocabulary it was authored in,
  accepting the one-time snapshot churn that entails.

## Consequences

- The suffix was added to all six intentionally-duplicated note-value parse
  sites together (see [ADR-0003](0003-notation-grammar-duplication.md)); the
  cross-site parity test locks them. The read-back detection lives in one shared
  helper (`formatModifiedNoteValue` in `barbeat-config.ts`) used by both
  serializer surfaces.
- Full read-back changed existing serialized output (a dotted quarter now reads
  back `n/4d`, not `n3/8`; an eighth triplet `n/8t`, not `n/12`), a bounded but
  broad snapshot update.
- The transform grammar's removed-period tombstone (`badPeriod`) was reconciled:
  its period number is matched without the note-value suffix, so a bare-fraction
  period (`1/2t`) still surfaces the "no longer supported" steer while a
  note-value triplet (`n/4t`) parses.
- Follow-ups, tracked separately: add a triplet `t` to stark (which keeps `.`
  for dotted), and support ratio/fraction durations in midi-json (currently
  float-only, so tuplets are lossy decimals there).
