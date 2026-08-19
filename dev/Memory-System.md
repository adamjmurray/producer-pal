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

- **Store**: `src/mcp-server/helpers/config-store/markdown-collection-store.ts`
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

**Memory is the only SURFACED collection — but not the only one built.** A
second, user-authored **custom skills** collection
(`~/.producer-pal/skills-custom/`) exists end to end: store
(`helpers/skills-custom/`), REST routes, V8↔Node RPC routes, and a complete
webui screen (`CustomSkillsScreen` / `CustomSkillsList` / `CustomSkillEditor` +
`use-custom-skills-collection`), all with tests. It was hidden in v1.5.0 rather
than removed, and every entry point that could reach a user or the model is
disconnected:

- `ppal-context`'s `scope` enum is `project` / `global` / `memory` — there is no
  `skills` scope, so the `skills.read` / `.remember` / `.forget` / `.list` RPC
  routes are registered but **uncallable**.
- `withCustomSkills` (`custom-skills-inject.ts`) has **no callers**, so the
  skills index never reaches a `ppal-connect` result.
- `ContextTabs` never imports `CustomSkillsScreen`; its `skills` tab is
  `SkillsScreen`, the built-in-fragment _override_ editor. The custom-skills
  component tree is unreferenced.

The one live surface is `registerCustomSkillsCollectionRoutes(app)`, registered
unconditionally in `create-express-app.ts`. A `PUT /custom-skills` therefore
still writes a file and regenerates the index — it just sits there, because
nothing reads it.

**That inertness is the precondition, and restoring the feature is what ends
it.** Wiring `withCustomSkills` back up turns anything already in
`skills-custom/` into live instruction text on every connect. The server binds
all interfaces with no auth, so a restore should audit or clear that directory
as part of enabling it rather than assume it starts empty.

Beyond custom skills, the generic store / REST / webui kit is written for future
collections that don't exist yet.

## `ppal-context` tool

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

### Project context on-disk backup

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

### Small-model mode

`context.def.ts`'s modal config narrows the tool to blobs only: `scope` drops
the `memory` enum value, `action` drops `delete` (leaving `read` / `write`), and
`name` / `description` are hidden params. A small model therefore only ever sees
`project` / `global` read-write — it cannot address the memory collection at
all, and (see below) the memory-index injection is skipped for the same reason.

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
the injected connect block below, so the two can never drift from each other.

The backend regenerates `MEMORY.md` from the entry files' frontmatter on every
`write` / `delete` (and self-heals it on a no-name `read`). There is no
hand-maintained index to fall out of sync — editing a file's frontmatter
directly and then issuing a no-name `read` (or reconnecting) re-derives it.

## Injection — index-only

On a successful `ppal-connect`, the three context layers are each appended as
their own distinct, labeled text block, in order: project context, global
context, then the memory index — followed by the next-step instruction, which
always comes last (see Onboarding below). Each block is just a header plus its
data — the layer purpose/ownership teaching lives in the (customizable) skills,
not here. For memory, only the index (every entry's `name — description`,
nothing else) is injected:

A layer with nothing in it emits **no block at all**, so the next-step block
names the empty ones outright
(`Currently empty: project context, global context, memory.`). Absence is not a
message: a Claude Desktop session, given no global-context block, assumed the
document had content, never called `ppal-context` to check, and said afterwards
it had been "just speculating". Anything the model is expected to _act_ on — and
an empty document is directly actionable, since writing it needs no permission —
has to be stated.

- **Always injected** (large-model mode, memory non-empty): the full index,
  headed with how to load a body (`ppal-context` `action:"read"`,
  `scope:"memory"`, `name:"<name>"`).
- **Never injected**: any memory _body_. A fact that must be always-on belongs
  in context (`global`/`project`), not memory — the model escalates there by
  asking the user (see Discipline below).
- **Skipped entirely** in small-model mode, or when there are no memories.

This is the `withMemory` producer in `helpers/memory/memory-inject.ts`, composed
onto `callLiveApiEnriched` via the shared append seam
(`helpers/connect/connect-append.ts`'s `withConnectAppend` — the same mechanism
`withProjectContext`, `withGlobalContext`, and the `WARNING:` relay use).
Because it runs Node-side on the `ppal-connect` response, every MCP client sees
it, including external clients with no memory/recall harness of their own
(Claude Desktop, LM Studio) — the index _is_ the recall harness. (Project
context is likewise injected Node-side rather than embedded in V8's `connect()`
result, so all clients see the same shape; see `withProjectContext` in
`helpers/global-context/global-context-inject.ts`, which co-hosts both context
blob injectors.)

## Onboarding — how context and memory get discovered

These layers only earn their keep if something is in them, and nothing goes in
unless the assistant asks. A user who never hears about the feature never gets
one, so the next-step instruction that closes every `ppal-connect` response
(`helpers/connect/next-step-inject.ts`, `withNextStep`) varies on whether we
know anything about this user at all:

- **Global context empty AND no memories** (large-model mode): the next step
  tells the assistant to briefly ask the user — in the same reply as the
  connection report, not as a blocking questionnaire — about their musical
  style, preferences, and goals, write what they get to **global context**, and
  record a decline as a memory.
- **Otherwise**: the plain "report the overview, then wait for their
  instructions" instruction, unchanged from the `nextStep` field it replaced.

It is phrased as a **yes/no question**, not an open offer, and that is not a
style note. The first version said "tell me your style anytime"; a user replying
"let's just make some music" was not answering anything, so the brush-off never
registered as a decline, nothing got written, and the next session asked all
over again. A question gives the user something to decline — which is the only
way the one-shot mechanism below ever fires for someone who isn't interested.

What they share goes to **global context, not memory** — who the user is should
always apply, and always-on is what context is for; filing it in memory
downgrades it to a fact the assistant may never load again. It needs no
confirmation despite being a user-owned document, because the empty-document
exemption applies (see Layer discipline below).

The offer is **one-shot without any dedicated flag**: sharing fills global
context, declining writes a memory, and _either_ flips the check, so the next
connect gets the plain instruction. Clearing both in the context editor brings
the offer back, which is the semantics you'd want anyway. Nothing else records
the "already asked" state; there is deliberately no sentinel file and no
frontmatter flag.

Two design constraints worth preserving:

- **It lives here, not in the skills.** As a connect-response block it costs
  tokens only for the users who need it (zero for everyone else), and it arrives
  as a just-in-time instruction rather than one rule inside a ~10k-token skills
  blob. It also keeps the skills free of a contradiction: `context.ts` says to
  save memories _quietly, as facts emerge_, which reads as the opposite of
  "interview the user up front" when both sit in the same always-on document.
- **`withNextStep` must stay outermost.** The old static `nextStep` field lived
  inside V8's connect result, which put "wait for their instructions" _before_
  the four appended blocks — a stop instruction the model read and then kept
  reading past. As the final block it is the last word, and it can react to what
  the blocks before it carried (which V8, having no filesystem, cannot see).

Skipped in small-model mode, where `ppal-context` has no `scope:memory` at all:
a small model could neither save what it learned nor record a decline, so it
would re-ask on every single connect forever.

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

## Layer discipline

Instructions for the model live in the shipped skills fragments
(`src/skills/fragments/context.ts`, the `context-standard` fragment; large-model
mode only — the `context-basic` fragment it ships alongside has no memory
instructions since the small-model tool surface excludes it).

**What goes where.** The split is by _how often the fact applies_, not by who it
is about:

- `global` — who this user is: musical style, preferences, how they want the
  assistant to work, high-level goals that outlive any one project.
- `project` — THIS Live Set: its genre, structure, the goals for this track.
- `memory` — durable facts and rules that only matter in CERTAIN situations
  (e.g. the sample folder they raid for jungle).

A fact that should ALWAYS apply belongs in context, and the skills say so
explicitly, because the failure mode is one-directional: memory is the layer the
assistant may write without asking, so every ambiguity resolves toward it unless
the text pushes back. An earlier version of this fragment listed "preferences,
how they want you to work, cross-project goals" as things to write to _memory_,
which contradicted the `global` description a few lines above it — and the model
duly filed everything in memory. Do not reintroduce that overlap.

**Writing the user's documents** (`project`/`global`), where a `write` REPLACES
the whole thing:

- **Only what the USER said, here.** Facts the assistant already holds — from
  its own memory, another tool, an earlier project — are not its to install. It
  must offer, name exactly what it would add, and write only on a yes. Without
  this, the empty-document exemption below reads as a license to migrate: a
  Claude Desktop session, on connecting, emptied its own memory of the user
  straight into their global context, including an unrelated VST side project
  they would never have put there. The exemption covers what the user _says_,
  not what the assistant _believes_.
- **Empty document** — write it, unasked, and say what was saved. The rule
  exists to stop a write from destroying existing content; an empty document has
  none, so the hazard doesn't exist. Past the opening exchange, `action:read`
  first, since the copy injected at connect can be stale. This exemption is what
  lets onboarding fill global context on the spot.
- **Non-empty document** — say what you'd add and wait for a yes. Once they
  agree (or asked in the first place), write immediately; don't ask twice, and
  don't fall back to memory as a way of avoiding the question.
- Carry the existing content forward. A write that doesn't is now refused rather
  than applied — see the clobber guard below.

**The clobber guard** (`clobberWarning` in `context-helpers.ts`). Instructions
are not a mechanism, so the destructive case is also blocked in code: a
`project`/`global` write whose content keeps NONE of the existing document is
skipped, and the model gets a `WARNING:` block plus the current document back,
so it can re-send a merged write. `force: true` overrides it — declared in
`context.def.ts` in every mode (a guard whose escape hatch is invisible to the
tier that hits it would deadlock the write) but deliberately absent from the
skills, so the model meets it in the warning rather than reaching for it.

Detection is line containment, both sides normalized (list marker stripped,
whitespace collapsed, trailing punctuation dropped) so a reformat _of a line_
survives — a restructuring that splits one line across several still fires,
since an existing line must land whole inside one incoming line — and only lines
of ≥ 8 _alphanumeric_ characters may vouch for a write — otherwise a `---` rule
or a `| --- | --- |` table separator would satisfy it for free.

That floor picks _which_ line vouches; it does not decide whether a document is
worth guarding. Applied unconditionally it would measure a document by its
_longest line_, which is the wrong measure — a twelve-line roster of short
entries (`- 124` / `- A min` / `- kick: t0` / `- drop: b33`, nothing over 7
alphanumerics) is a lot of accumulated context and would have had zero
protection, while one sentence of prose is fully covered. Shorthand is a note
style, not a signal that there is little to lose. So there is one rule: test
against the strongest lines the document _has_. When none clear the floor, any
line carrying letters or digits vouches instead — genuinely weaker, since short
needles match by coincidence (a write that discards that roster but says "in A
minor" satisfies the `- A min` needle), but far better than leaving those
documents unprotected. A document with a substantive line is unaffected. The
guard is inert on an empty document, on a blank write (the documented clear),
and on a document of pure structure with no letters or digits anywhere.

It applies to the TOOL path only. The webui/REST editors write through their own
routes, so the user may select-all-and-replace their own document freely; this
guards an LLM discarding content it never meant to touch, not the user's
editing. Automation that legitimately replaces a whole document through the tool
(the e2e round-trip, the eval seed/restore) passes `force`.

**Managing memory** (the assistant's own layer):

- The description is the only signal visible before a `read` — write it as a
  precise recall hook (what's inside, when it's relevant), not a vague label.
- Before writing, check the index for an entry that already covers it and reuse
  its name to update rather than duplicate. One fact per memory.
- **An existing entry overrides the layer rules.** If the fact already lives in
  a memory, update it THERE — don't write it to context and leave the memory
  contradicting it. Without this, the layer rules chain into a trap: a go-to
  synth is a cross-project preference, preferences belong in global context, and
  an empty global document may be written unasked — so the model writes "uses
  Vital" to global while the index still says Serum, forever. gpt-5.6-luna
  walked that exact chain in an eval and said so in its own reflection. Two
  layers disagreeing is worse than either layer being wrong.
- `delete` anything wrong or outdated rather than leaving stale entries. Convert
  relative dates ("next week") to absolute before storing.
- Save quietly as facts emerge; don't announce each one.

**Cross-provider durability.** The skills tell the assistant to put Producer Pal
facts in _these_ layers and never in a memory system of its own. External MCP
clients (Claude Desktop, LM Studio) increasingly ship their own memory, and a
preference stored there is invisible the moment the user opens the same music
with a different AI. Only `~/.producer-pal` and the Live Set travel with the
work.

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
  assistant writes or deletes mid-session appears without a manual refresh.

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

Reproducing a **failed** sidecar write by hand needs one non-obvious step. A
read-only project folder is not enough: while the upgrade-wipe question is still
open, an edit goes out as `isEdit: false`, Node declines to overwrite a
differing sidecar and returns `none`, and no write is attempted — so nothing
warns. Only a load echo carrying content settles that question (see Edit vs.
load), so save the Set _with_ project context in the box and reload the device
first, then make the folder read-only.
