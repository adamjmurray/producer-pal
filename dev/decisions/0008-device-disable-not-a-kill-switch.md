# ADR-0008: Disabling the M4L device is not a server kill switch

- **Status:** Accepted (won't fix)
- **Date logged:** 2026-06-28

## Decision

Disabling the device doesn't stop the MCP server or chat UI server. Deleting the
device or closing the Set does, and the docs say so.

## Rejected

**Tie the servers to the device's enabled state.** It needs shutdown wiring plus
a guard stopping the AI from disabling its own host device. It also turns a
harmless, reversible toggle into a teardown.

## Revisit if

Users report confusion. Build it then, with the self-disable guard.
