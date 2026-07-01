# Producer Pal Memory System

Status: design agreed, implementation not started. Builds on
`dev/plans/User-Content-Overrides.md` (global-context v1, already shipped as a
single `context.md`) and the auto-memory pattern used by Claude Code itself
(indexed one-fact-per-file `.md` store).

## Goal

Evolve the shipped single-file global context (`~/.producer-pal/context.md`,
injected verbatim into `ppal-connect`) into an **indexed, LLM-managed memory
system**: many small typed fact files, a cheap always-loaded index, and
on-demand retrieval of full bodies — without blowing the context budget or
relying on a recall harness PP doesn't have.

## What already exists (don't rebuild)

- `global-context-store.ts` — dir resolution (`PRODUCER_PAL_CONFIG_DIR`
  override), missing-file→empty, atomic temp+rename write, Vitest-inert.
- `global-context-node-routes.ts` — `globalContext.read` / `globalContext.write`
  over the V8↔Node RPC bridge.
- `context-helpers.ts` — V8-side `handleReadGlobalMemory` /
  `handleWriteGlobalMemory` round-tripping through that bridge.
- Express `GET`/`PUT /global-context` — webui editor.
- Injection seam: `ppal-connect` result gets a labeled extra content block (same
  mechanism as the `WARNING:` relay).

All of this is whole-blob today. The memory system reuses the store IO, the RPC
bridge, and the injection seam; it adds structure on top.

## Directory layout

```
~/.producer-pal/
  context.md              # PINNED always-on note (already built) — inject verbatim
  memory/
    MEMORY.md             # the INDEX — always injected (small, ~1 line/memory)
    prefers-c-minor.md    # one fact per file
    hates-quantized-hats.md
    album-project-nyx.md
    ...
```

- `context.md` stays as the hand-authored, verbatim, pinned blob (global
  `CLAUDE.md` equivalent). No structure. Simplest thing; still valuable.
- `memory/` is the new indexed, LLM-managed layer.

## Memory file format

Mirror Claude Code auto-memory. Lightweight frontmatter + typed body.

```markdown
---
name: hates-quantized-hats
description: Dislikes rigidly quantized hi-hats; wants swing/humanization
metadata:
  type: feedback
---

Never hard-quantize hi-hats when generating drums for this user; apply swing or
timing humanization by default.

**Why:** Stated repeatedly that quantized hats sound "robotic." **How to
apply:** When adding hats, offset off-beats or use a groove. Ask before snapping
to grid. Related: [[prefers-loose-drums]].
```

### Frontmatter is NOT the "eject trap"

The override-plan bans frontmatter/provenance for _forked built-in defaults_
(they drift from upstream — the create-react-app eject problem). Memory files
are **purely additive user content**: nothing upstream to drift from.
Frontmatter here is just structure (name/description/type), exactly like Claude
Code's own memory. Keep the two concepts separate in the docs.

### Types (four buckets, remapped to music)

| Type        | What it holds                           | Example                                      |
| ----------- | --------------------------------------- | -------------------------------------------- |
| `user`      | who they are as a musician              | "composes mostly in C minor, house/techno"   |
| `feedback`  | how the assistant should work with them | "always propose 2 variations before writing" |
| `project`   | cross-project creative goals            | "album 'Nyx', dark ambient, ~60bpm"          |
| `reference` | external pointers                       | "kick samples in ~/Samples/Analog"           |

`feedback` is the highest-value tier: behavioral, almost always relevant.
`project` here = cross-project goals, distinct from the device's per-project
context (which is about ONE Live Set).

## The index (`MEMORY.md`)

One line per memory, description as the recall hook:

```markdown
# Producer Pal Memory

## User

- [C minor / house](prefers-c-minor.md) — default key & genre

## Feedback

- [No quantized hats](hates-quantized-hats.md) — swing/humanize drums
- [Two variations](two-variations.md) — propose 2 options before writing

## Project

- [Album: Nyx](album-project-nyx.md) — dark ambient, 60bpm
```

Grouped by type so the injection tiering (below) can slice it.

## Injection strategy — THE key decision

PP has **no recall harness** (Claude Code's harness injects relevant memories
into system-reminders; PP has nothing equivalent). So either the LLM does a
two-step recall (see index hook → call `ppal-context read`), or we inject
eagerly. Two-step is fragile for weak/external clients (Claude Desktop, LM
Studio), which only see the `ppal-connect` result.

Three options:

| Option           | Inject on connect                          | Pros / Cons                                        |
| ---------------- | ------------------------------------------ | -------------------------------------------------- |
| Index-only       | `MEMORY.md` only; pull files on demand     | cheapest; relies on fragile 2-step recall          |
| **Tiered eager** | index + full `user`+`feedback` bodies      | robust for dumb clients; modest cost — RECOMMENDED |
| Whole-dir        | every file (today's `context.md` behavior) | no recall step; reintroduces the scaling problem   |

**Recommended: tiered eager.**

- Always inject: `context.md` (pinned) + full bodies of `user` + `feedback`
  (small, behavioral, always-relevant) + the _index lines_ for `project` +
  `reference`.
- On demand (`ppal-context read <name>`): full `project` / `reference` bodies
  when a hook looks relevant.

### Token budget check

Skills blob is already ~10.9k tokens/turn (from the voice-token audit). Keep the
always-on memory tier bounded:

- Assume ~40–80 tokens/memory body, ~15 tokens/index line.
- A heavy user: ~10 `user`+`feedback` bodies (~600 tok) + ~20 index lines (~300
  tok) ≈ **<1k tokens/turn**. Acceptable against the ~18.4k production floor.
- Guard rail: soft-cap the eager tier (e.g. warn in the editor when
  `user`+`feedback` bodies exceed N tokens; suggest demoting to `reference`).

## Write surface — extend `ppal-context`

Reuse the existing V8→node bridge. Grow the action set from `read|write`
(whole-blob) to memory-aware ops. Keep the schema TINY (PP rule).

```
ppal-context action: "read" | "remember" | "forget" | "list"
  read:     { name?: string }            // name → one file; omit → pinned context.md
  remember: { name, type, description, content }  // create/overwrite memory/<name>.md + reindex
  forget:   { name }                     // delete file + index line
  list:     {}                           // return the index (usually already in context)
```

- `remember` owns index maintenance server-side (regenerate `MEMORY.md` from the
  files' frontmatter — index is derived, never hand-synced, so it can't drift).
- Keep the whole-blob `write` for `context.md` (the pinned note / webui editor).
- Node side: new routes `memory.read` / `memory.remember` / `memory.forget` /
  `memory.list` alongside the existing `globalContext.*`. Store gets a
  `memory/`-aware module (`global-memory-store.ts`): slug validation, atomic
  writes, frontmatter parse/serialize, index regeneration.

### Index is DERIVED, not authored

Big divergence from Claude Code (where I hand-maintain `MEMORY.md`). Here the
backend regenerates `MEMORY.md` from the files on every `remember`/`forget`.
Eliminates the "index drifted from files" failure mode and the discipline burden
on the model. Hand-editing a memory file's frontmatter → next connect (or a
`list`) can re-derive.

## Where discipline lives

Claude Code's memory discipline (one fact/file, dedup, delete-when-wrong,
`[[links]]`, absolute dates) lives in the system prompt. PP's equivalent is the
**skills blob** (`ppal-connect` skills) — that's where the model already gets
instructed. Must be terse (skills blob is already the biggest per-turn cost).
Minimum viable instruction:

- Before `remember`, check the index for an existing memory that covers it —
  update instead of duplicating.
- One fact per memory. Pick the narrowest `type`.
- `forget` a memory that turns out wrong; don't leave "OUTDATED" markers.
- Convert relative dates ("next week") to absolute before storing.

## webui editor

Phase-2 editor already edits `context.md`. Extend to a two-pane memory manager:

- left: the index grouped by type (list/create/delete);
- right: markdown editor for the selected memory (frontmatter + body).
- "reset"/"delete" removes the file; backend re-derives the index. Reuses the
  project-context editor component per the override plan.

## Open decisions / bikeshed

1. **DECIDED: `memory/` coexists with `context.md`.** `context.md` = pinned
   always-on prose (verbatim inject, hand/webui-authored); `memory/` =
   structured LLM-managed facts (indexed, tiered inject). Two complementary
   mechanisms, not one subsuming the other. `context.md` already ships and is
   untouched by this work.
2. **Injection tier** — confirm tiered-eager vs index-only. Depends on how much
   we care about weak/external clients doing 2-step recall.
3. **Per-project memory too?** Today per-project context is a single device
   blob. Could later mirror this indexed structure per Live Set, but that's
   device-side (no `fs` in V8) — bigger lift. Out of scope for v1.
4. **Slug collisions / naming** — server owns slug validation + dedupe on
   `remember`.
5. **Migration** — existing `context.md` users: untouched. `memory/` is
   empty-by-default, additive. Zero migration.
6. **Do small models even call `remember`?** Behavior capture may need the
   skills blob to nudge ("when the user states a lasting preference, save it").
   Risk: over-eager saving. Eval before shipping the write path.

## Suggested phasing

- **P1** `global-memory-store.ts` (files + derived index) + `memory.*` node
  routes + `ppal-context` read/list (READ path only). Inject index + eager tier
  into `ppal-connect`. No LLM writes yet — hand-author files to validate recall.
- **P2** `remember`/`forget` write path + skills-blob discipline instructions +
  eval that the model saves/dedupes sanely.
- **P3** webui two-pane memory manager.

```

```
