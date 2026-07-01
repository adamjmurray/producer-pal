# User Content Overrides (`~/.producer-pal`)

A global, user-authored **content** layer under `~/.producer-pal/`, read by the
Node-for-Max backend and folded into what the assistant sees. The v1.5 "make it
_your_ assistant" theme: global memory, then a custom system prompt, then skills
overrides.

> First deliverable: **global context** (persistent user facts across every
> project and session). The rest are sequenced fast-follows (see end).

## Corrected premise (read this first)

An earlier draft assumed runtime config was "in-memory and volatile, reset on
device reopen." **That was wrong.** The Max for Live device already persists its
scalar settings (port, timeout, small-model mode, Direct Live API, JSON output,
verbose logs) **and** the per-project context, and re-sends them to the server
on load. So there is nothing to "rescue" onto disk, and mirroring those settings
into a `config.json` would be redundant and confusing.

`~/.producer-pal/` is therefore **not** a settings mirror. It is a **global,
read-mostly content override/authoring layer**:

| Scope           | Source of truth                    | Examples                                             |
| --------------- | ---------------------------------- | ---------------------------------------------------- |
| Scalar settings | Max device (persists per instance) | port, small-model mode, notation toggle              |
| Per-project     | Max device "Context" tab           | facts about _this_ Live Set                          |
| **Global**      | **`~/.producer-pal/` files**       | facts across _all_ projects, prompt/skills overrides |

The device stays authoritative for settings + per-project context. The file
layer is the machine-global layer shared across every client (webui, Claude
Desktop, LM Studio) and every Live Set.

## Override-layer principles (apply to the later override features, not v1)

These govern the _override_ features (system prompt, skills) — where a built-in
default exists and the user replaces it. Global context (v1) is **additive**
(empty by default, nothing to override), so it sidesteps all of this. Captured
here so we design the later phases right.

1. **Never bulk-dump defaults to disk.** Writing a built-in default to
   `~/.producer-pal` converts it from "tracks upstream" into a **frozen fork** —
   the user then misses every future tuning of that content (the
   create-react-app "eject" trap). Skills are tuned every release, so this
   matters.
2. **A file exists only when the user has deliberately overridden that slot.**
   Empty folder ⇒ everything uses the latest built-ins.
3. **The editor is discoverability, not a dump.** The webui markdown editor
   lists every override slot pre-populated with the _current_ built-in (fetched
   live from the backend). Save writes an override file for that one slot;
   "reset to default" deletes it.
4. **Upgrade path, three cases:**
   - _Uncustomized_ (no file) → auto-tracks upstream. Zero work. The majority.
   - _Customized_ (file present) → frozen by choice, but always reconcilable:
     the built-in ships in code, so the editor can always diff "yours │ current
     built-in" and offer reset/re-fork.
   - _Proactive "the default changed since you forked" nudge_ → the only case
     needing stored provenance (fork-time version/hash in `.md` frontmatter or a
     manifest). Deferrable; case 2 already lets a user find drift manually.
5. **Override slot names are a public contract.** Renaming/splitting a built-in
   fragment orphans a user's override keyed to the old name. So keep the slot
   set **small, coarse, and stable**; the `buildSkills` fragment names become
   that API. Unknown override files are ignored with a visible "inactive" note.
6. **Overrides are applied backend-side.** Node-for-Max reads the files; the
   browser can't touch the filesystem, so the webui receives content over HTTP.

## v1: Global context

Additive, global user facts injected into every assistant session. No built-in
default, so **no frontmatter/provenance and none of the override machinery** —
this is deliberately the simplest starting point.

- **File:** `~/.producer-pal/context.md` (single markdown file, hand-editable).
  Name is bikeshed-able.
- **Coexists with per-project context.** The device's per-project
  `memoryContent` is unchanged; global context is a **distinct,
  separately-labeled** field so the model can tell "applies across all projects"
  from "this session."

### Phase 1 — storage + inject into `ppal-connect` (filesystem only)

- A backend module (`global-context-store` in `src/mcp-server/`) that
  reads/writes `~/.producer-pal/context.md`: dir resolution with a
  `PRODUCER_PAL_CONFIG_DIR`-style override, missing-file → empty, atomic
  temp+rename write, and inert under Vitest so unit tests never touch the real
  home dir. (These IO patterns are the one reusable idea from the abandoned
  config-storage pass; re-authored here for a single markdown file.)
- **Inject on the node side, into the `ppal-connect` response.** V8 `connect`
  ([connect.ts](../../src/tools/core/connect.ts)) keeps returning per-project
  `memoryContent` from `context.memory.content` (V8 has no `fs`). A
  `withGlobalContext` wrapper around `callLiveApi`
  ([global-context-inject.ts](../../src/mcp-server/helpers/global-context-inject.ts),
  wired into both the MCP and REST paths in
  [create-express-app.ts](../../src/mcp-server/create-express-app.ts)) — for a
  successful `ppal-connect` result only — **appends** the file contents as a
  distinct, clearly-labeled extra content block. (Appending, not mutating the
  result body: the V8 result is compact-serialized, not plain JSON, so a second
  labeled block is the robust, format-agnostic seam — the same mechanism the
  `WARNING:` relay already uses.) This is the only path that reaches
  **external** clients (Claude Desktop, LM Studio), which see context solely
  through the connect tool result. Same seam the later skills/prompt overrides
  reuse.
- The appended block names both scopes ("applies across ALL projects … distinct
  from this Live Set's per-project context") so the model can tell them apart.

#### Phase 1b — open the config folder

A convenience to reveal `~/.producer-pal` in Finder/Explorer. Shipped `src/`
code is barred from shelling out (eslint `no-restricted-imports` on
`child_process`), so Node can't `open`/`explorer` the folder itself. Instead the
work is split:

- **Node**
  ([reveal-config-dir.ts](../../src/mcp-server/helpers/reveal-config-dir.ts)):
  on an `openConfigFolder` device message, resolves the home dir (Max can't
  cross-platform), `mkdir -p`s it so the folder always exists, and emits it back
  as a `pathToFileURL` `file://` URL (correctly encodes spaces / Windows paths).
- **Patch:** a Setup-tab button sends `openConfigFolder` to the `node.script`
  inlet; the returned `openConfigFolder <fileUrl>` from its outlet drives a
  `; max launchbrowser <fileUrl>` message, which opens the folder in the native
  file browser.

### Phase 2 — webui editor

A global-context editor reusing the project-context editor component, backed by
`GET`/`PUT /global-context` (backend reads/writes the file). Establishes the
multi-document editor UX that the system-prompt phase builds on.

### Phase 3 — `ppal-context` read/write

Let the assistant read and update global context ("remember that I…"). Needs a
V8→node write bridge (`ppal-context` runs in V8, no `fs`) — the same node-side
`ppal-context` handling the custom-skills phase will want.

## Fast-follows (sequenced, not now)

1. **Custom system prompt** (webui chat) — **SHIPPED**
   (`~/.producer-pal/system-prompt.md`). Decisions: **full-replace** (non-blank
   content wholly replaces the built-in `SYSTEM_INSTRUCTION`; blank = default),
   **global** scope, and a new **"Instructions" tab** in the Context editor.
   Text chat only — voice keeps its own instructions. The system prompt is a
   client-side constant consumed as the `system` param (not the ppal-connect
   skills blob), so this needs no V8→node bridge and no assistant tool: backend
   `/system-prompt` GET/PUT + `useSystemPromptMemory`, threaded through
   `buildConfig` and locked at client init. Note: full-replace did **not** end
   up needing frontmatter/provenance — the built-in ships in the bundle, so
   Clear reverts to it and the editor can always diff against it; the "default
   changed since you forked" nudge stays deferred. This work also extracted the
   reusable `config-markdown-store` + `config-markdown-route` factory
   (named-slot fs + REST) that #2/#3 build on.
2. **Override the built-in `ppal-connect` skills** — user `.md` replaces a
   built-in `buildSkills` fragment (core, notation sub-skills, …). Plugs
   straight into the 574 assembler. This is the first **true** replace of
   release-tuned content, so it's where frontmatter/provenance finally lands.
3. **Custom / disable-able skills** loaded on-demand by `ppal-context`
   (node-for-max side).

**Deferred / punted:** tool/arg description overrides (punt — rely on the skill
system instead); named presets / "personas" (dynamic toolsets can't safely
change mid-session for external clients like Claude Desktop — likely a webui
feature on the existing webui persistence, TBD); custom workflows (later
discussion).

## Test plan (phase 1)

- `global-context-store` unit tests: round-trip read/write, missing file →
  empty, atomic write, Vitest-inert without the dir override.
- `callLiveApi` wrapper: `ppal-connect` result gains `globalContext` from the
  file; non-connect results pass through untouched; empty/absent file yields no
  `globalContext` (or an empty one, TBD).
- `connect` unchanged: still returns per-project `memoryContent` from V8.
