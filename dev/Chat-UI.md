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
    │   ├── App.tsx         # Root component, manages screens
    │   ├── chat/           # Chat interface components
    │   │   ├── ChatScreen.tsx
    │   │   ├── MessageList.tsx
    │   │   └── ...         # Message rendering components
    │   └── settings/       # Settings screen components
    ├── hooks/              # Custom React hooks (kebab-case)
    │   ├── chat/
    │   │   ├── use-chat.ts       # Core chat logic, streaming, retry
    │   │   └── ai-sdk-adapter.ts # Provider config + error handling
    │   ├── settings/
    │   │   └── use-settings.ts   # Settings + localStorage
    │   └── ...
    ├── chat/               # Chat utilities (kebab-case)
    │   ├── ai-sdk/
    │   │   ├── ai-sdk-client.ts  # Wraps streamText(), processes events
    │   │   ├── formatter.ts      # Formats stream data for UI
    │   │   ├── mcp-tools.ts      # Converts MCP tools to AI SDK format
    │   │   └── provider-factories.ts # Creates provider model instances
    │   └── helpers/              # Shared chat utilities
    └── utils/              # General utilities
```

## Key UI Components

**App.tsx** - Root component:

- Screen Management
  - Shows SettingsScreen if no API key saved
  - Otherwise shows ChatScreen
  - Manages settings modal state
- State Management and Event Handling
  - Manages use of all hooks
  - Passes all state and callbacks to subcomponent props
- Data Flow
  ```
  App.tsx
    ├─> useSettings()              → localStorage persistence
    ├─> useTheme()                 → dark/light mode
    ├─> useMcpConnection()         → MCP health check
    ├─> useChat(aiSdkAdapter)      → chat state machine
    │     ├─> AiSdkClient          → streamText() + stream processing
    │     └─> formatAiSdkMessages()→ UI-friendly format
    ├─> useConversationLock()      → provider lock during chat
    └─> useConversations()         → IndexedDB persistence + panel state
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
- `activeModel/Thinking/Temperature` - Locked settings during chat

**Operations:**

- `handleSend(message)` - Send user message, stream response
- `handleRetry(index)` - Retry from a specific message
- `clearConversation()` - Reset chat history
- `getChatHistory()` - Returns raw `AiSdkMessage[]` for persistence
- `restoreChatHistory(chatHistory)` - Loads saved history into state without
  creating an AI client (lazy — avoids MCP connection until next send)

### Conversation Persistence

Conversations are persisted to IndexedDB so they survive page reloads. Covers
save, load, switch, rename, delete, and auto-titling.

**Storage**: IndexedDB via `idb` library. Database:
`producer-pal-conversations`, single `conversations` object store with
`updatedAt` index. Max 200 conversations (`MAX_CONVERSATIONS`); oldest
non-bookmarked conversations are auto-deleted on save when the limit is reached.

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
  messages: AiSdkMessage[]; // full history including toolCalls, toolResults, reasoning
}
```

**Files**:

| File                                    | Purpose                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `lib/conversation-db.ts`                | Pure async DB functions + types (`ConversationRecord`, `ConversationSummary`) |
| `lib/conversation-db-helpers.ts`        | DB open/upgrade, version mismatch handling, JSON export                       |
| `hooks/chat/use-conversations.ts`       | Orchestration hook (save/load/switch/new/delete/rename)                       |
| `components/chat/ConversationPanel.tsx` | Slide-out sidebar panel with inline rename                                    |

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

**Formatting:**

`formatter.ts` transforms the stream into UI-friendly format:

- Merges consecutive assistant messages into single UI messages
- Converts to typed parts: `text`, `thought`, `tool`, `error`
- Matches tool results to tool calls by ID
- Tracks original indices for retry functionality

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
- Full-stack: Run `npm run dev` + `npm run ui:dev` in separate terminals
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
