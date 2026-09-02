# ADR-0009: Update tools warn-and-skip instead of throwing

- **Status:** Accepted
- **Date logged:** 2026-06-28

## Context

Update tools (`update-clip`, `update-track`, `update-device`, …) often work over
several items at once, and routinely get a param that's invalid for only some of
them — `quantize` on an audio clip, input routing on a group track. Throwing on
the first one would abort the whole batch.

## Decision

Update tools don't throw for an invalid param combination. They
`console.warn()`, skip that operation, and continue, so a mostly-valid batch
mostly succeeds.

## Alternatives rejected

- **Throw** — turns a mostly-valid batch into a total failure and hands the
  model a stack trace instead of something to act on.
- **Skip silently** — the model learns nothing about what was ignored and
  assumes success.

## Consequences

- Warnings aren't silent. `console.warn()` output is relayed to the model as
  `WARNING:` blocks appended to the tool response: V8 buffers each warning
  against the request in flight (`v8-warning-capture.ts`) and
  `max-api-adapter.ts` appends them. `console.log` and `console.error` are not
  relayed. A warning raised with no request in flight has no response to land on
  and goes to the Max console instead.
- This is a load-bearing contract for the whole update-tool family; new update
  tools follow it too.
- **A warning names the item it skipped.** One call touches many items, so a
  warning raised while working on item N carries N's identity — otherwise two
  firings of the same reason are indistinguishable and the model can't tell
  which clip kept its notes. Prefer the path (`t1`, `t1/d0`); use the id where
  the path doesn't name the item, as an arrangement clip's path names its lane.
  `targetLabel()` in `object-path-for-api.ts` picks. A whole-call param error is
  different: nothing was skipped in particular, so it stays unqualified.
