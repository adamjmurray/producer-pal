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
- **A warning names the item it skipped by both its path and its id** —
  `t1/d0 (id 7)`. One call touches many items, so a warning raised while working
  on item N carries N's identity. Both spellings, not one: the model addressed
  the item by whichever it had, and can't map the other back, so a warning
  naming only the one it didn't send is unactionable. `targetLabel()` in
  `object-path-for-api.ts` is the one place that spells it, with
  `targetLabelForId()` where only an id is at hand and `pathTargetLabel()` where
  the caller wrote a path. The id is dropped only when there is no object to
  have one: a create that failed, or a path that resolved to nothing — then the
  path alone, in quotes, since it's the caller's own text. The path is dropped
  only when the grammar can't spell one (a Live locator). Create-clip has
  neither yet, so it names the destination it's headed for plus its ordinal in
  the batch (`clip t0/s1 (2 of 5)`), which is also the `clip.index` a transform
  saw. A whole-call param error is different: nothing was skipped in particular,
  so it stays unqualified.
