# ADR-0005: Automation goes through the Live API, not offline `.als` rewriting

- **Status:** Accepted
- **Date logged:** 2026-06-28

## Context

Parameter automation is a recurring feature request. A tempting shortcut is to
edit the saved project file (`.als`, gzipped XML) directly — the format is
inspectable and holds automation data the Live API doesn't expose. Reviewed
concretely on 2026-05-21 against external PR #829, which built a working offline
`.als` rewriter that could inject valid `<ClipEnvelope>` XML.

## Decision

Automation must go through the Live API at runtime, like every other Producer
Pal operation. Offline `.als` rewriting is out of scope.

## Alternatives rejected

**Offline `.als` XML rewriting**, despite exposing more data:

- It edits the file on disk, not the set in memory, so it can't support the
  watch-it-happen-in-Ableton interaction that defines the product.
- It would need a close/reopen or a risky reconciliation with Live's in-memory
  state, and ties us to an undocumented, version-volatile format.
- It bypasses Live's validation, so it can produce corrupt projects.
- The file isn't portable: the macOS device-name locale leaks into `.als`
  strings, so closed-vocabulary routing can't work across systems. The same PR's
  stop verdicts on six sibling features all traced back to this brittleness.

## Consequences

- Automation is limited to what the Live API allows; some envelope work may be
  impossible until Ableton extends it. That ceiling is accepted.
- Revisit only if Ableton ships automation write access — not by reaching for
  the file format as a workaround.
