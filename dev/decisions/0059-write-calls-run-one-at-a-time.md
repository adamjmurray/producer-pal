# ADR-0059: Write calls run one at a time, queued in Node

- **Status:** Accepted
- **Date logged:** 2026-10-18

## Decision

Node sends tool calls that may change the Set to V8 one at a time; reads run
alongside them. A write that held a track or slot number across a wait could
land on another track once a parallel call shifted it. How the queue works is in
`dev/architecture/write-queue.md`.

## Rejected

- **Re-reading positions after every wait, site by site.** Each site that holds
  a position across a wait needs its own re-read, and every new wait is a new
  site to miss. The queue fixes the whole class in one place.
- **Checking identity in the remote script** (send the clip's identity with each
  envelope request). It closes the gap for envelopes only.
- **Starting a queued write's timeout when its turn comes.** A call could then
  wait several timeouts in the queue and outlast the MCP client's own timeout.

## Revisit if

A write needs to run long while others wait behind it, or a parallel caller
proves to need writes that overlap.
