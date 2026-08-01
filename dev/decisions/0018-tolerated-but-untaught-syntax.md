# ADR-0018: Accept the syntax models already write, without teaching it

- **Status:** Accepted
- **Date logged:** 2026-07-31

## Context

A model wrote `melody: C3/4 z/8 E3/8 G3/2` and the parse failed: a Stark note
token took octave marks (`C'`) but no octave number. Nothing in the Skills
suggested `C3` — the model reached for absolute pitch names because they're the
common convention, and because they're already real syntax nearby (drum
pitch-name headers, `preTransforms` pitch ranges).

The obvious fix is a line in the Skills saying "not that." But the Skills are
the tightest documents we write — they spend the user's context on every call —
and a prohibition costs tokens to buy nothing the model can play.

## Decision

When a model reliably reaches for a spelling we can accept unambiguously,
**accept it in the grammar and leave it out of the Skills.** The Skills keep
teaching one canonical way; the parser tolerates the rest.

The first instance: absolute octaves on Stark note tokens (`C3`, `Gb-1`), which
the digit slot after letter+accidental left free. Documented in
`dev/specs/Stark-Spec.md`, absent from `src/skills/notation/stark.ts`.

## Alternatives rejected

- **Document the prohibition** ("a note token never takes an octave number") —
  spends context teaching a dead end, and negative rules are weak guidance: the
  model still has to notice the rule applies before it writes the token.
- **Document the new syntax** — two spellings for one thing in a document whose
  whole design constraint is brevity, when the model already gets one of them
  right unprompted. Worse in small-model mode, where the head is deliberately
  narrower.
- **Leave it a parse error** — the model burns a turn on the failure, and a
  retry may not find the right spelling.

## Consequences

- Accepted-but-untaught syntax must be **unambiguous and serializer-invisible**.
  Read-back stays canonical (the Stark serializer emits `'`/`,`, never `C3`), so
  round-trips don't fork and the taught form remains the only one a model sees
  come back.
- Ambiguity is a hard stop, not a tradeoff. Absolute octaves are accepted on
  melody/bass tokens and inside `[..]` voicings, and refused on chord symbols,
  where the digits are already qualities (`C7`, `C9`).
- The specs in `dev/specs/` are now strictly larger than the Skills. Reading a
  Skill no longer tells you what the grammar accepts.
- **Revisit trigger:** a tolerated spelling that models start preferring in
  round-trip-heavy work, or enough of them accumulating that the gap between
  taught and accepted becomes its own maintenance burden.
