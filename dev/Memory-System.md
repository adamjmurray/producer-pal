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

The tool that reads and writes all three layers — scopes, action verbs, the
project-context on-disk backup, and small-model mode — is documented in
[memory-system/ppal-context-tool.md](memory-system/ppal-context-tool.md).

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
