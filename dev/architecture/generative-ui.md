# Generative UI (3.0)

The 3.0 direction: users describe a Live app in chat, the AI builds it from an
empty canvas, and they keep changing it by talking. Apps read and write Live and
react to changes made in Live. Generators (a custom step sequencer),
transformers (rework existing clips) and analyzers (charts of clips across the
arrangement) are all just apps.

This doc states the target architecture. The prototype in the tree today covers
only part of it; see [Current prototype](#current-prototype).

## Shape

```
chat UI (host page)                                   Node (device)          Live
+--------------------------------------------+
| chat  |  app panel                         |
|       |  +------------------------------+  |
|       |  | sandboxed iframe (app)       |  |
|       |  |   ProducerPal SDK            |  |
|       |  +------------|-----------------+  |
|       |        bridge | postMessage       |  REST / SSE   +--------+   Live API
|       |  host --------+-------------------+-------------> | tools  | ---------> Set
|       |  (owns endpoints, credentials,    |               | write  |  remote
|       |   capabilities)                   |               |pipeline|  script
+--------------------------------------------+              +--------+  listeners
```

### Apps are untrusted code

An app is arbitrary HTML, CSS and JavaScript written by the AI. Don't limit it
to a component kit: ordinary DOM, CSS and JS must just work.

- It runs in a sandboxed iframe with its own opaque origin (no
  `allow-same-origin`), so it can't read the host page, its storage or its
  credentials.
- A restrictive CSP blocks network access (`connect-src 'none'` and the like).
  The design leaves room for an opt-in allowlist later, with user consent.
- The app never calls Producer Pal's REST endpoints itself. Everything goes
  through the bridge, which the host controls.

### The bridge

The host page and the app exchange `postMessage` requests and replies. The host
checks each request against the app's capabilities (which operations, which
targets) before calling Producer Pal, and rate-limits writes. One user gesture
(a drag across sixteen steps) should be one Live undo step.

### The `ProducerPal` SDK

A small, dependency-free JavaScript layer the app calls. It wraps the existing
tool operations: read, write, and subscribe to changes. It is a convenience
layer, not a second implementation of Live operations:

- Calls go to the existing tools, with their validation, addressing and the
  shared write pipeline (`runWrite`).
- TypeScript declarations and API docs are generated from the tool schemas where
  practical, so the SDK can't drift from the tools.
- An app calls the SDK directly. The LLM isn't involved in each interaction.

### App source, bindings and state

An app is three separate things:

- **Source**: the HTML/CSS/JS. Reusable across Sets.
- **Bindings**: which Live objects this copy works on (a clip, a track).
- **App state**: the app's own settings: layout, generator settings,
  preferences.

**Live state is not app state.** Clips, notes and device parameters live in Live
only. An app reads them and subscribes to them; it never keeps its own
persistent copy, so there are never two competing versions of a clip.

### Storage

- **The Set holds the authoritative copy** of each of its apps (source,
  bindings, app state). Sharing the Set shares its apps.
- **A Node-side personal library holds reusable templates.** Importing one makes
  a Set-specific copy. Nothing syncs automatically; publishing a change back to
  the library is an explicit step.

Generated source outgrows the current 24,000-character Song-data cap, so Set
storage needs chunking or another store. Song data adds no Live undo step but
also doesn't mark the Set as changed, so an app-only change can be lost on quit
without a prompt; that gap needs closing.

### Live → app

Subscriptions build on the remote script's listeners (`watches.py`), which
follow a clip object rather than a slot and report moves, deletes and changes.
Node polls the script every 300 ms. Keep that until a real app needs something
faster (a playhead, say); then optimize for that need.

### AI side

- Tools to create an app, read its source, edit it in place (so a revision
  doesn't rebuild from scratch), and set its bindings.
- **Runtime feedback**: an app's console errors and uncaught exceptions come
  back to the AI so it can fix its own app. Sanitize them first: no host
  credentials, tokens, endpoints or other host internals reach the model.
- A dedicated Skill teaches app building: the SDK, app lifecycle, subscriptions,
  and common pitfalls.

## MVP

An AI-generated step sequencer, built from scratch rather than from a hand-coded
widget. It must read and write a Live clip, react to edits made in Live, survive
save and reopen, and accept conversational changes ("make it 32 steps"). Nothing
in the platform may special-case it: it proves the general architecture.

Not needed for the MVP: a component library, chart libraries, full listener
coverage, fast push updates, arrangement-wide queries, separate windows or a Max
device view.

## Gating

Everything is behind the `ENABLE_GEN_UI` build flag until 3.0.0:

- Node: `isGenUiEnabled()` (compiled to `false` in release bundles) gates the
  tools, routes, watcher and storage.
- Remote script: only a gen-UI build embeds or installs `gen_ui_routes.py`,
  `watches.py` and `ui_widgets.py`; `routes.py` imports them only if present.
  The version bump ignores those files. The list lives in
  `src/mcp-server/rpc/remote-script/bundle/gen-ui-remote-script-files.ts`.
- Tests check the built release bundle has the gate compiled to `false`, and
  that a flag-off app starts no watcher, sync or remote-script request.

## Current prototype

What exists today, to be reused or replaced as the MVP needs:

- A hidden panel at `/chat?view=gen` with two fixed widget kinds (`clip`,
  `text`) and the `ppal-ui` tool. Fixed widgets don't fit the target; expect to
  replace them with the app host.
- SSE at `/api/ui/events` (`src/mcp-server/rpc/gen-ui/`).
- Remote-script clip listeners and Node's watcher (`live-watcher.ts`): a widget
  follows its clip through moves, goes "missing" for good when the clip is
  deleted or replaced, and re-binds after a reopen if the clip's name and length
  still match.
- Per-Set storage in Song data through the remote script (`ui_widgets.py`,
  `set-storage.ts`). Not a device parameter: every parameter write is a Live
  undo step, which trapped Cmd+Z.
