# ADR-0009: Update tools warn-and-skip instead of throwing

- **Status:** Accepted
- **Date logged:** 2026-06-28

## Context

Update tools (`update-clip`, `update-track`, `update-device`, …) routinely
receive parameter combinations that are invalid for _some_ of the targets — e.g.
a `quantize` on an audio clip, or input routing on a group track. These tools
often operate over multiple items at once. Throwing on the first invalid
combination would abort the whole batch.

## Decision

Update tools do **not** throw for invalid parameter combinations. They
`console.warn()`, skip that operation, and continue. This allows partial success
across a multi-item update.

## Alternatives rejected

- **Throw on invalid combinations** — rejected: it turns a mostly-valid batch
  into a total failure and gives the model nothing to act on except a stack
  trace.
- **Silently skip** — rejected: the model wouldn't learn what was ignored and
  would assume success.

## Consequences

- The warnings are **not** silent feedback: `console.warn()` output is relayed
  to the LLM as `WARNING:` blocks appended to the tool response (via
  `v8-max-console.ts` outlet 1 → `max-api-adapter.ts`). So warn-and-skip is
  real, recoverable feedback. (`console.log`/`console.error` are not relayed.)
- This is a load-bearing contract for the whole update-tool family; see the rule
  in `AGENTS.md` ("Update tool error handling").
- New update tools are expected to follow the same pattern.
