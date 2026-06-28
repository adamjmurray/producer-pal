# ADR-0005: Automation goes through the Live API, not offline `.als` rewriting

- **Status:** Accepted
- **Date logged:** 2026-06-28

## Context

Supporting parameter automation (envelopes) is a recurring feature request. One
tempting route is to manipulate the saved Ableton project file (`.als`, a
gzipped XML document) offline — the format is inspectable and the full
automation data lives there, including things the live Live API does not expose.
This was reviewed concretely (2026-05-21) against external PR #829, which built
a parallel offline `.als`-rewriting product that could technically inject valid
`<ClipEnvelope>` XML.

## Decision

Any automation support must be implemented through the Live API at runtime, the
same path as every other Producer Pal operation. Offline `.als` XML rewriting is
out of scope.

## Alternatives rejected

- **Offline `.als` XML rewriting** — rejected despite exposing more data:
  - It operates on the on-disk file, not the live in-memory set, so it can't
    participate in the real-time, "watch it happen in Ableton" interaction model
    that defines the product.
  - It would require closing/reopening or risky reconciliation with Live's
    in-memory state, and couples us to an undocumented, version-volatile file
    format.
  - It bypasses Live's validation, inviting corrupt projects.
  - It hits portability blockers the Live API sidesteps by enumerating at
    runtime: e.g. the macOS device-name locale leaks into `.als` strings, so
    closed-vocabulary routing isn't system-portable. (The same PR's STOP
    verdicts on 6 sibling features — CV routing, external-instrument MIDI
    routing, MIDI map, tuning, insert/delete time, cut/paste time — were all
    rooted in this offline-format brittleness.)

## Consequences

- Automation is gated on what the Live API actually allows; some envelope
  capabilities may be impossible until Ableton extends the API. That ceiling is
  accepted in exchange for safety and the live-interaction model.
- Revisit only if Ableton ships first-class automation write access — not by
  reaching for the file format as a workaround.
