# ADR-0035: A malformed call is refused up front, not warned mid-flight

- **Status:** Proposed
- **Date logged:** 2026-08-31
- **Amends:** [ADR-0009](0009-warn-and-skip-error-handling.md),
  [ADR-0029](0029-an-empty-param-is-dropped-from-the-args.md),
  [ADR-0031](0031-list-params-broadcast-or-pair-exactly.md)

## Context

ADR-0009 settled that update tools warn and skip rather than throw. That rule
was written for a param that's invalid for _some_ of the items — `quantize` on
an audio clip. It has since been applied to a different thing: a call whose
input is malformed before any work starts. Four symptoms:

**A hole in a list is unrecoverable, and we recover anyway.** `id: "t1,,t2"`
with `name: "A,B,C"` drops the empty entry, leaves 2 ids, then pairs 3 names
against them. Two warnings fire and the rename still happens — B on t2, C
discarded. But the hole has two readings with different answers: a stray comma
(2 ids, B is right) or a lost entry (3 ids, C was meant for t2). Nothing in the
call says which.

**The all-empty list answers differently per param.** `pathEntries` throws
`invalid path "," - it names nothing`; `namedCommaSeparatedIds` warns and
returns empty; `create-device` throws; `duplicate`'s `planSources` warns. Same
defect, four behaviors.

**A trailing comma means opposite things on the two sides of one call.**
`splitList` keeps empty entries, `parseCommaSeparatedIds` drops them:

| Call                         | Today                                     |
| ---------------------------- | ----------------------------------------- |
| `id: "t1,t2,"`               | 2 ids, silent                             |
| `name: "A,B,"` over 2 tracks | spurious `name: 3 names for 2 tracks`     |
| `name: "A,B,"` over 3 tracks | silent, and **track 3's name is cleared** |

That last row is a live defect. The third entry is `""`, and `update-track.ts`
only skips a nullish name, so a habitual trailing comma wipes a name.

**A blank non-string arg reads as unsent.** `bpm: ""` is dropped by
`unsetEmptyParams` and the call proceeds without it, while `bpm: "null"` fails
coercion and errors. A number has no empty value, so the blank was a mistake
either way.

## Decision

### 1. When we find out decides how we answer

- **Structure, before any work runs → throw.** List shape, an arg that names
  nothing, lists that can't be paired. Nothing has happened yet, so refusing is
  atomic: the model retries with a corrected call and loses nothing.
- **Applicability, found while working → warn and skip.** ADR-0009 is unchanged
  for its own case. Some items already succeeded and can't be rolled back, so
  the batch continues and the warning says what was skipped.

### 2. Lists come in two kinds

- **Target lists** name objects or places: `id`, `path`, `toPath`, `toSlot`,
  `arrangementStart`, `locator`.
- **Value lists** are properties applied to targets: `name`, `color`.

### 3. An empty entry never carries meaning

- In a **target list** it's a hole, and always an error. Dropping it shifts
  every later pairing; keeping it names nothing. Which of the two bites depends
  on params the caller isn't looking at, so the rule doesn't ask — a target list
  with a gap in it is refused either way.
- A target list whose entries are **all** empty (`id: ","`) names nothing at
  all, and is the same error. That replaces the four answers we give today.
- In a **value list** it means "no value for this one" — the item keeps what it
  had. Silent, and nothing shifts.
- **One trailing comma is silent everywhere** and is not an entry, as in most
  languages' list literals. `name: "A,B,"` and `name: "A,B"` become identical,
  so the ambiguity in the table above never has to be resolved.

### 4. Multi-valued lists must agree

Two or more args with commas in them must name the same number of entries;
otherwise the call is refused. ADR-0031's other rules stand: a single value
still broadcasts to every item, nothing cycles, and destinations still never
broadcast, because a slot holds one clip.

### 5. A blank string on a non-string param is an error

`""` on a number, boolean, enum or array param is refused. A JSON `null` is
untouched — ADR-0029's defense against clients that fill empty params exists for
exactly that, and it lives in a separate branch of `isEmptyParamValue`. Blank
still survives on a text param, where clearing a name is a real request.

## Alternatives rejected

- **Preserve alignment through a hole** — keep the empty as a no-op slot, so
  `id: "t1,,t3"` with `name: "A,B,C"` puts A on t1, skips B, and puts C on t3.
  More forgiving, but it guesses "lost entry" the same way dropping guesses
  "stray comma". Refusing is the only answer that doesn't guess.
- **Quote an entry to mean empty** — `name: 'A,B,""'` to clear the third target.
  Turns the list into a format needing a full escape rule (empty, then a literal
  quote, then a literal backslash), for one rare operation that
  `id: "t3", name: ""` already does in a second call. If it comes back, a
  separate `clearName` boolean is cheaper than in-band quoting.
- **Keep warning on a length mismatch** (ADR-0031's answer). It leaves a
  plausible-looking result attached to a warning, and models routinely don't
  retry on those.
- **Document empty-entry-clears-a-name as a feature.** It only exists because
  `splitList` doesn't filter and `""` is a legal name. Nothing published says
  so, so nothing depends on it.
- **Make blank an error on every param.** Clearing a name or a clip's notes with
  `""` is a real request; only params with no empty value are refused.

## Consequences

- **ADR-0009 narrows** to what it was written for. New wording for AGENTS.md:
  update tools don't throw for an operation that doesn't apply — but a call they
  can't read at all is still refused before it starts.
- **ADR-0031's create-tool carve-out is reversed.** It said refusing a
  `path`/`arrangementStart` mismatch lost because "a create tool building the
  wrong NUMBER of things is worse than building none" and "it would be a third
  rule". The second reason no longer holds: refusing becomes the general rule,
  not an exception to it. The first is answered by the retry — nothing was
  built, so nothing has to be cleaned up before trying again.
- **Clearing one name mid-batch needs a second call.** Both unambiguous forms
  still work: `name: ""` alone clears every target in the call, and
  `id: "t3", name: ""` clears one.
- **Rule 4 is not a local patch.** Each param splits itself today, and
  `namedCommaSeparatedIds(targets, "id")` runs before anything knows whether
  `name` is even a list, so checking that two lists agree needs the whole set
  validated together, up front, across roughly eight tools. Rule 3 stays a
  per-param check, which is most of why it's unconditional.
- **Rule 5 must throw actively, not just stop dropping.** `z.coerce.number()`
  turns `""` into `0`, so removing the drop alone would silently give bpm 0 —
  worse than today.
- **Rule 5 rests on a measurement, not on ADR-0029's parenthetical.** That ADR
  says clients fill a param they have no value for with null "or a blank
  string", and `src/test/meta/tool-schemas/empty-params.test.ts` pins `""` as
  reading like an omitted param for every non-text param of every tool — so rule
  5 inverts a pin covering the whole tool surface. Measured against codex-cli
  Luna over 13 eval scenarios and 128 tool calls across 16 tools: nothing
  arrived blank, null, or as the word `"null"`, and an all-optional tool with
  nothing to say came through as `{}`. The blank-fill risk is real only for a
  client that behaves differently, and it stays unmeasured for every client but
  this one — `evals/schema-compat`'s `unset-optionals` variant asks the same of
  the AI-SDK providers and has not been run.
- No published enum has `""` among its options, so rule 5 has no exception to
  carve out.
- The `.def.ts` descriptions and the Skills need the trailing-comma and
  empty-entry rules stated, since both change what a caller can write.
