# ppal-context

Part of [Tool Behavior](README.md).

Only the memory scope takes more than one target. The project and global scopes
are one document each.

## Several memory names

`name` is a comma-separated list of memory entries on a memory `read` or
`delete`, split like every target list (`\,` is a comma inside a name; an empty
entry is refused before anything runs). A memory `write` has one target, so its
`name` is never split: commas are part of the name, as for any single target.
(Each entry needs its own `description` and `content`, so a write can't take a
list.) A write `name` over 200 characters is refused, since it becomes a
filename.

- **One name answers with its entry, unwrapped**, the same entry a list would
  hold for it. No name reads the index (`{ content }`).
- **Two or more names answer with an array**, one entry per name in the order
  named, spelled as the caller wrote it:
  - read: `{ name, content }`, or `{ name, ok: false, detail }` when there is no
    such entry (`No memory found for "x".`). A lone one throws that `detail`, as
    a lone `read-clip` of an empty slot does.
  - delete: `{ name }` for an entry removed, or
    `{ name, detail: "nothing to delete" }` with no `ok` when it isn't there.
    Nothing needed doing, so it is not a failure (as in `ppal-delete`), and a
    lone one is that same entry, not an error.
- **A name that throws costs only its own entry**: `{ name, ok: false, detail }`
  with the error, and the other names still run. Earlier deletes stay reported.
  A lone one throws it.
- **A name given twice** (any spelling that stores as the same entry, so `Dup`
  and `dup`) is deleted once, by its last mention. Each earlier entry is
  `{ name, detail: 'named again as "<last>" later in this call' }` with no `ok`,
  unless the last mention fails: then they fail with it,
  `{ name, ok: false, detail: 'not written: "<last>" was meant to replace it, but failed' }`.
  The wording is `ppal-delete`'s, from one shared source
  (`src/shared/max/named-again-wording.ts`). A read answers every mention.
- **A delete echoes no index**, for one name or several: the entries are the
  answer, as in `ppal-delete`. Read with no `name` for the current index. (A
  write still echoes it.)
- **No write pipeline.** Memory is files on disk and never touches the Live Set,
  so `ppal-context` stays out of `runWrite`.
