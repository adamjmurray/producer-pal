# Codebase Extraction

Exploring feasibility of extracting two pieces of Producer Pal into standalone
projects:

1. **Live API package** — reusable npm module for TypeScript Max for Live
   developers
2. **Chat UI** — standalone general-purpose MCP-native chat app in its own repo

Related: [Ecosystem plan](Ecosystem.md) — the Live API package is one of the
"shared libraries" referenced there.

---

## 1. Live API npm Package

### What's extractable

Three clean layers with increasing coupling:

| Layer             | Files                                              | Lines | Dependencies          |
| ----------------- | -------------------------------------------------- | ----- | --------------------- |
| Path builders     | `live-api-path-builders.ts`                        | ~160  | Zero                  |
| Type declarations | `live-api.d.ts`, `live-object-types.ts`            | ~170  | Path builders (types) |
| Extensions        | `live-api-extensions.ts`, `live-api-path-utils.ts` | ~366  | Path builders only    |

### Scope: all three layers

The **extensions are the main value add**. Raw `LiveAPI` in Max for Live
requires `.get("property")?.[0]` calls, manual path string construction, and no
type safety. The extensions provide a sane developer experience:
`api.getProperty("tempo")`, `api.exists()`, `api.trackIndex`,
`LiveAPI.from(livePath.track(0))`, etc.

The prototype-patching pattern is natural in Max's V8 environment where
`LiveAPI` is a runtime-provided global. This isn't a Node.js library — it's
tooling for a specific runtime where this IS the idiomatic approach. Consumers
who don't want the opinions can use just the path builders and types.

The package would include:

- **Path builders** — type-safe path construction
  (`livePath.track(0).device(1)`)
- **Type declarations** — full `LiveAPI` class types + `LiveObjectType` union
- **Extensions** — convenience methods on `LiveAPI.prototype` (auto-applied on
  import, guarded by `typeof LiveAPI !== "undefined"`)
- **Path utils** — `parseIdOrPath` for flexible ID/path input handling

The mock (`mock-live-api.ts` + helpers) is too coupled to vitest and Producer
Pal's test registry to ship as-is. Could be revisited later as a separate
`/testing` export.

### Open questions

- **License**: Producer Pal is GPL-3.0. A reusable utility package would benefit
  from MIT/Apache-2.0. Worth relicensing the extracted subset?
- **Package name**: Something like `live-api-tools`, `max-live-api`,
  `ableton-live-api`?
- **Mock/testing story**: Consumers can't test against real LiveAPI outside Max.
  Ship a basic mock later, or leave that to consumers?
- **Documentation**: The extensions need good docs since Max for Live TS
  developers are a niche audience who may not discover the package otherwise.

### Effort & risk

- **Effort**: ~1 day (path builders + types + extensions + tests + package
  setup)
- **Risk**: Low — all layers depend only on each other, clean internal
  dependency chain
- **Maintenance**: Minimal — this code is stable

---

## 2. Chat UI → Separate Repo

### Current coupling to Producer Pal

Remarkably thin. Only **~10 files** have Producer Pal-specific content:

- **System instruction** — "AI music composition assistant" (5 lines)
- **MCP defaults** — port 3350, `ppal-connect` always-on
- **Branding** — title, logo SVG, settings screen text
- **Version/update** — 2 imports from `#src/shared/version`, GitHub releases URL
- **Docs URL** — `producer-pal.org`
- **Storage keys** — `producer_pal_` prefix
- **Tool grouping** — hard-coded `ppal-*` tool names

Everything else (~183 source files, ~27k LOC) is fully generic.

### App shape, not library shape

The chat UI is 193 files / ~28k LOC with its own build pipeline, IndexedDB
storage, and a distinctive single-file HTML output. This is an **application**,
not a component library. Trying to package it as `<ChatApp config={...} />`
would fight against its architecture.

**Recommended approach: config-file model.** A single `chat-config.ts` file that
customizers edit:

```typescript
export const config = {
  appName: "My Chat App",
  systemInstruction: "...",
  logoUrl: "./assets/logo.svg",
  docsUrl: "https://...",
  defaultMcpPort: 5000,
  version: "1.0.0",
  updateCheck: { githubRepo: "owner/repo" },
  storageKeyPrefix: "my_chat_",
};
```

The ~10 Producer Pal-specific files import from this config instead of
hard-coding.

### How Producer Pal consumes it

**Git subtree** is the pragmatic choice. Producer Pal adds the chat UI repo as a
subtree at `webui/`, maintains its own `chat-config.ts`, and pulls upstream
changes. Simpler than npm dependency management for a full application.

### Single-file HTML as a feature

The `vite-plugin-singlefile` build producing a self-contained `chat-ui.html` is
genuinely distinctive. Most chat UIs require a server or complex deployment.
This should remain a first-class build target, with standard chunked web
deployment as an alternative mode.

### What makes this compelling as a standalone project

- Multi-provider LLM support (Anthropic, Google, OpenAI, Mistral, OpenRouter,
  local/Ollama)
- MCP-native — connects to any MCP server, displays tool calls/results
- Single-file HTML output (unique deployment model)
- IndexedDB conversations (works offline, no backend needed)
- Tool toggle UI
- Mature — ~28k LOC, well-tested

The MCP ecosystem is growing and a lightweight, self-contained MCP chat client
could fill a real gap.

### Open questions

- **Naming**: Needs its own identity. Something signaling "MCP-native chat
  client" without referencing Producer Pal.
- **Will it diverge?** If the chat UI evolves in music-specific directions
  (Ableton connection UI, audio-specific tool displays), the standalone version
  diverges and sync becomes painful.
- **Community viability**: Is there enough interest in a standalone MCP chat
  client to justify maintaining a separate project?

### Effort & risk

- **Effort**: ~1 day to refactor to config module in-place, ~2-3 days for full
  extraction
- **Risk**: Low technically, moderate strategically (maintenance of two repos)

---

## Recommended Sequence

1. **Now (in-place)**: Refactor the ~10 webui files to import from a
   `chat-config.ts` module. Valuable regardless of extraction — makes coupling
   explicit. ~1 day.

2. **Next**: Extract Live API package (path builders + types + extensions). ~1
   day.

3. **Then (conditional)**: If the config refactoring goes well and the
   standalone chat app concept has legs, extract to a separate repo via git
   subtree. ~2 days.

Step 1 is a prerequisite for step 3 but independent of step 2. Steps 1 and 2 are
both low-risk and valuable in isolation.
