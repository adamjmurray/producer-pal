# ADR-0003: Deliberately duplicate the note-value grammar

- **Status:** Accepted
- **Date logged:** 2026-06-28

## Decision

Keep the note-value lexer (and Stark's `DrumPitchName`) written out at every
parse site instead of sharing it. The sites and the parity tests that hold them
in step are in `dev/coding-standards/README.md`.

## Rejected

- **A shared Peggy fragment.** Peggy has no grammar `import` and can't share
  rules between grammars. Sharing would need a build-time text-concatenation
  step, a new failure mode to consolidate stable lexer rules that rarely change.
  The rules that change in a reform (`beatValue`, `duration`/`nDuration`) differ
  per grammar and can't be shared anyway.
- **Routing the per-note path through the parser.** Too slow: the TS regexes run
  in per-note hot paths (e.g. transform time-range membership), so a full parser
  call would be a performance regression.

## Revisit if

Peggy gains rule sharing, or the hot path stops being hot.
