# ADR-0008: Disabling the M4L device is not a server kill switch (won't fix)

- **Status:** Accepted
- **Date logged:** 2026-06-28

## Context

Users might expect that disabling the Producer Pal device stops everything. It
doesn't — the MCP server and the chat UI's web server keep running. Deleting the
device or closing the Live Set already does stop them, so a disable-kill-switch
would only save re-adding the device later.

## Decision

Won't fix. Leave the behavior as it is.

## Alternatives rejected

**Tie the server lifecycle to the device's enabled state.** It's a net
complexity increase for a problem no user has reported: you'd need the
disable→shutdown wiring plus a new guard stopping the AI from disabling the
device hosting it (mirroring the existing deletion protection). Needing that
guard is the tell that this costs more than it looks. It also overloads
"disable" — normally a reversible, harmless toggle in Live — with a heavyweight
teardown, which is arguably worse UX than today's unmistakable "delete = stop."

## Consequences

- The docs say plainly: to stop the servers, delete the device or close the Live
  Set.
- Revisit if users actually report confusion. Build it then, with the
  self-disable guard.
