# Producer Pal Memory System

Status: **plan locked** (2026-07-03); **P1 + P2 implemented on the
`memory-system` branch** (not yet landed on dev). Remaining: the drive-iteration
eval (filed as a follow-up, does not gate). This is the v1.5 deliverable. It
builds on the shipped global-context v1 (`~/.producer-pal/context.md`, injected
verbatim into `ppal-connect`) and the auto-memory pattern used by Claude Code
itself (indexed one-fact-per-file `.md` store). The `~/.producer-pal`
content-override layer it sits on is ADR-0010
(`dev/decisions/0010-user-content-overrides-layer.md`).

## The framing decision: memory is the first "loadable collection"

Memory, custom (user-authored) skills, and on-demand loading of built-in skills
are **three configurations of one primitive**, not three subsystems:

> a **loadable markdown collection** — a `~/.producer-pal/<collection>/`
> directory of frontmatter'd `.md` entries, a **derived, always-injected index**
> of `name → description` hooks, and **on-demand body load** via
> `ppal-context read <name>`.

The v1.5 build is **memory only**, but its store / index / injection / read code
is written **collection-generic** so custom skills becomes a config object + a
webui tab later, not a rewrite. The forward plan for skills is in
[Reuse by later collections](#reuse-by-later-collections) so the primitive is
designed right the first time.

### Injection policy is per-entry (`eager` | `lazy`), not per-collection

This is the design pivot that makes memory and skills coherent instead of
fighting each other:

- Memory wants **tiered-eager** — inject `user`/`feedback` bodies verbatim,
  because PP has no recall harness and weak clients (Claude Desktop, LM Studio)
  don't reliably do a two-step `read`.
- Built-in skill-splitting wants **lazy** — load a specialized skill only when
  relevant, to cut the ~10.9k-token skills blob.

Resolve it by making the policy a property of the **entry**, resolved by a
per-collection hook:

| Collection    | Policy resolver                              |
| ------------- | -------------------------------------------- |
| memory        | `type ∈ {user, feedback}` → eager, else lazy |
| custom skills | `frontmatter.pinned` → eager, else lazy      |
| built-in core | always eager; specialized → lazy             |

`context.md` is just the degenerate "one pinned eager blob." The injector is
then **one function**: inject every `eager` body + a merged index of every
`lazy` hook; `ppal-context read` pulls any lazy body on demand. Memory
frontmatter needs no explicit `inject:` field in v1 — the policy derives from
`type`.

## Goal

Evolve the single-file global context into an **indexed, LLM-managed memory
system**: many small typed fact files, a cheap always-loaded index, and
on-demand retrieval of full bodies — without blowing the context budget or
relying on a recall harness PP doesn't have.

## What already exists (don't rebuild)

Grounded in current code, post the shipped skills-fragment-override work:

- `src/mcp-server/helpers/config-markdown-store.ts` — the generic single-file
  store: `configDir()` (`PRODUCER_PAL_CONFIG_DIR` override else
  `~/.producer-pal`), atomic temp+rename write, missing-file→`""`,
  **Vitest-inert** guard (`isConfigDirInert`). Generalize this to a collection
  store.
- `src/mcp-server/helpers/frontmatter.ts` — flat `key: value` frontmatter
  parse/serialize, no YAML dep. Reuse for memory frontmatter.
- `src/mcp-server/helpers/connect-append.ts` —
  `withConnectAppend(inner, produceBlock)`, the append seam (fires only on
  `ppal-connect`, only on success). Global context and skills each compose one
  producer onto `callLiveApiEnriched` in `create-express-app.ts`. Memory adds a
  `withMemory` producer the same way.
- `src/tools/core/context.ts` + `context.def.ts` — the `ppal-context` tool.
  Today: `action: read | write` × `scope: project | global`. Global scope
  round-trips to Node over the RPC bridge (`handleReadGlobalMemory` /
  `handleWriteGlobalMemory` in `context-helpers.ts`).
- `src/mcp-server/helpers/global-context-node-routes.ts` — the V8↔Node RPC
  bridge (`globalContext.read` / `globalContext.write`). Memory adds sibling ops
  here.
- `src/mcp-server/routes/config-markdown-route.ts` — the REST route factory (GET
  `{content}` no-store; PUT `{content}` origin-gated). webui editor path.
- The collection-editor pattern already exists: `skill-overrides-store.ts` +
  `skill-overrides-route.ts` + webui `use-skill-overrides.ts` / `SkillsScreen`
  manage a **collection of slots** (list / per-item PUT / DELETE, 5s poll,
  save/refresh race guard). The memory manager reuses this shape.

All of the above is whole-blob or fixed-slot today. Memory reuses the store IO,
the RPC bridge, the append seam, and the collection-editor pattern; it adds a
**multi-entry, index-derived** collection on top.

## Directory layout

```
~/.producer-pal/
  context.md              # PINNED always-on note (already ships) — inject verbatim
  memory/
    MEMORY.md             # the INDEX — DERIVED, always injected (small, ~1 line/memory)
    prefers-c-minor.md    # one fact per file
    hates-quantized-hats.md
    album-project-nyx.md
    ...
```

- `context.md` stays as the hand-authored, verbatim, pinned blob (global
  `CLAUDE.md` equivalent). No structure. Untouched by this work.
- `memory/` is the new indexed, LLM-managed layer.

## Memory file format

Mirror Claude Code auto-memory. **Flat** frontmatter (reuses the existing
flat-only `frontmatter.ts`; no nested `metadata:` — that was dropped when
locking the format) + typed body. `name` is the filename slug (authoritative on
read); `description` is collapsed to a single line on write.

```markdown
---
name: hates-quantized-hats
description: Dislikes rigidly quantized hi-hats; wants swing/humanization
type: feedback
---

Never hard-quantize hi-hats when generating drums for this user; apply swing or
timing humanization by default.

**Why:** Stated repeatedly that quantized hats sound "robotic." **How to
apply:** When adding hats, offset off-beats or use a groove. Ask before snapping
to grid. Related: [[prefers-loose-drums]].
```

### Frontmatter here is NOT the "eject trap"

ADR-0010 bans frontmatter/provenance for _forked built-in defaults_ (they drift
from upstream). Memory files are **purely additive user content**: nothing
upstream to drift from. Frontmatter here is just structure (name/description/
type), exactly like Claude Code's own memory. Keep the two concepts separate.

### Types (four buckets, remapped to music)

| Type        | What it holds                           | Default injection | Example                                      |
| ----------- | --------------------------------------- | ----------------- | -------------------------------------------- |
| `user`      | who they are as a musician              | **eager**         | "composes mostly in C minor, house/techno"   |
| `feedback`  | how the assistant should work with them | **eager**         | "always propose 2 variations before writing" |
| `project`   | cross-project creative goals            | lazy              | "album 'Nyx', dark ambient, ~60bpm"          |
| `reference` | external pointers                       | lazy              | "kick samples in ~/Samples/Analog"           |

`feedback` is the highest-value tier: behavioral, almost always relevant.
`project` here = cross-project goals, distinct from the device's per-project
context (which is about ONE Live Set).

## The index (`MEMORY.md`) — DERIVED, not authored

One line per memory, description as the recall hook, grouped by type so the
injector can slice eager vs lazy:

```markdown
# Producer Pal Memory

## User

- `prefers-c-minor` — default key & genre

## Feedback

- `hates-quantized-hats` — swing/humanize drums

## Project

- `album-project-nyx` — dark ambient, 60bpm
```

**Big divergence from Claude Code** (where the index is hand-maintained): here
the backend **regenerates `MEMORY.md` from the files' frontmatter** on every
`remember`/`forget`. Eliminates the "index drifted from files" failure mode and
the discipline burden on the model. Hand-editing a file's frontmatter → next
connect (or a `list`) re-derives.

## Injection strategy — tiered eager (locked)

PP has **no recall harness**, and two-step recall is fragile for weak/external
clients that only see the `ppal-connect` result. So on connect:

- **Always inject**: `context.md` (pinned) + full bodies of all `eager` entries
  (`user` + `feedback`) + the _index lines_ for `lazy` entries (`project` +
  `reference`).
- **On demand** (`ppal-context read <name>`): full `lazy` bodies when a hook
  looks relevant.

Injected as a new `withMemory` producer composed onto `callLiveApiEnriched`
(same seam as `withGlobalContext` / `withSkills`), so external MCP clients see
it in the `ppal-connect` result.

### Token budget check

Skills blob is already ~10.9k tokens/turn; production floor ~18.4k. Keep the
always-on tier bounded:

- ~40–80 tokens/memory body, ~15 tokens/index line.
- Heavy user: ~10 eager bodies (~600 tok) + ~20 lazy index lines (~300 tok) ≈
  **<1k tokens/turn**. Acceptable.
- Guard rail: soft-cap the eager tier — warn in the editor when eager bodies
  exceed N tokens; suggest demoting to `project`/`reference`.

## Write surface — extend `ppal-context`

Reuse the existing V8→Node bridge. Grow the global-scope action set from
`read | write` (whole-blob) to memory-aware ops. Keep the schema TINY (PP rule).
Project scope is unchanged (single device blob; no `fs` in V8).

```
ppal-context
  action: "read" | "write" | "remember" | "forget" | "list"
  scope:  "project" | "global"        (memory ops are global-scope only in v1)
  name:   string?                     (read/remember/forget target a memory entry)
  type:   "user"|"feedback"|"project"|"reference"?   (remember)
  description: string?                (remember — the index/recall hook)
  content: string?                    (write = pinned context.md; remember = body)
```

- `read` — `name` → one memory file; omit `name` → pinned `context.md` (today's
  behavior preserved).
- `write` — whole-blob `context.md` (the pinned note / webui editor). Unchanged.
- `remember` — create/overwrite `memory/<name>.md` + **reindex**.
- `forget` — delete file + reindex.
- `list` — return the derived index (usually already in context).

Node side: new bridge ops `memory.read` / `memory.remember` / `memory.forget` /
`memory.list` alongside `globalContext.*` in `global-context-node-routes.ts`,
plus a `memory/`-aware store module (`global-memory-store.ts` — a thin config of
the generalized collection store: slug validation, atomic writes, frontmatter
parse/serialize, index regeneration). Server owns slug validation + dedupe on
`remember`.

## Where discipline lives

Claude Code's memory discipline lives in its system prompt. PP's equivalent is
the **skills blob** (`ppal-connect` skills) — where the model already gets
instructed. Must be terse (biggest per-turn cost). Minimum viable instruction:

- Before `remember`, check the index for an existing memory that covers it —
  update instead of duplicating.
- One fact per memory. Pick the narrowest `type`.
- `forget` a memory that turns out wrong; don't leave "OUTDATED" markers.
- Convert relative dates ("next week") to absolute before storing.

This lands in the shipped skills fragments (`core-standard` / `core-basic`) — so
it participates in the per-slot override + small-model variants automatically.

## Eval — drives iteration, does NOT gate the ship

The write path ships in the first cut (decided). A shared eval measures, per
model, whether it: (a) calls `remember` when it should and _not_ when it
shouldn't (over-save is the main risk, esp. small models), (b) calls
`ppal-context read` when a lazy hook is relevant. Reuse the `evals/` notation
harness pattern. Eval misses drive skills-blob iteration; they are not a
kill/rollback signal. This same harness is later reused to de-risk custom skills
and built-in skill-splitting (same risk family).

## webui memory manager

Two-pane manager, reusing the `SkillsScreen` collection pattern (list + per-item
editor + 5s poll + save/refresh race guard):

- left: the derived index grouped by type (list / create / delete);
- right: markdown editor for the selected memory (frontmatter + body);
- "delete" removes the file; backend re-derives the index.

New REST routes follow the `skill-overrides-route.ts` collection template (GET
list, PUT/DELETE per entry, origin-gated writes). New webui hook mirrors
`use-skill-overrides.ts`.

## Reuse by later collections (v1.5.x fast-follows)

Designed for now so the primitive is right; **not built in v1.5.**

**Custom (user-authored) skills** — a second collection instance:

- Same store / index / `ppal-context read` / append-seam machinery.
- Policy resolver: lazy by default (index/trigger always injected, body on
  demand), `frontmatter.pinned` → eager for small always-on skills.
- Adds **enable/disable** per skill (surfaced in settings) — the one axis memory
  doesn't have. This is a per-entry `enabled` flag the injector honors.
- User-authored, so no LLM `remember`/`forget` — just the shared `read`. Schema
  stays tiny.
- Distinct from the shipped built-in fragment _override_ (which replaces one of
  the 7 fixed `skill-slots`): custom skills **add** new entries; the slot names
  stay a stable public contract per ADR-0010.

**On-demand loading of built-in skills** — retrofit the ~10.9k blob into the
same lazy-load registry (core eager, specialized lazy). **Highest-risk,
least-proven** of the three: its beneficiary (context savings) is capable
models, who need it least; its failure mode (model doesn't load the right
specialized skill) hits small/local models hardest, who can't be trusted to
two-step. Treat as an eval-gated experiment layered on the mechanism, sequenced
after custom skills — not a v1.5 commitment.

## Open decisions / bikeshed

1. **DECIDED: `memory/` coexists with `context.md`.** `context.md` = pinned
   always-on prose; `memory/` = structured LLM-managed facts. Complementary.
2. **DECIDED: tiered-eager injection**, generalized to a per-entry policy
   (above).
3. **DECIDED: collection-generic build**, memory as first consumer.
4. **DECIDED: v1.5 = memory only**; custom skills + built-in split are v1.5.x.
5. **DECIDED: full read+write from the first cut**; eval drives iteration, not
   gating.
6. **Per-project indexed memory?** Out of scope for v1 — per-project stays a
   single device blob (device-side, no `fs` in V8; bigger lift).
7. **Migration** — none. Existing `context.md` untouched; `memory/` is
   empty-by-default and additive.

## Phasing (v1.5)

- **P1 — primitive + full LLM-managed memory. DONE (on branch).** Shipped:
  `listConfigMarkdownFiles` primitive on the config store;
  `helpers/memory/global-memory-store.ts` (files + derived `MEMORY.md` index +
  slug validation + frontmatter); `helpers/memory/memory.ts` (Node-side
  `MemoryType` contract — not `src/shared`, since nothing V8-side imports it);
  `memory.*` RPC bridge ops (`helpers/memory/global-memory-node-routes.ts`);
  `ppal-context` grows `read | remember | forget | list` (global scope) with
  `name`/`type`/`description` params; `withMemory` append producer
  (`helpers/memory/memory-inject.ts`, eager `user`/`feedback` bodies + lazy
  `project`/`reference` index); memory-discipline instructions in
  `core-standard` / `core-basic`. (Reorg note: `helpers/global-context/*` and
  `tests/server/*` subdirs were created to stay under the 12-item folder cap.)
- **P1 follow-up — eval.** Not built yet. Drives skills-blob iteration; does not
  gate. Reuse the `evals/` notation-harness pattern.
- **P2 — webui memory manager. DONE (on branch).** Two-pane manager on a new
  Memory tab, reusing the collection-editor coordination
  (`useSaveRefreshGuard` + focus/poll) from `useSkillOverrides`:
  - Node REST collection route `routes/memory-collection-route.ts` (GET list,
    PUT `:name`, DELETE `:name`; origin-gated writes), wired in
    `create-express-app`.
  - webui hook `hooks/context/use-memory-collection.ts` (list/save/delete +
    save-overlap guard) and URL helpers in `utils/mcp-url.ts`.
  - webui components under `components/context/memory/` (`MemoryScreen` two-pane
    orchestration, `MemoryList` left index grouped by type, `MemoryEntryEditor`
    right-pane form, `memory-types` UI config); Memory tab added to
    `ContextTabs`. Unlike the fixed-slot Skills editor this is explicit-save (a
    structured record, not one blob); the list still polls for the assistant's
    own remember/forget.
  - (Reorg note: `markdown-editor-theme.ts` was inlined into
    `MarkdownEditor.tsx` to free a slot for the `memory/` subdir under the
    12-item folder cap.)

```

```
