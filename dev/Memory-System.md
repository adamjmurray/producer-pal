# Producer Pal Memory System

An indexed, LLM-managed memory: many small fact files under
`~/.producer-pal/memory/`, a cheap always-injected index, and on-demand
retrieval of full bodies. It sits alongside the pinned global context
(`~/.producer-pal/context.md`, ADR-0010's content-override layer) as a second,
structured layer: context is a hand-authored, always-on blob; memory is a
lazy-loaded notebook the assistant reads and writes itself.

## The loadable-collection primitive

Memory is one instance of a generic **loadable markdown collection**: a
`~/.producer-pal/<subdir>/` directory of frontmatter'd `.md` entries, a derived
always-injected index of `name → description` recall hooks, and on-demand body
load via `ppal-context read`. The store, REST routes, and webui editor are all
built generic so a second collection is a thin binding, not a rewrite:

- **Store**:
  `src/mcp-server/helpers/markdown-store/markdown-collection-store.ts`
  (`makeMarkdownCollectionStore`) owns the CRUD, filesystem-safe slugging +
  path-traversal guard, and reserved-index-slug protection. A binding supplies
  only what differs: subdir/index filename, how a file parses into an entry,
  sort order, and how the index body renders. It sits on the single-slot
  primitives in `config-markdown-store.ts` (`configDir()` —
  `PRODUCER_PAL_CONFIG_DIR` override else `~/.producer-pal`; atomic temp+rename
  writes; `listConfigMarkdownFiles`; `isConfigDirInert` — a Vitest-only guard so
  unit tests never touch a real `~/.producer-pal`).
- **REST**: `src/mcp-server/routes/collection-route.ts`
  (`registerCollectionRoutes`) is a generic GET list / PUT create-or-update
  (with a create-only 409 guard) / DELETE per collection, origin-gated on writes
  exactly like `POST /config`.
- **Webui**: `webui/src/hooks/context/use-doc-collection.ts`
  (`useDocCollection`) and `webui/src/components/context/collection/` (
  `CollectionScreen` + editor/list parts) are the generic two-pane manager
  (list + per-item editor + polling + save/refresh race guard); a collection's
  tab is a thin binding over both.

**Memory is the only shipped collection.** The store, REST routes, and webui kit
are written generic in anticipation of future collections (e.g. user-authored
skills), but no second collection is wired into the product today —
`ppal-context` has no scope beyond `project` / `global` / `memory`, and the
context editor has no tab beyond the five below.

## `ppal-context` tool

`src/tools/core/context.def.ts` + `context.ts` + `context-helpers.ts`. One tool,
three scopes, each a single storage shape:

| Scope     | Storage                                       | Actions                                          |
| --------- | --------------------------------------------- | ------------------------------------------------ |
| `project` | one blob, held by the Max device (no `fs`)    | `read`, `write` (replace)                        |
| `global`  | one pinned blob, `~/.producer-pal/context.md` | `read`, `write` (replace)                        |
| `memory`  | indexed collection, `~/.producer-pal/memory/` | `remember`, `forget`, `list`, `read` (by `name`) |

`scope` defaults to `project`; `action` defaults to `read`. An action not valid
for the given scope (e.g. `remember` on `scope:project`) throws before touching
any state — `context.ts` switches on scope first, then validates the action
within it.

`project` and `global` are unchanged from the pre-memory tool: `project` is a
device-held blob (V8 has no filesystem, so nothing here round-trips to Node);
`global` round-trips to Node over the RPC bridge (`globalContext.read` /
`globalContext.write` in `helpers/global-context/global-context-node-routes.ts`)
to reach `context.md`.

`memory` also round-trips to Node, via sibling RPC ops (`memory.read` /
`memory.remember` / `memory.forget` / `memory.list` in
`helpers/memory/global-memory-node-routes.ts`), which call directly into the
store in `helpers/memory/global-memory-store.ts`. Every mutating route
(`remember`, `forget`) echoes back the freshly regenerated index, so the tool
result always reflects the current memory list even for a client that never
re-connects.

### Small-model mode

`context.def.ts`'s modal config narrows the tool to blobs only: `scope` drops
the `memory` enum value, `action` drops `remember` / `forget` / `list` (leaving
`read` / `write`), and `name` / `description` are hidden params. A small model
therefore only ever sees `project` / `global` read-write — it cannot address the
memory collection at all, and (see below) the memory-index injection is skipped
for the same reason.

## Memory entry format

One fact per file, `~/.producer-pal/memory/<slug>.md`. Frontmatter is flat
`key: value` (no YAML dependency — `helpers/markdown-store/frontmatter.ts`) and
holds exactly two fields:

```markdown
---
name: hates-quantized-hats
description: Dislikes rigidly quantized hi-hats; wants swing/humanization
---

Never hard-quantize hi-hats when generating drums for this user; apply swing or
timing humanization by default.
```

- `name` is the filename slug; it is authoritative on read (frontmatter is
  user-editable and may drift, so the store re-derives it from the filename
  rather than trusting the field).
- `description` is the one-line recall hook shown in the index — the _only_
  always-on signal for that memory, so it must convey when the memory is
  relevant and what it holds, not just a title.
- Any other frontmatter key is ignored on read. (A file written by an older
  build with a `type:` line still parses fine — `parseFrontmatter` tolerates
  unknown keys, and the store simply never looks at `type`.)

Frontmatter here is plain structure, not the ADR-0010 "eject trap": that
provenance concept exists for _forked built-in defaults_, which can drift from
an upstream they were copied from. Memory entries are purely additive user
content with nothing upstream to drift from.

Slugs are derived by lowercasing, collapsing non-alphanumerics to hyphens, and
trimming edges (`slugifyCollectionName`) — the result can only contain
`[a-z0-9-]`, which doubles as the path-traversal guard. The derived index
filename (`MEMORY.md`) is a **reserved slug**: on a case-insensitive filesystem
(macOS APFS, Windows NTFS) an entry that happened to slugify to `memory` would
write the same file as the index and silently clobber it, so every
read/remember/forget checks for the collision. Linux CI cannot catch this — it's
a durable gotcha to keep in mind when touching the collection store.

## The index (`MEMORY.md`) — derived, not authored

A flat, name-sorted list of one line per entry, description as the recall hook:

```markdown
# Producer Pal Memory

- `hates-quantized-hats` — Dislikes rigidly quantized hi-hats; wants
  swing/humanization
- `prefers-c-minor` — Default key & genre for new tracks
```

There is no category/type grouping — the index is one flat list, alphabetical by
name. `renderMemoryIndex` in `helpers/memory/global-memory-store.ts` is the
single renderer for this line format, shared by both the on-disk `MEMORY.md`
file and the injected connect block below, so the two can never drift from each
other.

The backend regenerates `MEMORY.md` from the entry files' frontmatter on every
`remember` / `forget` (and self-heals it on `list`). There is no hand-maintained
index to fall out of sync — editing a file's frontmatter directly and then
hitting `list` (or reconnecting) re-derives it.

## Injection — index-only

On a successful `ppal-connect`, the memory index (every entry's
`name — description`, nothing else) is appended as a distinct text block:

- **Always injected** (large-model mode, memory non-empty): the full index, with
  a short explanation of what it is and how to load a body (`ppal-context`
  `action:"read"`, `scope:"memory"`, `name:"<name>"`).
- **Never injected**: any memory _body_. A fact that must be always-on belongs
  in context (`global`/`project`), not memory — the model escalates there by
  asking the user (see Discipline below).
- **Skipped entirely** in small-model mode, or when there are no memories.

This is the `withMemory` producer in `helpers/memory/memory-inject.ts`, composed
onto `callLiveApiEnriched` via the shared append seam
(`helpers/connect-append.ts`'s `withConnectAppend` — the same mechanism
`withGlobalContext` and the `WARNING:` relay use). Because it runs Node-side on
the `ppal-connect` response, every MCP client sees it, including external
clients with no memory/recall harness of their own (Claude Desktop, LM Studio) —
the index _is_ the recall harness.

## Write surface

`ppal-context` `scope:"memory"`:

- `read` — `name` required; returns that entry's body, or a not-found note.
- `remember` — `name` + `content` required, `description` optional; creates or
  overwrites `memory/<name>.md` (same slug ⇒ update) and re-derives the index.
- `forget` — `name` required; deletes the file (if present) and re-derives the
  index.
- `list` — returns the current derived index (usually already visible from
  connect; this is an explicit refresh).

`remember`/`forget` responses append the freshly regenerated index so the
model's view of what's stored never goes stale mid-conversation.

## Discipline

Instructions for the model live in the shipped skills fragments
(`src/skills/core/core-standard.ts`; large-model mode only — small-model mode
has no memory instructions since the tool surface excludes it):

- `remember` lasting facts: who the user is as a musician, how they want the
  assistant to work with them, cross-project goals, external pointers (e.g. a
  sample folder) — not this-Live-Set details (`scope:project`) or one-off task
  facts.
- The description is the only signal visible before a `read` — write it as a
  precise recall hook (what's inside, when it's relevant), not a vague label.
- Before remembering, check the index for an entry that already covers it and
  reuse its name to update rather than duplicate. One fact per memory.
- Default to a memory. Only escalate to context (`action:write` on
  `scope:global` or `scope:project`) when a fact is clearly a long-lived
  preference or core project goal that belongs always-in-context — ask first,
  then write it on the user's behalf.
- `forget` anything wrong or outdated rather than leaving stale entries. Convert
  relative dates ("next week") to absolute before storing.
- Remember quietly as facts emerge; don't announce each save.

## Webui memory manager

A **Memory** tab in the five-tab context editor
(`webui/src/components/context/ContextTabs.tsx`: Project, Global, Instructions,
Skills, Memory), backed by `useMemoryCollection` (a thin binding of
`useDocCollection` to the `/memory` REST routes) and rendered by
`components/context/memory/` (`MemoryScreen` — the two-pane orchestration;
`MemoryList` — the flat, name-sorted left index; `MemoryEntryEditor` — the
right-pane form):

- Left pane: the flat index (no grouping) with create/select/delete.
- Right pane: an editor for the selected entry's name, description, and body.
  `name` is the file's stable slug but is editable for an existing entry too:
  committing an edited name renames in place (the entry moves to the new slug),
  and a rename onto a name another entry already owns is rejected with the
  collision surfaced under the field.
- New/edited entries autosave (idle-debounced, flushed on unmount); creating a
  new entry uses the REST route's create-only mode so it can't silently
  overwrite an existing entry its name happens to slugify to.
- The list keeps polling on an interval and on window focus, so an entry the
  assistant remembers or forgets mid-session appears without a manual refresh.

REST routes: `src/mcp-server/routes/memory-collection-route.ts`, a thin binding
of the generic `registerCollectionRoutes` (GET list, PUT `:name`, DELETE
`:name`, and PUT `:name/rename`; writes origin-gated the same way as
`POST /config`).

## Testing

Node-side memory code reads/writes real files, so tests point
`PRODUCER_PAL_CONFIG_DIR` at a temp directory to opt back into filesystem access
(the store is otherwise inert under Vitest by default — see `isConfigDirInert`
in `config-markdown-store.ts` — so unit tests never touch a developer's real
`~/.producer-pal`).
