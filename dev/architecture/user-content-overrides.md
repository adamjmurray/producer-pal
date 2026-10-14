# User Content Overrides

How `~/.producer-pal/` works: a global, read-mostly layer of user content. It is
never a mirror of the device's settings. Part of the [Architecture](README.md)
docs; which runtime reads the files is in
[runtime-boundary.md](runtime-boundary.md).

## Who owns what

Each fact has exactly one authority.

| Scope           | Source of truth          | Examples                                 |
| --------------- | ------------------------ | ---------------------------------------- |
| Scalar settings | Max device (persists)    | port, small-model mode, notation         |
| Per-project     | Max device "Context" tab | facts about _this_ Live Set              |
| Global          | `~/.producer-pal/` files | cross-project facts, prompt/skills forks |

The device already persists its settings and per-project context and re-sends
them on load, so there is no `config.json` mirror to keep in step. (What
survives from the idea: atomic temp-and-rename writes, and a missing file reads
as empty — see `config-markdown-store.ts`.)

The file layer is machine-global, shared by every client and every Live Set. The
browser can't touch the filesystem, so the chat UI gets the content over HTTP
and external clients see it through the `ppal-connect` result.

## Override slots

These rules apply to _override_ slots, where a built-in default exists and the
user replaces it. Additive content (global context, memory entries) has no
default and sidesteps them.

1. **Never write built-in defaults to disk.** A copied built-in is a frozen
   fork, so the user misses every later tuning of it. Skills get tuned every
   release.
2. **A file exists only where the user deliberately overrode that slot.** An
   empty folder means everything uses the latest built-ins.
3. **The editor is for discoverability, not dumping.** The chat UI lists every
   slot pre-filled with the current built-in. Saving writes one override file;
   "reset to default" deletes it.
4. **No file tracks upstream; a file is frozen by choice.** A saved override
   carries the Producer Pal version and a hash of the built-in it forked from,
   stamped Node-side on save and never hand-authored, so the editor can flag
   "the default changed since you forked."
5. **Curated slot names are a stable contract; the fragment namespace around
   them is open.** Skills compose through `@include "./name.md"`, so any `.md`
   under `~/.producer-pal/skills/` resolves, nested folders and user-named files
   included. The curated slots (`SKILL_SLOT_NAMES` in
   `src/skills/skill-slots.ts`) are the subset the editor shows and tracks for
   drift, so that set stays small, coarse and stable. Everything else is active
   but untracked: no editor entry, no upgrade reconciliation. Includes are
   depth-1 (only a driver may include), so a fragment costs exactly its own
   length, and resolution is confined to the skills dir.

Renaming or re-cutting slots breaks users silently, so two warnings cover it: an
include naming a retired fragment warns (`src/skills/include-resolver.ts`), and
an override file keyed to a retired slot warns separately
(`RETIRED_SKILL_SLOTS`). The resolver can't see the second, since an orphaned
override appears in no include.

## Other content

- **Custom system prompt**: non-blank content fully replaces the built-in, blank
  means default. It is not an append or a section override, so no provenance is
  needed.
- **Tool and arg descriptions** have no override. The skills system covers it.
- **Memory entries** are additive user content with nothing upstream, so their
  frontmatter is plain structure, not fork provenance. See
  [the memory system](../tools/memory-system/README.md).
- **Named presets or personas** have no file slot. Dynamic toolsets can't change
  mid-session for external clients, so this would be chat-UI only.
