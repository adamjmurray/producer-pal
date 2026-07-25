# ADR-0014: A subagent is resumed from its recorded transcript, not a live session

- **Status:** Accepted
- **Date logged:** 2026-07-24

## Context

A subagent worker runs to completion inside one `spawn_subagent` `execute()`
closure: the tool builds a worker config, `runSubagent` gives it its own
`ChatSdkClient`, and that client is disposed on the way out. Giving a worker
more work later — to extend it, correct it, or finish a run the user stopped —
needs some notion of the worker's session outliving that closure.

The obvious reading is that this requires keeping the worker alive: persist its
session state (its `chatHistory` plus the `ChatClientConfig` it ran under) and
re-attach a live `ChatSdkClient` to continue the nested loop later. That framing
makes resuming look like a materially larger mechanism than run-once.

Two facts about the existing code make it much smaller than that:

- `ChatSdkClient` already takes its history from config (`config.chatHistory`)
  and rebuilds its MCP connection and toolset in `initialize()`. A "continued"
  worker is just a new client constructed over the old history.
- The worker's full transcript is **already** persisted with the conversation,
  on the spawn tool-result, for the card's deep-dive tier.

The config half can't be persisted even if we wanted to: `config.model` is a
live `LanguageModel` instance and `buildProviderOptions` is a closure, both
rebuilt per turn by `chatAdapter.buildConfig`.

## Decision

The persisted transcript **is** the resumable state. Resuming seeds a fresh
worker client with the recorded session and sends one more user turn. Nothing is
kept alive between runs and no config is snapshotted.

A resumed worker therefore runs under the **current** model, preset, and tools —
the same choice already made for restored conversations, where continuing one
spawns workers under whatever "Default subagent" preset is selected now
(`SubagentConfigOverride`).

Worker identity is a 1-based index, persisted beside the transcript and surfaced
to the model as a `[subagent N]` label on each result. The orchestrator
addresses a worker by that number (`resumeFrom`). Implemented in
`webui/src/chat/sdk/subagent-session.ts` and `spawn-subagent-tool.ts`.

## Alternatives rejected

- **Persist the session state and re-attach a live client** (the original
  framing). Rejected: the live client holds nothing worth preserving — an MCP
  connection that must be rebuilt anyway, and a tool map derived from config.
  The transcript is the whole of the state, and a disposable client per run
  keeps the abort story simple (Stop disposes the worker; nothing leaks).
- **Snapshot the `ChatClientConfig` per worker so a resume runs under the
  settings its first run used.** Rejected: not serializable, and it would
  contradict the settled behavior for restored conversations. Pinning would also
  surprise a user who deliberately switched to a cheaper preset before asking
  for follow-up work.
- **A Resume button on the subagent card.** Rejected: a worker's result has to
  land as a tool-result inside an assistant message the provider has already
  seen, so a user-initiated resume would mean rewriting conversation history
  mid-flight, against `buildModelMessages`' call/result pairing invariant.
  Letting the orchestrator resume in its own turn needs no new plumbing, and
  asking the AI in words ("thin out subagent 2's bassline") reaches the same
  place.
- **Store each resumed run's full history on its own tool-result.** Rejected:
  duplicates the worker's whole transcript — its `ppal-connect` skills result
  included — on every resume. Each run stores only what it added and
  `collectSubagentTranscript` stitches the runs back into one session.

## Consequences

- Resuming is the cheap path: it skips a fresh worker's connect/skills context
  and its re-read of the Live Set, which is the main reason the feature exists.
- The seeded session must be a deep copy. It becomes the worker's live history,
  and the rate-limit restart path truncates that in place — pointing it at a
  persisted transcript would erase the record of a run that already happened.
- Compaction drops older turns from the model's view, so a `[subagent N]` label
  can scroll out of reach. Resuming still works (lookup reads history), but the
  model has to still know the number to ask for it.
- Two concurrent resumes of one worker are refused rather than merged; both
  would seed from the same session and record divergent continuations under one
  index.
- Revisit if workers ever need to hold non-serializable state (an open file
  handle, a streaming connection). Nothing in the current design does.
