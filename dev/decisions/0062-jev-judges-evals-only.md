# ADR-0062: Jev judges evals only, asked with scores

- **Status:** Accepted
- **Date logged:** 2026-10-31

## Decision

Jev (TypeSafe AI) is used only as an eval judge (`--jev`), deciding from
per-requirement probabilities, with a graded outcome asked as a `score`. It is
not part of the chat product.

## Rejected

- **An in-loop "did this do what the user asked?" check in the built-in chat.**
  A wrong "no" makes the model churn the user's Set, Claude already sees the
  tool results, Jev can't explain a failure, and the default setup would need
  another API key.
- **Filtering the user's changes between turns (Live API listeners).**
  Condensing the change log in code gets most of the token savings, and missing
  a relevant change costs more than a few extra tokens.
- **Ordered levels as a `choice`.** The 4-level outcome (complete failure to
  complete success) separated passes from fails with AUC 0.91 as a `score` but
  0.74 as a `choice`. A 0–4 score did about as well as yes/no (AUC ~0.89).
- **Failure categories, stage and blame.** With a "none" option Jev matched Luna
  on 8 of 23 Luna-flagged problems (12 without it), mostly at 0.3–0.7
  confidence. One yes/no per category goes high on all of them whenever anything
  is wrong. Stage and blame caught about half of Luna's problems and never
  blamed the scenario, so they can't catch over-strict criteria. Categories are
  only as good as Jev's problem detection, which misses about half the subtle
  failures.
- **A reply-honesty question.** It called almost every reply accurate: no
  signal. Response kind (acted, asked, refused, only talked) was Jev's most
  confident answer, but code can derive it from the tool calls.
