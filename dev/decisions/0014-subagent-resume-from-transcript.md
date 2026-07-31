# ADR-0014: A subagent resumes from its recorded transcript, not a live session

- **Status:** Accepted
- **Date logged:** 2026-07-24

## Context

A subagent worker runs to completion inside one `spawn_subagent` `execute()`
call, and its `ChatSdkClient` is disposed on the way out. Giving a worker more
work later — to extend it, correct it, or finish a run the user stopped — seems
to require keeping it alive: persisting its history plus the config it ran
under, then re-attaching a live client.

Two facts make it much smaller than that:

- `ChatSdkClient` already takes its history from `config.chatHistory` and
  rebuilds its MCP connection and toolset in `initialize()`. A continued worker
  is just a new client over the old history.
- The worker's full transcript is already persisted with the conversation, on
  the spawn tool-result, for the card's deep-dive view.

The config half can't be persisted anyway: `config.model` is a live
`LanguageModel` instance and `buildProviderOptions` is a closure, both rebuilt
per turn.

## Decision

The persisted transcript **is** the resumable state. Resuming seeds a fresh
worker client with the recorded session and sends one more user turn. Nothing
stays alive between runs and no config is snapshotted.

A resumed worker therefore runs under the _current_ model, preset, and tools —
the same choice already made for restored conversations.

Worker identity is a 1-based index, persisted beside the transcript and shown to
the model as a `[subagent N]` label. The orchestrator addresses a worker by that
number (`resumeFrom`). See `webui/src/chat/sdk/subagent/subagent-session.ts`.

## Alternatives rejected

- **Persist session state and re-attach a live client** — the live client holds
  nothing worth preserving: an MCP connection that gets rebuilt anyway and a
  tool map derived from config. A disposable client per run also keeps the abort
  story simple.
- **Snapshot each worker's config so a resume runs under its original settings**
  — not serializable, contradicts restored-conversation behavior, and would
  surprise a user who deliberately switched to a cheaper preset before asking
  for follow-up work.
- **A Resume button on the subagent card** — a worker's result has to land as a
  tool-result inside an assistant message the provider already saw, so a
  user-initiated resume would mean rewriting history mid-flight. Letting the
  orchestrator resume in its own turn needs no new plumbing.
- **Store each resumed run's full history on its own tool-result** — duplicates
  the whole transcript, skills result included, on every resume. Each run stores
  only what it added, and `collectSubagentTranscript` stitches them back
  together.

## Consequences

- Resuming skips a fresh worker's connect/skills context and its re-read of the
  Live Set, which is the main reason the feature exists.
- **The seeded session must be a deep copy.** It becomes the worker's live
  history, and the rate-limit restart path truncates that in place — pointing it
  at the persisted transcript would erase the record of a run that happened.
- Compaction can scroll a `[subagent N]` label out of the model's view. Resuming
  still works (lookup reads history), but the model has to remember the number.
- Two concurrent resumes of one worker are refused rather than merged; both
  would seed from the same session and record divergent continuations under one
  index.
- Revisit if a worker ever needs non-serializable state, like an open file
  handle or a streaming connection.
