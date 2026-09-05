# ADR-0030: Leaving a conversation stops the turn, with a warning

- **Status:** Accepted
- **Date logged:** 2026-08-29

## Context

Switching conversations or starting a new one while a response is streaming
aborts it. The partial answer is saved to the conversation it belonged to, so
nothing is lost, but the turn is cut off with no warning — poking at the sidebar
to look at another chat silently kills the response you were waiting on.

The appealing alternative is to let the turn keep streaming in the background
after the user navigates away, stopping before any tool call so no unseen writes
reach the Live Set.

## Decision

Leaving stays a stop. The two navigation actions that abandon a live turn — new
conversation, and switching to another one — ask first
(`use-conversation-handlers.ts`). Deletes don't: a delete is deliberate
destruction, already recoverable through the undo banner, and a second dialog on
top of it is noise.

Voice mode is out of scope. Leaving there ends a live microphone session, which
is self-evident rather than surprising.

## Alternatives rejected

**Let the turn finish in the background, stopping at the first tool call.** The
right feature; the wrong cost right now. `useChat` holds exactly one of
everything, all keyed to whatever is on screen: the client (disposed by
`clearConversation`), the abort controller, the turn-ticket dispenser, the
retry/rate-limit state, and `setMessages` as the stream's only sink. The
overlapping-turn machinery in `streaming-helpers.ts` exists to make the losing
turn a no-op, not to let two run, so this inverts it rather than extending it.
Reaching a finished feature needs, at minimum:

- client ownership moved out of `clearConversation` and onto the turn;
- a stream sink that writes to the record rather than to the view;
- a save keyed to the turn's own conversation id, outside the conversation
  store's single-live-slot machinery;
- a re-attach path, or the user returns to a stale record until a save lands.

And it would still die on a chat → voice switch, which unmounts `useChat`
entirely — so "leaving the conversation" wouldn't uniformly mean what it says.

Two notes for whoever picks this up. The existing `shouldInterrupt` hook cannot
serve as the tool boundary: it is checked at `start-step`, after the previous
step's tools have already run, because the AI SDK executes tools inside the
step. The boundary belongs in the single `execute` wrapper in `mcp-tools.ts`,
which can refuse and abort before doing any work. And whether a turn paused at a
tool call could later be resumed is still open — the restore path currently runs
`reconcileDanglingToolCalls(..., "failed")`, so a reopened conversation closes
the call off rather than leaving it resumable.

**Full background streaming, tool calls included.** Unattended writes to the
user's Live Set, with the multi-step loop free to run a long way unwatched.

## Consequences

A modal on a common navigation action is friction, and it does nothing for
someone who wants to read another conversation while this one finishes. That is
the trade being made: the accident is prevented now, cheaply, and the background
turn stays available as a later change rather than a blocked one. Revisit when
the turn lifecycle is being reworked for another reason — the four items above
are the price of admission either way.
