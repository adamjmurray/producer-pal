# Chat UI Architecture

## Overview

The Producer Pal chat interface is a self-contained web application that
provides an AI assistant for music composition in Ableton Live. Built with
Preact and Vite, it compiles to a single HTML file that's served from the MCP
server at `http://localhost:3350/chat` and opened in your system's default
browser.

**Why not embed in Max for Live?**

Initially, the UI was designed to be embedded using Max's jweb (webview) object.
However, a longstanding macOS issue makes this impractical: keypresses in jweb
are passed through to Ableton Live. For example, typing space in a text input
would also trigger Live's play/pause. This is a
[known issue](https://cycling74.com/forums/any-way-to-prevent-max-jweb-object-from-passing-all-keyboard-input-through-to-live)
with no timeline for a fix. The browser-based approach provides a better user
experience.

The UI connects to two external services:

1. **MCP Server** (localhost:3350) - Provides Live API tools and serves the UI
2. **AI Provider APIs** - Via the Vercel AI SDK (`ai` package + provider
   packages)

## Technology Stack

- **Framework**: Preact (lightweight React alternative)
- **Language**: TypeScript (.ts/.tsx source files)
- **Build Tool**: Vite with plugins
- **Styling**: Tailwind CSS
- **State Management**: React hooks + localStorage + IndexedDB
- **Testing**: Vitest + @testing-library/preact
- **API Integration**:
  - `ai` + `@ai-sdk/*` - Vercel AI SDK for all providers (Anthropic, Google,
    OpenAI, Mistral, OpenRouter, Ollama)
  - `@modelcontextprotocol/sdk` - MCP client for tool access
- **Markdown Rendering**: marked library

## Directory Structure

```
webui/
├── index.html              # Main entry point
├── tsconfig.json           # TypeScript configuration
└── src/
    ├── main.tsx            # Preact entry point, renders App
    ├── components/
    │   ├── App.tsx         # Root component; routes to ChatApp or VoiceApp
    │   ├── ChatApp.tsx     # Text-chat mode shell (wires the chat hooks)
    │   ├── chat/           # Chat interface components
    │   │   ├── ChatScreen.tsx
    │   │   ├── MessageList.tsx
    │   │   └── ...         # Message rendering components
    │   ├── voice/          # Voice-mode components
    │   │   ├── VoiceApp.tsx        # Voice mode shell
    │   │   ├── VoiceControls.tsx   # Talk/stop, voice picker, status
    │   │   └── VoiceTranscript.tsx # Read-only transcript (reuses MessageList)
    │   └── settings/       # Settings screen components
    ├── hooks/              # Custom React hooks (kebab-case)
    │   ├── chat/
    │   │   ├── use-chat.ts       # Core chat logic, streaming, retry
    │   │   └── ai-sdk-adapter.ts # Provider config + error handling
    │   ├── voice/
    │   │   ├── use-voice-mode-state.ts  # Orchestrates the voice hook graph
    │   │   ├── use-voice-session.ts     # OpenAI Realtime (WebRTC) backend
    │   │   ├── use-voice-persistence.ts # Voice conversation storage
    │   │   └── gemini/                  # Gemini Live (WebSocket) backend
    │   ├── settings/
    │   │   └── use-settings.ts   # Settings + localStorage
    │   └── ...
    ├── chat/               # Chat utilities (kebab-case)
    │   ├── sdk/
    │   │   ├── client.ts         # Wraps streamText(), processes events
    │   │   ├── formatter.ts      # Formats stream data for UI
    │   │   ├── mcp-tools.ts      # Converts MCP tools to AI SDK format
    │   │   ├── provider-factories.ts # Creates provider model instances
    │   │   ├── streaming/        # Stream part handlers, error signal
    │   │   └── subagent/         # spawn tool, briefing, session, rate limit
    │   └── helpers/              # Shared chat utilities
    └── utils/              # General utilities
```

## Key UI Components

**App.tsx** - Root component:

- Screen Management
  - Shows SettingsScreen if no API key saved
  - Otherwise routes by the selected model: **VoiceApp** for a realtime model
    (`isRealtimeSelection`), **ChatApp** otherwise — both get the same shared
    mode props and settings modal
  - Manages settings modal state
- State Management and Event Handling
  - Manages use of all hooks
  - Passes all state and callbacks to subcomponent props
- Data Flow
  ```
  App.tsx                          (owns shared, cross-mode state)
    ├─> useSettings()              → localStorage persistence
    ├─> useTheme()                 → dark/light mode
    ├─> useMcpConnection()         → MCP health check
    ├─> useViewState()             → panel/modal view state
    └─> routes to one mode shell:
          ├─> ChatApp → useChatModeState()
          │     ├─> useChat(aiSdkAdapter)     → chat state machine
          │     │     ├─> ChatSdkClient        → streamText() + processing
          │     │     └─> formatChatMessages() → UI-friendly format
          │     ├─> useConversationLock()     → provider lock during chat
          │     └─> useConversations()        → IndexedDB + panel state
          └─> VoiceApp → useVoiceModeState()  → see Voice Mode below
  ```

**ConversationPanel.tsx** - Slide-out sidebar:

- Toggled via history button in ChatHeader
- Lists saved conversations sorted by newest first
- Inline rename (click pencil → input field, Enter to save, Escape to cancel)
- Delete with confirmation
- Shows title (or formatted date/time when untitled)
- Highlights active conversation
- "New Conversation" button

**ChatScreen.tsx** - Main chat interface:

- Header with MCP status and settings
- MessageList (scrollable message history)
- ChatInput (user input form)
- Shows ChatStart when no messages

**MessageList.tsx** - Message rendering:

- Renders user and assistant messages
- Shows retry button next to assistant messages
- Handles scrolling and activity indicators

**Assistant Message Components** - Renders different message types:

- `AssistantText` - Markdown text with code highlighting
- `AssistantThought` - Collapsible thinking display
- `AssistantToolCall` - Tool name, args, and results
- `AssistantError` - Error messages

## State Management

### Hooks Pattern

The UI uses React hooks for all state management:

1. **useSettings** - Settings persistence (localStorage)
2. **useTheme** - Theme switching (localStorage + system preference)
3. **useMcpConnection** - MCP server health monitoring
4. **useChat** - Core chat logic and message streaming (provider-agnostic)
5. **useConversationLock** - Locks provider during active chat
6. **useConversations** - Conversation persistence (IndexedDB)

### useChat Hook

Central state machine for chat interactions (uses a `ChatAdapter` interface so
the underlying provider implementation is swappable):

**State:**

- `messages` - UI-formatted message history (`UIMessage[]`)
- `isAssistantResponding` - Loading state
- `activeModel/Thinking` - Locked settings during chat

**Operations:**

- `handleSend(message)` - Send user message, stream response
- `handleRetry(index)` - Retry from a specific message
- `clearConversation()` - Reset chat history
- `getChatHistory()` - Returns raw `ChatMessage[]` for persistence
- `restoreChatHistory(chatHistory)` - Loads saved history into state without
  creating an AI client (lazy — avoids MCP connection until next send)

### Message Queue

Users can keep sending while the AI is responding. `use-message-queue.ts` is a
small FIFO holding `QueuedMessage[]` (`enqueueMessage`, `removeMessage`,
`drainQueue`, `clearQueue`). It keeps both a `useState` array (for rendering the
faded queued bubbles) and a `useRef` mirror (`queueRef`) so the send loop can
read the queue **synchronously** mid-stream. The notable behaviors live in the
`handleSend` loop in `use-chat.ts`, not the hook:

- **Interrupt-on-new-message:** the loop snapshots
  `queueBaseline = queueRef.current.length` at send start and passes
  `shouldInterrupt = () => queueRef.current.length > queueBaseline` down to
  `client.sendMessage`. The SDK client checks it **between tool steps** and
  stops early, so enqueuing a message can cut a long tool-running turn short and
  get to the new input sooner. It triggers only on a _newly added_ message —
  comparing against the baseline, not "queue non-empty" — so a queue carried
  over from a prior failed turn doesn't self-interrupt the next send.
- **Drain-and-coalesce:** after a successful turn, `drainQueue()` returns all
  queued messages, which are joined with blank lines into a **single** next user
  turn (the first message's overrides apply to the merged turn).
- **Stop clears, failure keeps:** `stopResponse`/`clearConversation` call
  `clearQueue`; a _failed_ turn deliberately leaves the queue intact so the
  messages stay visible and flush on the next successful send.

A fork (edit/retry) does **not** drain or clear the queue — the queued messages
are the user's words and flush on the next normal send.

### Conversation Persistence

Conversations are persisted to IndexedDB so they survive page reloads. Covers
save, load, switch, rename, delete, and auto-titling. Forked conversations
(edit/retry branches) add `forkParentId`/`forkedAtIndex` linkage and a
sibling-navigation UI — see
[Conversation-Branching.md](./Conversation-Branching.md) for that model. The
`ConversationRecord` definition in `lib/conversation-db.ts` is the source of
truth for the full field list (the snippet below is illustrative, not
exhaustive).

**Storage**: IndexedDB via `idb` library. Database:
`producer-pal-conversations`, single `conversations` object store with
`updatedAt` index. Max 200 conversations (`MAX_CONVERSATIONS`); oldest
non-bookmarked conversations are auto-deleted on save when the limit is reached.

**Versioning**: IndexedDB is schemaless for record data, so adding a field to a
stored record needs no version bump — just default it when it's missing on read.
Only bump `DB_VERSION` for structural changes (creating or deleting an object
store or index). Prefer a backwards-compatible read over an upgrade-time data
transform.

**Schema** (`lib/conversation-db.ts`):

```typescript
interface ConversationRecord {
  id: string; // crypto.randomUUID()
  title: string | null; // null = auto-derived from first user message
  createdAt: number; // Date.now()
  updatedAt: number; // Date.now() at last save
  bookmarked: boolean; // protected from auto-deletion
  provider: string | null; // AI provider (e.g., "anthropic")
  model: string | null; // model ID
  modelLabel: string | null; // display name
  thinking: string | null; // thinking level (e.g., "High", "Off")
  messages: ChatMessage[]; // full history including toolCalls, toolResults, reasoning, responseModel
}
```

**Files**:

| File                                              | Purpose                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| `lib/conversation-db.ts`                          | Pure async DB functions + types (`ConversationRecord`, `ConversationSummary`) |
| `lib/conversation-db-helpers.ts`                  | DB open/upgrade, version mismatch handling, JSON export                       |
| `hooks/chat/use-conversations.ts`                 | Orchestration hook (save/load/switch/new/delete/rename)                       |
| `hooks/chat/helpers/use-conversations-helpers.ts` | Title derivation, URL hash, locked settings builders                          |
| `components/chat/ConversationPanel.tsx`           | Slide-out sidebar panel with inline rename                                    |

**Auto-save triggers** (wired in `App.tsx`):

- After each new message (watches `messages.length` increase)
- Before switching conversations
- On page unload (best-effort via `beforeunload`)
- NOT during streaming

**Auto-title**: Derived from first user message's first line. If that matches a
"connect to Ableton" pattern, uses the second user message instead. Manual
renames are preserved.

**Lazy record creation**: `activeConversationId` is null until first save, which
creates the record with a new UUID.

**Active conversation routing**: The active conversation ID is stored in the URL
hash (`#<conversation-id>`), enabling browser back/forward navigation between
conversations. On page load, the hash is read to restore the last conversation.

**View state persistence**: UI view state (history panel open/close, settings
open/close, active settings tab) is persisted to localStorage under a single
`producer_pal_view_state` key via the `useViewState` hook.

## Integration Details

**Health Checking:**

`useMcpConnection` hook checks server availability on mount and provides retry
functionality. Auto-retries on first message if connection failed initially.

### AI SDK Integration

**Streaming:**

The UI uses the Vercel AI SDK's `streamText()` to stream responses from any
supported provider:

```typescript
const result = streamText({ model, messages, tools, ... });
for await (const part of result.fullStream) {
  // Handle: text-delta, reasoning-delta, tool-call, tool-result, start-step
}
```

All providers (Anthropic, Google, OpenAI, Mistral, OpenRouter, Ollama) go
through this single code path via provider-specific model factories in
`provider-factories.ts`.

**Locked Settings:**

Provider, model, thinking level, small-model mode, the resolved system
instruction, notation, and the toolset (`enabledTools`) are locked per
conversation. When a conversation is saved, these settings are stored on the
`ConversationRecord`. When restored, they're passed as
`ConversationLockedSettings` to prevent settings changes from affecting the
active conversation.

Notation is hard-locked rather than re-read per init: it decides how clip notes
are PARSED, so a transcript written in one notation must keep being read in it.

The toolset is locked for the matching reason on the writing side: a transcript
full of successful calls to a tool is itself an instruction to keep calling it,
so withdrawing that tool mid-conversation invites a call the client can no
longer route. Records saved before the toolset was locked have none, and fall
back to the current selection.

The Direct Live API tool needs `withLiveApiTool` to make that lock hold. Its
Tools-tab checkbox writes no map entry — it flips the device-global
`liveApiEnabled`, which adds or removes the tool from the server's catalog — so
the flag is stamped into the map before it is locked. Every site that compares a
locked toolset against the current one must stamp BOTH sides, or a conversation
locked while the tool was off reports a divergence for the rest of its life.
Nothing enforces this. Two sites compare today — the header's tools indicator
and the Settings modal's locked-settings notice — and the notice shipped missing
the stamp, so treat a new comparison site as a place to get this wrong.

Per-message overrides (`MessageOverrides`) can still override thinking for
individual messages. When used, the overridden value is stamped on the assistant
`ChatMessage` as `thinkingOverride` — only when it differs from the conversation
default.

**Response Model Tracking:**

After each stream completes, `ai-sdk-client.ts` captures the `modelId` from the
API response metadata and stores it on the assistant `ChatMessage` as
`responseModel`. This persists to IndexedDB automatically (optional field, no
migration needed).

When the response model differs meaningfully from the requested model — after
normalizing org prefixes and date suffixes — `MessageList.tsx` shows a
"responded as {model}" label on the message bubble. This surfaces provider
routing surprises (e.g., OpenRouter fallbacks, Ollama aliases).

Mismatch detection logic is in `chat/helpers/model-identity.ts`. To test: use
OpenRouter with the `openrouter/auto` model, which auto-selects a model and
always triggers the mismatch indicator.

**Tool catalog vs. MCP catalog:**

`fullToolCatalog` (`lib/utils/tool-catalog.ts`) is every tool the user can
switch on: the MCP `listTools` response plus placeholders for any experimental
tool missing from it. Two are: `spawn_subagent` never appears (it's
client-side), and `ppal-live-api` only while the device flag is on —
deliberately, since `listTools` is what every MCP client offers its model, so a
withheld tool must not be listed.

The Tools tab and the header's `x/y` indicator both count against this catalog,
not the MCP response. That keeps the denominator still while the two opt-in
tools move, so the fraction means "how much of the full set am I running" — it
reads 21/23 out of the box, and the indicator's tooltip says why. Counting uses
`isToolEnabled`, since absent means enabled for ordinary tools but disabled for
`spawn_subagent`.

**Subagents:**

`spawn_subagent` is a client-side tool (no `ppal-` prefix, never in the MCP tool
list): it runs a nested `ChatSdkClient` in the browser, because a worker needs
the decrypted API key the server never sees. `buildWorkerConfig` clones the
orchestrator config — layering a chosen "Subagent preset" over it — and always
re-strips `spawn_subagent` as the recursion guard.

A worker's system instruction then gets a **briefing** appended: the Live Set
overview, the skills for its toolset and notation, and the user's context
layers, fetched once from `GET /subagent-briefing`
(`subagent/subagent-briefing.ts`). That replaces the `ppal-connect` call each
worker used to make, so `ppal-connect` and `ppal-context` are withheld from a
briefed worker. If the briefing can't be fetched, `ppal-connect` comes back and
the worker bootstraps itself as before; `ppal-context` stays withheld either
way, since it's withheld to keep parallel workers off the user's context store
rather than because the briefing replaced it — see Architecture.md → Subagent
briefings for why the blob belongs in the system prompt.

**Formatting:**

`formatter.ts` transforms the stream into UI-friendly format:

- Merges consecutive assistant messages into single UI messages
- Converts to typed parts: `text`, `thought`, `tool`, `error`
- Matches tool results to tool calls by ID
- Tracks original indices for retry functionality

## Voice Mode

Voice mode is a realtime speech-to-speech conversation with the model, reached
by selecting a realtime model (`App.tsx` routes to `VoiceApp` via
`isRealtimeSelection`). It reuses the chat conversation store, transcript
rendering, and MCP tools — only the transport and audio handling are new.

**Hook orchestration:** `use-voice-mode-state.ts` composes the whole voice hook
graph and picks the backend from the selected model, exposing a single
`UseVoiceSessionReturn` interface so `VoiceApp` is provider-agnostic:

```
VoiceApp.tsx
  └─> useVoiceModeState()                  → orchestrates + routes by provider
        ├─> useVoiceSession()              → OpenAI Realtime over WebRTC
        │     (@openai/agents SDK owns mic capture, VAD, playback)
        ├─> useGeminiVoiceSession()        → Gemini Live over WebSocket
        │     ├─> GeminiMicCapture         → getUserMedia → AudioWorklet → 16 kHz PCM
        │     ├─> GeminiPcmPlayer          → gapless 24 kHz PCM playback
        │     └─> GeminiHistoryBuilder     → WS deltas → RealtimeItem[]
        └─> useVoicePersistence()          → IndexedDB autosave (shared store)
```

**Two backends, one interface.** OpenAI leans on the `@openai/agents` Realtime
SDK (the SDK owns the audio path); Gemini Live is handled explicitly because the
WebSocket transport carries raw PCM — mic audio is captured through an
AudioWorklet and posted as 16 kHz PCM, and the model's 24 kHz PCM replies are
scheduled gaplessly by `GeminiPcmPlayer`. Both backends return the same shape so
the rest of voice mode doesn't branch on provider.

**Reused from chat:** voice history is converted to chat `UIMessage`s by
`realtime-items-to-ui-messages.ts` and rendered with the same `MessageList`;
conversations persist to the same IndexedDB store with a `sessionType: "voice"`
discriminant and use the shared `ConversationPanel`; MCP tools are dispatched
through `voice-mcp-call.ts` (a 30s-timeout wrapper that returns errors as text
rather than throwing), wrapped per provider by `realtime-mcp-tools.ts` (OpenAI)
and `gemini-mcp-tools.ts` (Gemini).

**Credentials** are minted/relayed by two server routes (`POST /voice-token`,
`POST /gemini-voice-token`) so the long-lived key stays off the browser for the
OpenAI path; see [Architecture.md](./Architecture.md#voice-mode) for the server
side.

## Build and Development

**Build:**

- Config: `config/vite.config.ts`
- Output: Single-file `max-for-live-device/chat-ui.html` (all assets inlined)
- Served at: `http://localhost:3350/chat`

**Commands:**

```bash
npm run ui:dev    # Dev server at localhost:5173 with hot reload
npm run ui:build  # Production build
npm run build     # Includes UI build
```

**Development workflow:**

- UI only: `npm run ui:dev` for hot reload at localhost:5173
- Full-stack: Run `npm run dev` (or `npm run build`) + `npm run ui:dev` in
  separate terminals
- Tests colocated with source (`.test.ts` / `.test.tsx`), run with `npm test`
- See `DEVELOPERS.md` for detailed workflow scenarios

**File naming:**

- React components: PascalCase (`ChatHeader.tsx`)
- Everything else: kebab-case (`use-chat.ts`)
- Never include file extensions in relative imports (bundled by Vite)

**Cursor conventions:**

- `<button>` and `<a>` elements: no cursor class (browser defaults are fine)
- Non-semantic clickable elements (`<label>`, `<div onClick>`): use
  `cursor-pointer`
- No `cursor-help` or other special cursors
