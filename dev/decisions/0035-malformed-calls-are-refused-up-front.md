# ADR-0035: A malformed call is refused up front, not warned mid-flight

- **Status:** Accepted
- **Date logged:** 2026-08-31
- **Amended:** 2026-09-02 (rule 1, third bullet: work that can't be repeated)
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

| Call                         | Before                                    |
| ---------------------------- | ----------------------------------------- |
| `id: "t1,t2,"`               | 2 ids, silent                             |
| `name: "A,B,"` over 2 tracks | spurious `name: 3 names for 2 tracks`     |
| `name: "A,B,"` over 3 tracks | silent, and **track 3's name is cleared** |

That last row was a live defect that reached users — the unfiltered splitter
goes back to v2.0.0 at least. The third entry is `""`, and `update-track.ts`
only skipped a nullish name, so a habitual trailing comma wiped a name.

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
- **Applicability that can be settled before work starts, in a tool whose work
  can't be repeated → throw.** A create has no partial state worth preserving:
  every copy it already made is a side effect the model has to clean up by hand
  before it can retry. So when the whole target list can be checked first, it
  is, and the call is refused atomically like a structural error.

  `duplicate` is the case. Its sources are ids and paths, both checkable without
  changing anything, so
  [duplicate.ts:147](../../src/tools/actions/duplicate/duplicate.ts#L147)
  validates every source before the first copy is made. The second bullet's
  reasoning — continue, because earlier items can't be rolled back — inverts
  here: not being able to roll back is exactly why nothing should start.

  This does not reopen the second bullet. It applies only where both halves
  hold: the failure is knowable up front, and the work leaves objects behind. An
  update tool satisfies neither — `quantize` on an audio clip isn't knowable
  until that clip is reached, and a batch that half-succeeded has changed
  properties, not created things.

### 2. Lists come in two kinds

- **Target lists** name objects or places: `id`, `path`, `toPath`, `toSlot`,
  `arrangementStart`, `locator`.
- **Value lists** are properties applied to targets: `name`, `color`.

The distinction settles broadcasting, and nothing else: a lone value covers
every item, while a lone destination does not, because a slot holds one clip and
the rest would overwrite each other. Holes and lengths follow the same rule on
both sides.

### 3. An empty entry never carries meaning

- **A hole is an error in every list**, target or value. Dropping it shifts
  every later pairing; keeping it names nothing. Which of the two bites depends
  on params the caller isn't looking at, so the rule doesn't ask.
- A target list whose entries are **all** empty (`id: ","`) names nothing at
  all, and is the same error. That replaces the four answers listed above.
- **One trailing comma is silent everywhere** and is not an entry, as in most
  languages' list literals. `name: "A,B,"` and `name: "A,B"` become identical,
  so the ambiguity in the table above never has to be resolved.

### 4. Multi-valued lists must agree

Two or more args with commas in them must name the same number of entries;
otherwise the call is refused. An item count the call worked out for itself
counts as one of them — `count: 3` on create-track, the copies duplicate is
about to make — so a value list has something to disagree with even on a tool
with no target list. ADR-0031's other rules stand: a single value still
broadcasts to every item, nothing cycles, and destinations still never
broadcast, because a slot holds one clip.

### 5. A blank string on a non-string param is an error

`""` on a number, boolean, enum or array param is refused. A JSON `null` is
untouched — ADR-0029's defense against clients that fill empty params exists for
exactly that, and it stays a separate branch in `unsetEmptyParams`. Blank still
survives on a text param, where clearing a name is a real request.

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
- **Rule 4 is not a local patch.** Each param splits itself, and
  `targetEntries(targets, "id")` runs before anything knows whether `name` is
  even a list, so checking that two lists agree needs the whole set validated
  together, up front. Rule 3 stays a per-param check, which is most of why it's
  unconditional.
- **A scalar item count is inside rule 4.** `count: 3` with `name: "A,B"` has
  only one comma-bearing arg, so the count has to be passed in as a list of its
  own for the two to be compared. Without that, create-track, create-scene,
  create-device and duplicate kept ADR-0031's warning while every update tool
  threw for the same mistake — one rule with two answers, which is what a model
  has to unlearn.
- **A trailing comma can't hide a mismatch.** `name: "A,"` against two items is
  one entry, but it is still a list: an arg counts as one when it has a comma in
  it, not when it survives with two entries. Otherwise the short list would read
  as a single value covering both items.
- **Two tools can't check their raw args.** update-clip's `id` and `path` name
  different clips and add up, so its target count is their sum and the two are
  never compared to each other. duplicate shares its destinations out across the
  sources before pairing, so the counts that have to agree are the per-source
  ones — its check runs where the copies are planned, still before any is made.
- **Rule 1's third bullet is one tool wide today.** Only `duplicate` has both
  halves — checkable targets and unrepeatable work. `create-*` tools have no
  target list to pre-check, and `delete` fails safe in the other direction, so
  it reports a skipped target in the result instead
  ([delete.ts](../../src/tools/actions/delete/delete.ts)). The bullet exists so
  the exception reads as a rule rather than as a local comment in duplicate.ts.
- **duplicate's guard runs only for `sources.length > 1`.** A single bad id
  still throws further in, via the per-source path. Same answer, different
  place; pre-existing and not worth a special case.
- **AGENTS.md's wording still holds.** It scopes the no-throw rule to update
  tools, and duplicate isn't one. Nothing to change there.
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
  nothing to say came through as `{}`. `evals/schema-compat`'s `unset-optionals`
  variant asks the same question of a bare five-optional-param schema and agrees
  on that model. The blank-fill risk is real only for a client that behaves
  differently, and it stays unmeasured for every client but this one — the same
  variant against the AI-SDK providers has not been run.
- No published enum has `""` among its options, so rule 5 has no exception to
  carve out.
- **Rule 5 reaches less than its wording suggests.** `z.coerce.string()` accepts
  `""`, so every string param — including every id, path and name — is
  untouched; only numbers, booleans, enums and arrays refuse a blank. That is
  why inverting a whole-tool-surface pin changed six test files rather than the
  surface.
- **The rules are stated on the params, not in the Skills.** The trailing-comma,
  hole and length rules announce themselves: each error names the param and the
  fix, so pre-empting them on ~30 param descriptions would spend the caller's
  context to say what the failure already says. The eight
  `(blank entry = unchanged)` parentheticals went with the leniency they
  described. The Skills say nothing — the fragment that would host it is gated
  `"always"` and may not name a tool or a param.
- **Nothing is lost by refusing a hole in a value list.** There was never a way
  to clear one item's name inside a list; `name: ""` clears every target in the
  call, and `id: "t3", name: ""` clears one. What a hole bought was leaving one
  item's name alone while setting a sibling param across the whole list, which
  costs a re-sent name (`stripReturnSlotLetter` exists so round-tripping a
  reported name is safe) or a second call.
