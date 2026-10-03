# Decisions

Architecture Decision Records: the **why** behind choices a future contributor
would otherwise re-propose or re-investigate.

## What is and isn't an ADR

An ADR records a **rejected alternative**, or a choice that is **expensive to
reconstruct**. Keep it to about a page, plain and brief.

Current rules do not go here. Say what is true now in the doc that owns it: tool
behavior in `dev/specs/tool-behavior/`, grammars in `dev/specs/`, how a system
works in `dev/architecture/` or the topic doc, code rules in `AGENTS.md` and
`dev/coding-standards/`. A rule change updates that spec or doc, not a new ADR.
Proposals still being weighed go in `dev/plans/`.

## Conventions

- One decision per file, named `NNNN-kebab-title.md`. Numbers are never reused;
  gaps are fine.
- When a spec or doc absorbs an ADR, delete the ADR. Don't mark it superseded.
- A code comment must still stand on its own. Don't rely on an ADR to explain
  it.
- Markdown docs are exempt from SPDX headers, same as the rest of `dev/`.

## Template

```markdown
# ADR-NNNN: Short title

- **Status:** Accepted
- **Date logged:** YYYY-MM-DD

## Decision

What we chose, in a sentence or two.

## Rejected

What we didn't do, and why. The most valuable part.

## Revisit if

What would reopen it (optional).
```

## Index

| ADR                                                     | Decision                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| [0003](0003-notation-grammar-duplication.md)            | Deliberately duplicate the note-value grammar                       |
| [0005](0005-automation-via-live-api.md)                 | Automation goes through the Live API, not offline `.als` rewriting  |
| [0006](0006-encrypted-keys-no-backend-proxy.md)         | Provider keys encrypted at rest in the browser; no backend proxy    |
| [0007](0007-no-native-ableton-extension.md)             | Do not build a native Ableton extension                             |
| [0008](0008-device-disable-not-a-kill-switch.md)        | Disabling the M4L device is not a server kill switch (won't fix)    |
| [0012](0012-no-chord-symbols-in-bar-beat.md)            | No chord symbols in bar\|beat; they stay Stark-only                 |
| [0018](0018-tolerated-but-untaught-syntax.md)           | Accept the syntax models already write, without teaching it         |
| [0021](0021-string-caps-stay-out-of-the-schema.md)      | String caps over 2000 never reach the JSON Schema                   |
| [0022](0022-audio-work-lives-in-companion-skills.md)    | Audio generation and analysis live in companion skills              |
| [0023](0023-live-api-objects-are-pooled-per-request.md) | LiveAPI objects are released and pooled, never held across requests |
| [0027](0027-setproperty-stays-out-of-ppal-live-api.md)  | `setProperty` stays out of ppal-live-api                            |
| [0030](0030-leaving-a-conversation-stops-the-turn.md)   | Leaving a conversation stops the turn, with a warning               |
