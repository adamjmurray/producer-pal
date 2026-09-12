# `ppal-context` tool

`src/tools/core/context.def.ts` + `context.ts` + `context-helpers.ts`. One tool,
three scopes, each a single storage shape.

The action verbs are uniform across scopes — `read` / `write` / `delete` — and
their meaning is driven by `scope`, so there is one verb set to learn rather
than scope-specific verbs:

| Scope     | Storage                                       | Actions                                                                                         |
| --------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `project` | one blob, held by the Max device (no `fs`)    | `read`, `write` (replace, guarded)                                                              |
| `global`  | one pinned blob, `~/.producer-pal/context.md` | `read`, `write` (replace, guarded)                                                              |
| `memory`  | indexed collection, `~/.producer-pal/memory/` | `read` (entry by `name`, or the index if no `name`), `write` (upsert `name`), `delete` (`name`) |

`scope` defaults to `project`; `action` defaults to `read`. `read` on `memory`
with no `name` returns the whole index (there is no separate `list` action).
`delete` is only valid under `scope:memory` — issued on `project`/`global` it
throws before touching any state, because `context.ts` switches on scope first,
then validates the action within it.

`project` and `global` are unchanged from the pre-memory tool: `project`
read/write hit a device-held blob (V8 has no filesystem, so those two actions
don't round-trip to Node — the on-disk backup below is a separate mechanism);
`global` round-trips to Node over the RPC bridge (`globalContext.read` /
`globalContext.write` in `helpers/global-context/global-context-node-routes.ts`)
to reach `context.md`.

## Project context on-disk backup

The `project` blob lives in a Max device parameter, so it's serialized into the
`.als` and survives save/reload — but **not a device upgrade**: dropping in a
newer `.amxd` gives a fresh device whose param is empty, losing the context. The
backup mirrors the blob to a `Producer Pal Project Context.md` file sibling to
the Live Set's `.als`, so an upgraded device can recover it. Two alternatives
were rejected: copying from a sibling device already in the set (fragile
load-time coordination), and a central `~/.producer-pal` store keyed by set path
(doesn't travel with the project; keying breaks on rename/move).

**The sidecar is per project _folder_, and that is a requirement.** A Live
Project is a folder holding one or more `.als` files, and the
variations/versions inside it (`Song.als`, `Song (alt mix).als`, `Song v2.als`)
are the same project — same genre, same arrangement, same track roles — so they
share its notes. One sidecar, peer to the `.als` files, restored by a fresh
device in whichever of those Sets loads it first.

Two consequences follow, and both look like bugs to a reader who assumes the
per-Set device param is the unit being backed up:

- **Last writer wins is intended.** The sidecar holds the last written project
  context of _any_ Set in the folder. A fresh device in a different Set
  restoring that blob is the feature, not cross-contamination.
- **Nothing verifies which `.als` a sidecar came from,** because nothing should.

Do not "fix" either by keying the filename on the `.als` basename. Beyond
discarding the sharing requirement, it breaks the two things this design must
survive — renaming a Set inside the folder, and moving the folder — which is the
same fragility that got the central path-keyed store rejected above. Deriving
the sidecar name from a path re-introduces it; deriving it from the folder does
not. (This was attempted once and reverted.)

`Song.file_path` is **not observable** (no notification on save), so instead of
reacting to a save we pull it on every MCP tool call and only act on change. The
flow, split across the runtime boundary (V8 has the Live API; Node has the
filesystem):

- **V8** (`live-api-adapter/project-context-sync.ts`, called from `mcp_request`
  before the tool runs): reads `live_set file_path` (a cheap `getProperty`) and,
  when a first sync / changed path / changed blob warrants it, calls the
  `projectContext.sync` RPC with `{ filePath, content }`. A cross-request memo
  skips the Node hop on the vast majority of calls. On a `restore` response it
  writes the blob back into the device param via the existing
  `update_project_context` outlet (so it re-persists into the `.als`).
- **Node** (`helpers/project-context-backup/`): the `projectContext.sync` route
  owns the `fs`. Sidecar path = `<dir of .als>/Producer Pal Project Context.md`
  — one per project _folder_ (see above; folder keying is a requirement), so
  saving a new `.als` into the same folder is a no-op and only Save-As to a new
  folder writes a fresh backup. A non-empty param with a missing sidecar, or
  with a differing one that a genuine write supersedes (the `isEdit` flag, see
  below) ⇒ **backup**. An empty param is ambiguous, disambiguated by an
  `allowRestore` flag V8 sends (see below): with a non-empty sidecar ⇒
  **restore** (also updates Node's `config.projectContext` mirror directly, so a
  restore during `ppal-connect` shows in that response's injected block — the
  Max round-trip that re-persists the param can't be relied on to land in time);
  otherwise ⇒ **clear** (delete the sidecar). Otherwise a no-op.

**Restore vs. clear.** An empty param means either "device was upgraded, param
wiped" (restore) or "the user cleared the context"
(`ppal-context write content:""`, an explicit supported clear). Only a device
(re)load wipes the param, and that resets V8's module-level memo, so restore is
gated on `allowRestore = !memo.syncedOnce` — allowed only on the session's first
sync. After that first sync, an empty param is a deliberate clear, and the route
_deletes_ the sidecar so the clear sticks and isn't resurrected by a restore on
the next load.

The tool-call sync is the primary trigger, but a **manual edit** (device-UI
textedit or webui `POST /config`) changes the context without invoking a tool,
so a second trigger covers it: V8's `projectContext()` param setter. Both manual
paths propagate to the device param and thus through this setter, which
fire-and-forgets `backupProjectContextOnEdit` (sharing the sync memo). That
function only **backs up** a non-empty blob or **clears** the sidecar for an
emptied one — it **never restores** (restore stays the first tool-call sync's
job). An empty param seen _before_ the first sync is left untouched: it may be
an upgrade-wiped device, and deleting the sidecar would destroy the very backup
a restore needs. A non-empty edit in that same window is sent as a _non_-write
(`isEdit: false`) for the same reason: it may be the first thing typed into a
box that was wiped, and overwriting the sidecar with it buries notes nothing can
restore afterward — the param is no longer empty, so the restore path is closed.
It still creates a missing sidecar. Unless the **load echo carried content** —
then nothing wiped the param, so the clear is real and propagates immediately,
and edits get their write privileges back. Without that, clearing the context in
the device UI and then making any tool call would restore what was just cleared.
The shared memo dedupes the tool-call sync's own outlet round-trip, so the
restore echo can't loop.

`ppal-context write scope:project` needs the same trigger, and for a reason
worth stating: its `update_project_context` outlet reaches the device-UI
textedit through the patch's `prepend set`, which updates the display
**without** output — so unlike a device-UI or webui edit, a tool write never
re-enters the setter. `handleWriteProjectContext` therefore fires
`backupProjectContextOnEdit` itself. Waiting for the next tool call's sync would
be wrong twice over: a sync isn't a write (so it can't overwrite a differing
sidecar at all), and a write that is the session's last tool call would never
reach disk.

**Edit vs. load.** Everything above hinges on the sidecar only being overwritten
by a genuine write, which the `isEdit` flag on the sync RPC carries: true from
`backupProjectContextOnEdit` (device-UI edit, webui `POST /config`,
`ppal-context write`), false from the pre-tool-call `syncProjectContextBackup`.
The hard part is V8-side, because Max delivers the device's saved blob back
through the very same `projectContext()` setter a user edit uses — Live emits
the textedit's embedded value when it restores the device, and the
`---v8-started` / `---node-started` bangs re-emit it, in no guaranteed order (a
real load was observed producing **three** echoes, two of them before Node had
finished booting). Two facts separate them, and neither depends on init order:

- The session's **first** setter call is always a load echo — that is how the
  blob reaches V8 at all, and it lands before a user could plausibly type.
- Every later echo carries the **same** textedit content, so a set that changes
  nothing is never an edit.

A re-entrancy bracket around V8's own `outlet(0, "started")` was tried and does
not work: the bang is deferred, so the call returns before its own echo arrives.
A patch-side split (routing the resync bangs through a `[gate]` so restores
arrive as a distinct message) was also rejected — at least one restore source is
Live re-emitting the textedit's embedded value, which never passes through those
bangs, so the gate would misclassify it as an edit. The value guard covers every
source. Residual gap: typing into the Context tab inside the ~1s load window
means that edit is what gets echoed back, so it stays in the `.als` param until
the next edit.

Residual gap (accepted, not closed — a background poller was rejected): setting
context while the Set is _unsaved_ (no `file_path` to write beside), then saving
and upgrading with no further tool call or context edit. The `null → path`
transition on first save fires neither the setter nor a tool call, so no backup
is written. Any later tool call or context edit closes it.

**Why merely opening a Set never writes the sidecar.** An earlier version
overwrote any sidecar whose content differed from the param, reached identically
by a genuine context edit, by a device load (Max restores the saved param
through the `projectContext()` setter), and by the first tool-call sync — so
opening a previous version of a Set in the folder replaced the project's current
notes with that Set's stale ones, with no context write and no user intent.

The rule now enforced: create a _missing_ sidecar always (covering a first save,
a Save-As, and a moved folder), but overwrite an _existing, differing_ one only
on a real project-context write. An `isEdit` flag on the sync request is what
separates them, and each V8 entry point knows which kind it is:

- `syncProjectContextBackup` runs before every tool call and only _observes_ the
  param, so it always sends `isEdit: false`. It can still create a missing
  sidecar; it can never replace a differing one.
- `backupProjectContextOnEdit` is only ever reached by a genuine write, so it
  sends `isEdit: true` — except while the device may have loaded wiped (no sync
  yet and no load echo with content), where even a write waits its turn.

The node route refuses the overwrite directly
(`existing != null && !isEdit ⇒ action: "none"`, treating an empty sidecar as no
backup). A device load is additionally filtered before it gets that far: the
setter classifies a set that changes nothing, or the session's first set, as a
load echo rather than an edit.

A sidecar that exists but can't be read is its own outcome
(`action: "unreadable"`), never `"none"`. The route always skips — it can't tell
whether writing would bury the folder's shared notes — but only V8 knows what
the skip cost, so it decides what to do:

- **Restore** (empty blob): still owed. V8 leaves the session's one restore
  unspent and the wipe question open, warns once, and retries the read on the
  next tool call. Collapsing this into `"none"` would look like "no backup": the
  restore is silently forfeited and the next edit overwrites the sidecar as soon
  as it's readable again.
- **Genuine write**: didn't reach disk, and the user thinks it did. Warned once
  per blob, so a later edit says so again, and not memoized either — an
  unreadable sidecar is usually a passing lock (cloud sync), so the next sync
  retries. This is keyed off "was this a write", not off `isEdit`: a write made
  while the wipe question is open carries `isEdit: false`, and it is still the
  user's own text that didn't reach disk.
- **Passing sync**: lost nothing, since it was never allowed to overwrite an
  existing sidecar. Memoized silently.

The sidecar is NOT under `~/.producer-pal`, so it deliberately does not go
through the config-markdown store — it writes into the user's Live project
folder using a path the Live API supplied.

`memory` also round-trips to Node, via sibling RPC ops (`memory.read` /
`memory.remember` / `memory.forget` / `memory.list` in
`helpers/memory/memory-node-routes.ts`), which call directly into the store in
`helpers/memory/memory-store.ts`. The wire route names still read
`remember`/`forget`/`list` — internal identifiers that predate the verb
unification and never reach the AI; the tool's `write`/`delete`/`read`(no-name)
actions map onto them. Every mutating route echoes back the freshly regenerated
index, so the tool result always reflects the current memory list even for a
client that never re-connects.

## Small-model mode

`context.def.ts`'s modal config narrows the tool to blobs only: `scope` drops
the `memory` enum value, `action` drops `delete` (leaving `read` / `write`), and
`name` / `description` are hidden params. A small model therefore only ever sees
`project` / `global` read-write — it cannot address the memory collection at
all, and the memory-index injection is skipped for the same reason (see
"Injection — index-only" in [../Memory-System.md](../Memory-System.md)).
