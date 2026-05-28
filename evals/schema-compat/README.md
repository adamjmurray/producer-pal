# Schema compatibility probe

A one-off probe answering: **do LLM providers accept _and correctly fill_ richer
tool-input JSON Schema shapes** (arrays, nested objects, `anyOf` unions, dynamic
object maps) than Producer Pal's older "comma-separated strings only" convention
assumed?

It bypasses MCP and Ableton entirely, feeding hand-written JSON Schema straight
to the AI SDK via `jsonSchema()` (the same wire format `evals/chat/mcp.ts`
sends), using tools with no `execute` so each model emits exactly one tool call
and stops. For each (model × variant) it records whether the provider:

- **accepted** the schema (no API/schema error), and
- **filled** it in a structurally correct shape, scored by a per-variant
  `check()` in [`schema-compat-variants.ts`](./schema-compat-variants.ts).

## Running it

```bash
npx tsx --env-file=.env evals/schema-compat/probe-schema-compat.ts [models...] [flags]
```

- **models** — `provider/model` or prefix-inferred (e.g. `gemini-3.5-flash`,
  `mistral/mistral-small-latest`, `openrouter/anthropic/claude-haiku-4.5`).
  Defaults to one model per supported provider (Gemini, OpenAI, Mistral,
  OpenRouter). Models whose API key is missing show as `no-key`.
- `--repeat=N` — independent draws per cell (default **3**). A single draw can't
  be told from sampling noise; repeats expose flakiness. A cell is reported by
  its **worst** draw, and the details dump lists the full distribution.
- `--temp=N` — sampling temperature. Left at the **provider default** unless
  set: forcing `0` is rejected by some reasoning models (e.g. `gpt-5-nano`),
  which would show as false `rejected` cells. Repeats — not temp 0 — are how
  this probe controls for noise.
- `--auto` — let the model decide whether to call the tool (default is
  `required`, which guarantees a call but is rejected by a few endpoints).

## Results snapshot

**Date:** 2026-05-24 · **`--repeat=3`, provider-default temperature, tool choice
`required`.** Models: `gemini-3.5-flash`, `gpt-5-nano`, `mistral-small-latest`,
`anthropic/claude-haiku-4.5` (via OpenRouter). (Re-run to refresh; results drift
as model versions change — this is corroboration, not a standing guarantee.)

| model                 | array\<string> | csv-string | **anyOf string\|array** | array\<object> | object-map | object-map (bare) | anyOf value-union |
| --------------------- | -------------- | ---------- | ----------------------- | -------------- | ---------- | ----------------- | ----------------- |
| gemini-3.5-flash      | ok             | ok         | ok                      | ok             | **wrong**  | **wrong**         | ok                |
| gpt-5-nano            | ok             | ok         | ok                      | ok             | ok         | ok                | ok                |
| mistral-small-latest  | ok             | ok         | ok                      | ok             | ok         | ok                | ok                |
| claude-haiku-4.5 (OR) | **wrong** ⚠️   | ok         | **wrong**               | ok             | ok         | ok                | ok                |

(`ok`/`wrong` = best/worst structural fill over 3 draws; full per-draw
distribution is in the probe's `=== details ===` output.)

### What it shows

- **`anyOf` (string \| array) is the one fragile construct — now _measured_, not
  eyeballed.** `claude-haiku-4.5` collapsed the union to a scalar **3/3**, input
  `{"action":"reverse"}` — silently dropping the second requested action. The
  other three models used the array branch correctly. This is the documented
  collapse-to-scalar data-loss failure. Note the check was deliberately
  tightened to require the **array branch with both items present**; the earlier
  check (`isStr(x) || isStrArray(x)`) scored any string as `ok` and so could not
  see this failure at all.
- **Dynamic object maps lose data on Gemini.** Both `object-map`
  (`additionalProperties:string`) and the bare-object fallback came back as `{}`
  from `gemini-3.5-flash` **3/3** — every key dropped, no error. This is why
  `update-device`'s `params` is an `array<object{name,value}>`, not an object
  map.
- **Arrays of strings / arrays of objects / numeric-array value-unions are
  robust** across all four models (the `live-api-value-union` `anyOf` fills the
  array fine when the prompt clearly wants a list).
- **Caveat — `array<string>` flakiness on `claude-haiku-4.5` (2/3 wrong) is a
  prompt artifact, not a schema verdict.** The baseline prompt lists actions
  with `|` separators (`reverse | warpAs(4) | ...`); haiku sometimes kept the
  whole pipe-delimited string as a single array element. The takeaway is about
  prompt phrasing, not array support.

### Bottom line

The conventions this probe was built to check out as **conservative-correct**:
prefer `array<object>` for structured records, prefer a plain `array` over a
`string | array` union (the union is the only shape that actively loses data —
on Claude), and avoid dynamic object maps (they lose data on Gemini). See
`AGENTS.md` → "Tool input schema shapes" for how these map onto tool design.
