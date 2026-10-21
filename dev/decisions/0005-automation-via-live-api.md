# ADR-0005: Automation goes through the Live API, not offline `.als` rewriting

- **Status:** Accepted
- **Date logged:** 2026-06-28

## Decision

Automation goes through Live's own API at runtime, like everything else. Editing
the saved project file (`.als`, gzipped XML) is out of scope, even though it
holds automation data the Live API doesn't expose. Clip envelopes use the Python
API through the remote script, which Max's LOM can't reach. Arrangement lanes
can't be read or cleared, only written by copying a session clip. That is
accepted.

## Rejected

**Offline `.als` rewriting.** A working prototype existed (external PR #829).

- It edits the file on disk, not the Set in memory, so you can't watch it happen
  in Ableton. Showing it would need a close/reopen or a risky merge with Live's
  in-memory state.
- The format is undocumented and changes between versions.
- It bypasses Live's validation, so it can produce corrupt projects.
- It isn't portable: the macOS device-name locale leaks into `.als` strings, so
  closed-vocabulary routing can't work across systems.

## Revisit if

Ableton exposes arrangement lanes (read or clear). Don't reach for the file
format as a workaround.
