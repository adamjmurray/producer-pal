# ADR-0057: A param only another action reads is refused

- **Status:** Accepted
- **Date logged:** 2026-10-02
- **Related:** [ADR-0035](0035-malformed-calls-are-refused-up-front.md),
  [ADR-0009](0009-warn-and-skip-error-handling.md)

## Context

A tool with actions (or scopes) publishes one schema for all of them, so a call
can send a param its action never reads. Each tool answered that differently:

- `ppal-library {similarTo}` with no action ran a plain search. It returned
  unrelated samples with no `distance`, and said nothing.
- `ppal-playback` warned and went on for `startTime` on `play-scene`, or `path`
  on `stop`.
- `ppal-context {action: "write", name, description}` with no scope replaced the
  project document and dropped both.

The call is ambiguous: either the action or the param is the mistake, and
nothing says which. Warning and continuing guesses, and the reply looks like
success.

## Decision

**A param that only some actions (or scopes) read is refused up front when the
call has another one.** One helper, `refuseParamsOutsideAction`, builds the
message for every tool, so it reads the same everywhere. It names the params as
the caller wrote them, where they apply, and what the call has:

```
similarTo is only for action "find-similar"; this call has action "search".
Change the action or drop similarTo.
```

- **A defaulted action or scope counts like an explicit one.** `similarTo` with
  no action is a `search` call.
- **A null, blank or `"null"` counts as not sent.** A client that fills every
  param it has no value for is not refused (ADR-0029).
- **A value the schema fills in can't be told from one the caller sent.**
  `ppal-library`'s `kind` defaults to `audio`, so only another kind counts as
  sent.
- **A value no action can use is refused too:** `deviceKind: "midifx"` on
  `list-plugins`, since no plugin is a MIDI effect.
- **`ppal-context` refuses `delete` outside memory** with its own message: it is
  memory-only, and the project and global documents are replaced by writing.
- **A param for one operation of a mode param is the same mistake.** The axis is
  whatever call-level param picks the behavior: `type` on `ppal-duplicate` and
  on each `ppal-live-api` operation, `locatorOperation`, `macroVariation`,
  `warpOp`. The message is the same, naming that param.
- **Top-level search filters beside `searches`** are refused: the call can't say
  whether they were meant for every search or for none.
- **`force` on `ppal-context`** is refused outside a project or global write,
  the only calls with a guard to get past. `force: false` asks for nothing, so
  it passes.
- **A param that doesn't suit one target stays a skip.** `quantize` on an audio
  clip, or a warp param on a MIDI clip, depends on the target, so it keeps the
  per-target entry (ADR-0009). Only a param whose home is another value of a
  call-level param is refused.
- **The clobber guard throws.** A write that would drop the whole document used
  to return the document beside a warning, the same shape as a successful write.
  It now throws a message that names `force`.

Tools that apply it: `ppal-library`, `ppal-playback`, `ppal-context`,
`ppal-duplicate`, `ppal-update-live-set`, `ppal-update-device`,
`ppal-update-clip` and `ppal-live-api`.

## Alternatives rejected

- **Warn and continue.** It guesses that the param was the mistake and runs the
  action anyway. For `similarTo` that is a confident wrong answer; for a
  playback timeline param it writes the arrangement.
- **Read the param as implying the action** (`similarTo` means `find-similar`).
  It guesses the other way, and needs a priority rule once two params imply two
  actions.

## Consequences

- Nothing changed in Live (or in the stored context) on a refused call.
- ADR-0035's "applicability, found while working" rule is untouched: this is
  applicability the call itself settles before any work.
- A caller that sent a harmless extra now gets an error and retries. That costs
  one round trip, and the message says how to fix it.
- Each tool lists its own params next to its code. Adding a param to a tool with
  actions means deciding which actions read it.
