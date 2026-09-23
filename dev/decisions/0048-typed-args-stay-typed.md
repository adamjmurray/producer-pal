# ADR-0048: Number, boolean and enum args stay typed

- **Status:** Superseded in part by [ADR-0049](0049-every-string-arg-pairs.md) —
  which string args pair
- **Date logged:** 2026-09-22

## Context

Multi-target tools pair string lists 1:1 with their targets (ADR-0031): three
tracks, three names. The same pairing was extended to numbers, booleans and
enums (`gainDb: "-6,-3,0"`, `mute: "true,false"`, `type: "midi,audio,midi"`), so
one call could give each target a different value.

A schema type can't carry that. `type: boolean`, `type: number` and `enum`
reject a comma list before the handler runs, so every such param became a
string, and a shared validator re-checked each entry by hand.

## Decision

**A number, boolean or enum arg keeps its schema type and takes one value for
every target.** A caller that wants different values per target makes separate
calls in the same turn.

String args that say what or where each target is — a name, a color, a
destination, a sample file — still pair per target. Other strings take one value
too: a clip's timing (`timeSignature`, `start`, `length`, `firstStart`,
`arrangementLength`) and a scene's `timeSignature`. A clip's length follows its
notes, so a different length usually means different notes, which is a separate
call anyway.

## Why

- **Separate calls do the same job.** Models already make several tool calls per
  turn, so the per-target list saved little.
- **The schema stops checking.** A string param accepts anything; ranges,
  integers and allowed values move out of the schema and into hand-written
  checks the model never sees up front.
- **It cost more than it saved.** About 1.9 KB more in the tool list the model
  reads, each param repeating the pairing rule in its description, plus a
  validation layer of its own to maintain.

## Evidence weighed

Probes (`evals/schema-compat`, removed with this change) showed models fill the
string shape correctly: gemini-3.6-flash, gpt-5-mini, gpt-5-nano and
claude-haiku-4.5 all sent `"true,false,true"`, `"-6,-3,0"` and
`"midi,audio,midi"` as asked, even with the allowed values only in the
description. An `anyOf[enum, string]` union was worse: Gemini picked the enum
branch and collapsed three types into one.

So the shape worked. It was dropped for its cost, not because models couldn't
use it.

## Alternatives rejected

- **Keep the string lists.** They worked, but gave up type checking and schema
  size for something separate calls already do.
- **`anyOf[type, string]`.** Keeps the type for a single value, but doubles the
  schema per param, and Gemini mishandled it for enums.
