# Chat UI Playwright Tests (stubbed, CI)

CI-runnable end-to-end tests for the built-in Producer Pal chat UI. Unlike the
live suite in [`../webui`](../webui), these need **no Ableton and no API keys**
— the MCP backend, the `/config` poll, and the GitHub update check are all
stubbed client-side with Playwright route fulfillment, and the built single-file
UI is served the same way (no static server process).

This makes them deterministic and fast, so they run in CI and cover the dynamic
Preact UI without touching the LLM/chat path.

## Running Tests

```bash
# Build the UI and run the stubbed suite headless (also runs in CI)
npm run ui:test

# Same, but open the Playwright UI for debugging
npm run ui:test:dev
```

`ui:test` builds the chat UI first (`npm run ui:build`), so it always tests the
current source.

## How it works

`ui-test-helpers.ts` provides:

- **`installStubs(page)`** — fulfills the document (`**/chat-ui.html` →
  `max-for-live-device/chat-ui.html`), `**/mcp` (a minimal JSON-RPC
  `initialize`/`tools/list` stub so the status reads "connected"), `**/config`,
  and `https://api.github.com/**`; and seeds a "configured" Gemini text-chat
  provider in `localStorage` to skip the first-run settings screen.
- **`seedConversations(page, records)`** — writes fixture records into the
  `producer-pal-conversations` IndexedDB store.
- **`readConversationsFromDb(page)`** — reads them back to assert persistence.
- **`setupUiTest(page, records)`** — does all of the above, loads the UI, and
  opens the history panel.

## Test Files

Chat UI (`ui-test-helpers.ts`, IndexedDB-backed):

- `conversation-crud.spec.ts` — conversation history: list/order, load messages,
  rename, star/unstar, delete (all backed by assertions against IndexedDB).
- `conversation-branching.spec.ts`, `assistant-markdown.spec.ts` — edit/retry
  forks and assistant markdown rendering.

Context editor (`context-test-helpers.ts`, REST-backed) — the `/context` app
(Project | Global | Instructions | Skills | Memory tabs):

- `context-global-context.spec.ts` — global context: edit → save → reload
  persists; clear to empty persists.
- `context-memory.spec.ts` — memory: create → appears in the index → edit →
  delete.
- `context-instructions.spec.ts` — custom system prompt: customize → save →
  reload persists → reset restores the built-in.
- `context-skills.spec.ts` — skills fragment override: customize → edit → save →
  reload persists.

### Context editor harness

`context-test-helpers.ts` fulfils the five REST endpoints the `/context` app
uses (`/config`, `/global-context`, `/system-prompt`, `/skill-overrides`,
`/memory`) with a small **stateful** in-memory backend, so a GET reflects the
latest write and "edit → save → reload persists" is a real assertion (unlike the
chat UI, whose state lives client-side in IndexedDB).

- **`setupContextTest(page, overrides?)`** — install the stubs, load `/context`,
  and return the mutable `ContextBackend`. Read it back (e.g.
  `expect.poll(() => state.globalContext)`) to assert the REST round-trip
  landed.
- **`openContextTab(page, label)`** — switch tabs (`Project` … `Memory`).
- **`primaryEditor` / `typeInPrimaryEditor` / `customizeOverride`** — drive the
  CodeMirror editors (which need real keystrokes, not `fill()`) and the
  Instructions / Skills "Customize" override flow.

## Adding tests

Use `setupUiTest` for the chat "configured app + seeded history" starting point,
or `setupContextTest` for the `/context` editor, then drive the UI with
role/test-id locators. Conversation rows expose
`data-testid="conversation-item"`; row actions use their accessible labels
(`Rename conversation`, `Delete conversation`, `Bookmark conversation` /
`Remove bookmark`, `Export conversation`).
