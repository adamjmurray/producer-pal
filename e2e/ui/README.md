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
  and `**/update`; and seeds a "configured" Gemini text-chat provider in
  `localStorage` to skip the first-run settings screen.
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

Subagents (`subagent/subagent-test-helpers.ts`, scripted-LLM-backed) — the only
specs here that drive the chat path:

- `subagent/subagent-spawn.spec.ts` — a whole spawn: the card's three tiers, the
  briefing replacing the worker's `ppal-connect` (and the fallback when it
  fails), and the transcript reaching the UI and the conversation record but
  never the orchestrator's context.
- `subagent/subagent-resume.spec.ts` — `resumeFrom`: same worker number, a
  re-seeded session, and a card showing only what that run added.
- `subagent/subagent-rate-limit.spec.ts` — a worker's 429 backoff on its card.

### Subagent harness

`subagent-test-helpers.ts` stubs an OpenAI-compatible chat endpoint and points
the chat at the `custom` provider, whose base URL is a setting — so the route
matches this suite's own synthetic origin instead of a vendor host. A spec
passes a `respond(call)` function that answers every model request, worker
sessions included; `call.caller` says which session is asking (only the
orchestrator is offered `spawn_subagent`). The returned harness records every
model request and every `/subagent-briefing` request for assertions.

Settings modal (`settings/settings-test-helpers.ts`, localStorage-backed):

- `settings/presets.spec.ts` — the Presets tab: create → persists across reload
  → re-select, blank/duplicate-name rejection, delete, description edits, and
  the Subagent-preset picker. Presets write to localStorage on click rather than
  through the footer Save, so every assertion reads the stored list back.

  The live `../webui/settings.spec.ts` covers the save/restore round-trip that
  needs a real device; it never covered presets, so nothing moved here.

Context editor (`context/context-test-helpers.ts`, REST-backed) — the `/context`
app (Project | Global | Instructions | Skills | Memory tabs):

- `context/context-global-context.spec.ts` — global context: edit → save →
  reload persists; clear to empty persists.
- `context/context-memory.spec.ts` — memory: create → appears in the index →
  edit → delete.
- `context/context-instructions.spec.ts` — custom system prompt: customize →
  save → reload persists → reset restores the built-in.
- `context/context-skills.spec.ts` — skills fragment override: customize → edit
  → save → reload persists.

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
`setupSettingsTest` for the settings modal, or `setupContextTest` for the
`/context` editor, then drive the UI with role/test-id locators. Conversation
rows expose `data-testid="conversation-item"`; row actions use their accessible
labels (`Rename conversation`, `Delete conversation`, `Bookmark conversation` /
`Remove bookmark`, `Export conversation`).
