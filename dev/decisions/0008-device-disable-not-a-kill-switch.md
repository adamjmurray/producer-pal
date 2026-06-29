# ADR-0008: Disabling the M4L device is not a server kill switch (won't fix)

- **Status:** Accepted
- **Date logged:** 2026-06-28

## Context

A user might reasonably expect that disabling the Producer Pal Max for Live
device stops everything. It doesn't: the MCP server and the chat UI's web server
keep running after the device is _disabled_. Note that **deleting** the device
or **closing the Live Set already does** stop everything — so the only thing a
disable-kill-switch would add is the convenience of not re-adding the device
later.

## Decision

Won't fix. Leave the behavior as-is rather than wiring device-disable to a
server shutdown.

## Alternatives rejected

- **Tie server lifecycle to the device's enabled state** — rejected. It's a net
  complexity _increase_ for a problem no user has reported: you'd add the
  disable→shutdown wiring **plus** a new self-protection guard (the AI must not
  disable the device hosting it, mirroring the existing deletion protection).
  The need for that guard is the tell that the cost is higher than it looks. It
  also overloads "disable" — normally a non-destructive, reversible toggle in
  Live — with a heavyweight teardown side effect, arguably worse UX than the
  current unmistakably-destructive "delete = stop."

## Consequences

- Documented expectation: to stop the servers, **delete the device or close the
  Live Set** — disabling alone won't do it. (Cheap interim: just say so in the
  docs.)
- Revisit trigger: users actually report confusion in practice. Build it then —
  with the self-disable guard. Until then, intentionally not built.
