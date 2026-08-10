# ADR-0021: String length caps stay out of the JSON Schema

- **Status:** Accepted
- **Date logged:** 2026-08-09

## Context

llama.cpp compiles every tool's JSON Schema into a single GBNF grammar and
constrains decoding with it. A string's `maxLength: n` becomes the repetition
`char{0,n}`, and the grammar parser rejects any repetition at or above
`MAX_REPETITION_THRESHOLD` (2000), a DoS guard added upstream in November 2025.
Because all tools share one grammar, a single oversized param fails the whole
request — every tool call, not just the one with the big param.

`ppal-context`'s `content` (`maxLength: 10000`) did exactly that in Jan: chat
completions failed with `failed to parse grammar` until the tool was disabled.
The same applies to any llama.cpp-derived runtime (LM Studio, Ollama,
llama-server). Hosted APIs ignore `maxLength`, so this is invisible until
someone runs a local model.

## Decision

A cap at or above 2000 characters is enforced with `boundedString()`
(`src/tools/shared/tool-framework/bounded-string.ts`) — a refinement, which
validates identically and emits no `maxLength` — and stated in the param's
description so the model still knows the limit. Below 2000, plain
`z.string().max()` is fine. `src/test/meta/tool-schema-grammar-safety.test.ts`
holds the line for every tool.

## Alternatives rejected

- **Lower the caps under 2000.** 2000 characters is a short paragraph. It would
  cost real capability — a whole context document, a whole generated function
  body — to work around someone else's bug.
- **Drop the caps.** They are the guard against a runaway write filling a user's
  context file, and the model needs to know a limit exists.
- **Strip `maxLength` only in small-model mode.** The trigger is the client
  runtime, not the model's size. Large models fail the same way on llama.cpp,
  and nothing in an MCP request tells us which runtime is calling.
- **Wait for upstream.** llama.cpp master now clamps an oversized repetition to
  unbounded instead of throwing, but shipped desktop apps lag master by months,
  so the broken builds will be in users' hands for a long time.

## Consequences

- The limit is advertised in prose, not machine-readable. A client can't
  pre-validate against it; our handler still rejects an over-long value.
- `MAX_CODE_LENGTH` went from 2500 to 10,000 at the same time. It was only that
  low out of caution, and once the cap stopped shaping the grammar there was no
  reason to keep code bodies smaller than a context document.
