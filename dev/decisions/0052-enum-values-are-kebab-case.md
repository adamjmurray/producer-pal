# ADR-0052: Enum values are kebab-case; old spellings stay as hidden aliases

- **Status:** Accepted
- **Date logged:** 2026-09-30

## Context

Enum values we defined came in three spellings: `list-tags` and `live-clip`
(kebab), `listTags` and `sampleFolder` (camel), `use_count` and `set_path`
(snake). A model has to guess which one a given tool wants.

## Decision

**Every enum value we define is kebab-case.** Kebab was already the majority,
and models read it as plain words. Values Live owns keep Live's spelling (scale
and view names, quantize grids, device labels, routing names, Simpler's
`one-shot`), since we report and accept them as Live does.

**A renamed value stays accepted as a hidden alias.** The JSON Schema, the
descriptions and the Skills list only the new value, but a call with the old one
works exactly as before, with no refusal and no warning. Memory, custom Skills
and user scripts can hold the old spelling for good, and none of them can be
migrated for the user.

`aliasedEnum()` does this with a value-rewriting check on the enum, so it works
the same at the top level, inside arrays and objects, and over MCP and REST.

## Consequences

- Results echo the new value: an item's `source` is `sample-folder`, and a
  `ppal-live-api` result's `operation.type` is the kebab name.
- `ppal-live-api`'s `getProperty` (a normalized Live read) and `get_property` (a
  JavaScript field on the LiveAPI object) are different operations, so both
  could not become `get-property`. The second is `get-field`.
- A small model's enum trim removes a value's aliases along with it.
