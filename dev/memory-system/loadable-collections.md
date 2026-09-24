# Loadable collections

The generic collection kit memory is built on, and the dormant custom-skills
collection. Part of the [memory system](README.md).

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
webui screen (`CustomSkillsScreen` / `CustomSkillEditor` +
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
