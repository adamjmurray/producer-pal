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

## Parts

| File                                                       | What's in it                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------- |
| [conversation-persistence.md](conversation-persistence.md) | IndexedDB store, schema, auto-save, auto-title, restore fixes |
| [conversation-branching.md](conversation-branching.md)     | Edit/retry forks, sibling navigation, branch families         |
| [ai-sdk-integration.md](ai-sdk-integration.md)             | Streaming, locked settings, tool catalog, subagents           |
| [voice-mode.md](voice-mode.md)                             | Realtime voice: hook graph, OpenAI and Gemini backends        |

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
          └─> VoiceApp → useVoiceModeState()  → see [Voice Mode](voice-mode.md)
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
- The composer is first in the DOM and put back below the transcript with CSS
  `order`, so Tab reaches it without walking every message's buttons

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

### Image Attachments

Users attach images to a message by pasting, dropping them on the editor, or
picking them with the attach button (`useImageAttachments` +
`utils/image-attachments.ts`; paste and drag are intercepted in the CAPTURE
phase on a wrapper around the editor, so CodeMirror never inserts the file).
They ride on `ChatMessage.images` as base64, reach the model as AI SDK image
parts ahead of the text (`buildModelMessages`), render as thumbnails in the user
bubble (`UserImages`), and persist with the conversation like any other message
field. A message may be images with no text at all, so both the send path and
the composer treat attachments as content. A paste with both images and text
lets the editor paste the text. Excel, Word and OneNote add a picture of the
copied content, so when the clipboard's HTML holds text, the picture is skipped;
HTML that is only an image (a browser's Copy Image) still attaches it.

Anything over 1568 px on its longest side is scaled down to that in the browser
(canvas redraw, re-encoded as the same type) before it's read to base64. GIFs
are left alone so animation survives, and the 5 MB cap applies to what scaling
produced — a 12 MB screenshot attaches fine. Send is disabled while an image is
still being read, so it can't miss the message it was meant for.

Every turn re-sends the images in its history, so one request carries at most
`MAX_REQUEST_IMAGE_BYTES` (15 MB of base64, under Gemini's 20 MB request cap)
and `MAX_REQUEST_IMAGES` (20; 8 for Mistral, its API limit). The newest
messages' images fill it; every image past whichever limit is hit first, even
one in the newest message, goes out as a short text note instead, so a long chat
with screenshots keeps working. The composer still allows 10 images per message,
so on Mistral any past the eighth in one message go out as the note.

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

Conversations are saved to IndexedDB so they survive page reloads. See
[conversation-persistence.md](conversation-persistence.md) for the store,
auto-save, and restore details, and
[conversation-branching.md](conversation-branching.md) for edit/retry forks.

## Integration Details

Health checking, streaming, locked settings, the tool catalog, and subagents are
in [ai-sdk-integration.md](ai-sdk-integration.md).

## Voice Mode

Realtime speech-to-speech conversation, reached by selecting a realtime model.
See [voice-mode.md](voice-mode.md).

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
