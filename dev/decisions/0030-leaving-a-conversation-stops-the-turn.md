# ADR-0030: Leaving a conversation stops the turn, with a warning

- **Status:** Accepted
- **Date logged:** 2026-08-29

## Decision

Switching conversations or starting a new one aborts a streaming response. The
partial answer is saved to its own conversation. The two actions that abandon a
live turn ask first (`use-conversation-handlers.ts`). Deleting doesn't, because
it is deliberate and has an undo banner. Voice mode is out of scope: leaving
ends a microphone session, which is self-evident.

## Rejected

**Let the turn finish in the background, stopping before any tool call.** The
right feature, but too expensive now. `useChat` holds one of everything, keyed
to the visible conversation: client, abort controller, turn ticket,
retry/rate-limit state, and `setMessages` as the only stream sink. It would need
client ownership moved onto the turn, a sink that writes to the record, a save
keyed to the turn's own conversation, and a way to re-attach. It would still die
on a chat to voice switch.

If someone picks this up:

- `shouldInterrupt` can't be the tool boundary. It runs at `start-step`, after
  the previous step's tools already ran. Put the boundary in the `execute`
  wrapper in `mcp-tools.ts`.
- Whether a turn paused at a tool call can resume is open. Restore currently
  closes dangling calls as failed.

**Background streaming with tool calls.** Unattended writes to the user's Live
Set.

## Revisit if

The turn lifecycle is being reworked for another reason.
