# Decisions

Architecture Decision Records: the **why** behind choices that aren't obvious
from the code or git history — especially the things we deliberately chose not
to do.

The codebase already documents its rules (`AGENTS.md`,
`dev/Coding-Standards.md`) and its intended work (`dev/plans/`, the
[roadmap](https://producer-pal.org/roadmap)). What neither captures is the
reasoning behind a settled decision, particularly a rejection. That's the most
expensive knowledge to reconstruct and the easiest to lose. If a future
contributor would otherwise re-litigate a question we've already answered, the
answer belongs here.

## What is and isn't an ADR

- **ADR** — a decision already made, with lasting consequences, that isn't
  self-evident from the code. Includes "won't fix" calls.
- **Not an ADR** — proposals still being weighed (→ `dev/plans/`), coding rules
  (→ `dev/Coding-Standards.md`), or anything the code and tests already make
  obvious.

## Conventions

- One decision per file, named `NNNN-kebab-title.md`, zero-padded and
  sequential.
- Keep them short and plainly written. Link out to the rule, doc, or plan that
  implements the decision instead of restating it.
- To reverse a decision, add a new ADR and mark the old one
  `Superseded by ADR-XXXX`.
- **Don't renumber or delete an ADR on your own.** Cleanup happens with the user
  in the loop and only with their OK — usually because they asked for it. If you
  notice real bloat, redundancy, or records that contradict each other, say so
  and ask whether to clean up. (ADR-0001 and ADR-0002 were removed this way;
  their numbers stay retired.)
- Markdown docs are exempt from SPDX headers, same as the rest of `dev/`.

## Template

```markdown
# ADR-NNNN: Short title

- **Status:** Accepted | Superseded by ADR-XXXX | Reversed
- **Date logged:** YYYY-MM-DD

## Context

What problem or constraint prompted a decision?

## Decision

What we chose, stated plainly.

## Alternatives rejected

What we didn't do, and why. The most valuable section — omit only when there
genuinely were no alternatives.

## Consequences

What this enables, costs, or commits us to. Note any revisit triggers.
```

> Several of the earliest ADRs predate this log; their "Date logged" is when the
> record was written, not when the decision was made.

## Index

| ADR                                                     | Decision                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| [0003](0003-notation-grammar-duplication.md)            | Deliberately duplicate the note-value grammar                         |
| [0004](0004-tool-input-schema-shapes.md)                | Arrays over `string \| array` unions in tool schemas                  |
| [0005](0005-automation-via-live-api.md)                 | Automation goes through the Live API, not offline `.als` rewriting    |
| [0006](0006-encrypted-keys-no-backend-proxy.md)         | Provider keys encrypted at rest in the browser; no backend proxy      |
| [0007](0007-no-native-ableton-extension.md)             | Do not build a native Ableton extension                               |
| [0008](0008-device-disable-not-a-kill-switch.md)        | Disabling the M4L device is not a server kill switch (won't fix)      |
| [0009](0009-warn-and-skip-error-handling.md)            | Update tools warn-and-skip instead of throwing                        |
| [0010](0010-user-content-overrides-layer.md)            | `~/.producer-pal` is a content-override layer, not a settings mirror  |
| [0011](0011-dotted-triplet-note-value-suffixes.md)      | Dotted (`d`) / triplet (`t`) note-value suffixes; letters not `.`     |
| [0012](0012-no-chord-symbols-in-bar-beat.md)            | No chord symbols in bar\|beat; they stay Stark-only                   |
| [0013](0013-config-override-gate.md)                    | Config-override env vars are opt-in (gated), not opt-out              |
| [0014](0014-subagent-resume-from-transcript.md)         | A subagent resumes from its recorded transcript, not a live session   |
| [0015](0015-project-context-param-rename.md)            | Rename the project-context device parameter in 2.1.0, while it's free |
| [0016](0016-notation-head-gating-granularity.md)        | One fragment per notation is the tool-gating floor (superseded)       |
| [0017](0017-oxlint-category-baseline.md)                | oxlint runs on categories, with an opt-out list                       |
| [0018](0018-tolerated-but-untaught-syntax.md)           | Accept the syntax models already write, without teaching it           |
| [0019](0019-notation-head-read-write-split.md)          | A notation head may split off a `-write` sibling                      |
| [0020](0020-looping-preserves-the-region.md)            | `looping` changes the loop flag and nothing else                      |
| [0021](0021-string-caps-stay-out-of-the-schema.md)      | String caps over 2000 never reach the JSON Schema                     |
| [0022](0022-audio-work-lives-in-companion-skills.md)    | Audio generation and analysis live in companion skills                |
| [0023](0023-live-api-objects-are-pooled-per-request.md) | LiveAPI objects are released and pooled, never held across requests   |
