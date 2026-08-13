# ADR-0011: Dotted (`d`) and triplet (`t`) note-value suffixes

- **Status:** Accepted
- **Date logged:** 2026-07-03

## Context

Dotted and triplet rhythms are basic musical ideas, but bar|beat and the
transform grammar could only spell them as whole-note fractions: a dotted
quarter was `n3/8`, a quarter triplet `n/6`, an eighth triplet `n/12`. That's
lossless but makes the model and the user pre-compute the fraction, which cuts
against bar|beat's goal of representing music the way musicians think. Stark had
already shipped a dotted `.` suffix, so the direction was proven.

Worth recording, since it looked otherwise: a `t` suffix had **not** been tried
and rejected before. `t` was the original duration token, renamed to `n` for
teachability. The suffix space was open.

## Decision

Add one optional letter suffix — `d` (dotted, ×3/2) or `t` (triplet, ×2/3) — to
the shared `unsignedFraction` atom in both grammars. It scales whatever fraction
precedes it, on any numerator: `n/4d` = `n3/8`, `n/4t` = `n/6`, `n3/8d` = 9/16.
The two are mutually exclusive and don't stack. Because it rides the shared atom
it works on durations, `±n` beat offsets, and `@n` step intervals alike.

Read-back is full: the serializers emit `d`/`t` for the implicit-numerator
power-of-two families (`n/1d`…`n/64d`, `n/1t`…`n/64t`) in place of the
equivalent plain fraction. Values with no power-of-two base (`n3/8d`,
quintuplets) keep the plain fraction, and beat-offset positions stay un-sugared
(`1|1+n/12`).

## Alternatives rejected

- **The `.` glyph, as stark uses** — `.` is already bar|beat's decimal glyph
  (`n1.5/4`, `1|2.5`), so a dotted `.` would be ambiguous. Letters sidestep
  that. This deliberately diverges from stark, which has no decimals anywhere
  and can keep `.` unambiguous.
- **No sugar at all** — the fractions force arithmetic the model gets wrong more
  often than a named dotted or triplet value.
- **Input-only, no read-back sugar** — rejected so a clip round-trips through
  the same vocabulary it was written in, accepting a one-time snapshot churn.

## Consequences

- The suffix went into all six duplicated parse sites at once (ADR-0003), locked
  by the parity test. Read-back detection lives in one helper,
  `formatModifiedNoteValue` in `barbeat-config.ts`.
- Existing serialized output changed: a dotted quarter now reads back `n/4d`,
  not `n3/8`.
- The transform grammar's removed-period tombstone (`badPeriod`) matches its
  period number without the suffix, so a bare-fraction period (`1/2t`) still
  gets the "no longer supported" message while `n/4t` parses.
