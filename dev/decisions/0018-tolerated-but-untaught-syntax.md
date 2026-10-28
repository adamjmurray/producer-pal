# ADR-0018: Accept the syntax models already write, without teaching it

- **Status:** Accepted
- **Date logged:** 2026-07-31

## Decision

When a model reliably reaches for a spelling we can accept unambiguously, accept
it in the grammar and leave it out of the Skills. The Skills teach one canonical
way and the parser tolerates the rest. The specs in `dev/specs/` therefore
describe more than the Skills do.

First case: absolute octaves on Stark note tokens (`C3`, `Gb-1`). It is in
`dev/specs/stark-spec.md` and not in `src/skills/notation/stark.ts`.

Rules for tolerated syntax:

- **Unambiguous.** Ambiguity is a hard stop. Absolute octaves are refused on
  chord symbols, where the digits are already qualities (`C7`, `C9`).
- **Invisible to the serializer.** Read-back stays canonical (Stark emits
  `'`/`,`, never `C3`), so round-trips don't fork and the model only ever sees
  the taught form.

## Rejected

- **Document a prohibition ("a note token never takes an octave number").** It
  spends context teaching a dead end, and negative rules are weak guidance.
- **Document the new spelling too.** Two spellings in a document built for
  brevity, when the model already gets one right. Worse in small-model mode.
- **Leave it a parse error.** The model burns a turn, and a retry may not find
  the right spelling.

## Revisit if

Models start preferring a tolerated spelling in round-trip-heavy work, or so
many pile up that the taught/accepted gap becomes its own maintenance cost.
