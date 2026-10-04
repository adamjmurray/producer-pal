# ADR-0021: String length caps stay out of the JSON Schema

- **Status:** Accepted
- **Date logged:** 2026-08-09

## Decision

llama.cpp compiles all tools' JSON Schemas into one grammar. A string
`maxLength: n` becomes a repetition `char{0,n}`, and the grammar parser rejects
any repetition of 2000 or more. Because the grammar is shared, one oversized
param fails every tool call, not just its own. Hosted APIs ignore `maxLength`,
so this only shows up on local runtimes (LM Studio, Ollama, llama-server).

A cap of 2000 or more uses `boundedString()`
(`src/tools/shared/tool-framework/bounded-string.ts`): it validates the same but
emits no `maxLength`. State the limit in the param description so the model
still knows it. Below 2000, plain `z.string().max()` is fine.
`src/test/meta/tool-schemas/grammar-safety.test.ts` enforces this for every
tool. The limit is prose only, so clients can't pre-validate, but our handler
still rejects an over-long value.

## Rejected

- **Lower the caps under 2000.** Loses real capability (a whole context
  document, a generated function body) to work around someone else's bug.
- **Drop the caps.** They stop a runaway write from filling a context file, and
  the model needs to know a limit exists.
- **Strip `maxLength` only in small-model mode.** The trigger is the client
  runtime, not the model size, and an MCP request doesn't say which runtime is
  calling.
- **Wait for upstream.** llama.cpp master now clamps instead of throwing, but
  shipped desktop apps lag by months.

## Revisit if

Shipped llama.cpp-based apps no longer reject large repetitions.
