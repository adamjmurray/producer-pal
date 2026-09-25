# Memory entries and index

The on-disk entry format, the derived `MEMORY.md` index, and the tool actions
that read and write them. Part of the [memory system](README.md).

## Memory entry format

One fact per file, `~/.producer-pal/memory/<slug>.md`. Frontmatter is flat
`key: value` (no YAML dependency — `helpers/config-store/frontmatter.ts`) and
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
name. `renderMemoryIndex` in `helpers/memory/memory-store.ts` is the single
renderer for this line format, shared by both the on-disk `MEMORY.md` file and
the injected connect block ([Injection](README.md#injection--index-only)), so
the two can never drift from each other.

The backend regenerates `MEMORY.md` from the entry files' frontmatter on every
`write` / `delete` (and self-heals it on a no-name `read`). There is no
hand-maintained index to fall out of sync — editing a file's frontmatter
directly and then issuing a no-name `read` (or reconnecting) re-derives it.

## Write surface

`ppal-context` `scope:"memory"`:

- `read` — with a `name`, returns that entry's body (or a not-found note); with
  no `name`, returns the whole index.
- `write` — `name` + `content` + `description` required; creates or overwrites
  `memory/<name>.md` (same slug ⇒ update) and re-derives the index.
- `delete` — `name` required; deletes the file (if present) and re-derives the
  index.

`write`/`delete` responses append the freshly regenerated index so the model's
view of what's stored never goes stale mid-conversation.
