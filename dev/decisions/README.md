# Decisions

Architecture Decision Records (ADRs): the **why** behind choices that are not
obvious from the code or git history — and especially the things we deliberately
chose **not** to do.

## Why this exists

The codebase already documents its _rules_ (`AGENTS.md`,
`dev/Coding-Standards.md`) and its _intended work_ (`dev/plans/`, the
[roadmap](https://producer-pal.org/roadmap)). What neither captures well is the
reasoning behind a settled decision — particularly a rejection ("we considered X
and chose not to, because…"). That reasoning is the most expensive knowledge to
reconstruct and the easiest to lose. An ADR records it once.

If a future contributor (human or AI) would otherwise re-litigate a question we
have already answered, the answer belongs here.

## What is and isn't an ADR

- **ADR** — a decision already made, with lasting consequences, that isn't
  self-evident from the code. Includes "won't fix" / "cancelled" product calls.
- **Not an ADR** — forward-looking proposals still being weighed (→
  `dev/plans/`), coding rules (→ `dev/Coding-Standards.md`), or anything the
  code and tests already make obvious.

## Conventions

- One decision per file, named `NNNN-kebab-title.md` (zero-padded, sequential).
- Never renumber or delete an ADR. To reverse one, add a **new** ADR and set the
  old one's status to `Superseded by ADR-XXXX`.
- Keep them short. Link out to the rule, doc, or plan that implements the
  decision rather than restating it.
- Markdown docs are exempt from SPDX headers (same as the rest of `dev/`).

## Template

```markdown
# ADR-NNNN: Short title

- **Status:** Accepted | Superseded by ADR-XXXX | Reversed
- **Date logged:** YYYY-MM-DD

## Context

What forces are at play? What problem or constraint prompted a decision?

## Decision

What we chose, stated plainly.

## Alternatives rejected

The options we did NOT take, and why. (The most valuable section — omit only
when there genuinely were no alternatives.)

## Consequences

What this enables, costs, or commits us to. Note any revisit triggers.
```

> Several of the seed ADRs below predate this log; their "Date logged" is when
> the record was written, not when the decision was made.

## Index

| ADR                                                | Decision                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| [0001](0001-typescript-everywhere.md)              | TypeScript for all first-party code                                  |
| [0002](0002-exact-dependency-pinning.md)           | Exact dependency versions, no ranges                                 |
| [0003](0003-notation-grammar-duplication.md)       | Deliberately duplicate the note-value grammar                        |
| [0004](0004-tool-input-schema-shapes.md)           | Arrays over `string \| array` unions in tool schemas                 |
| [0005](0005-automation-via-live-api.md)            | Automation goes through the Live API, not offline `.als` rewriting   |
| [0006](0006-no-secure-key-storage.md)              | Provider keys encrypted at rest in the browser; no backend proxy     |
| [0007](0007-no-native-ableton-extension.md)        | Do not build a native Ableton extension                              |
| [0008](0008-device-disable-not-a-kill-switch.md)   | Disabling the M4L device is not a server kill switch (won't fix)     |
| [0009](0009-warn-and-skip-error-handling.md)       | Update tools warn-and-skip instead of throwing                       |
| [0010](0010-user-content-overrides-layer.md)       | `~/.producer-pal` is a content-override layer, not a settings mirror |
| [0011](0011-dotted-triplet-note-value-suffixes.md) | Dotted (`d`) / triplet (`t`) note-value suffixes; letters not `.`    |
| [0012](0012-no-chord-symbols-in-bar-beat.md)       | No chord symbols in bar\|beat; they stay Stark-only                  |
