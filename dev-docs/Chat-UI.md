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
2. **Gemini API** (ai.google.dev) - Provides AI chat with automatic tool calling

## Technology Stack

- **Framework**: Preact (lightweight React alternative)
- **Language**: TypeScript (.ts/.tsx source files)
- **Build Tool**: Vite with plugins
- **Styling**: Tailwind CSS
- **State Management**: React hooks + localStorage
- **Testing**: Vitest + @testing-library/preact
- **API Integration**:
  - `@google/genai` - Gemini API client
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
    │   ├── use-gemini-chat.ts    # Core chat logic and streaming
    │   ├── use-settings.ts       # Settings + localStorage
    │   └── ...
    ├── chat/               # Chat utilities (kebab-case)
    │   ├── gemini-client.ts      # Gemini API + MCP tool integration
    │   └── gemini-formatter.ts   # Formats raw API data for UI
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
    ├─> useSettings()         → localStorage persistence
    ├─> useTheme()            → dark/light mode
    ├─> useMcpConnection()    → MCP health check
    └─> useGeminiChat()       → chat state machine
          ├─> GeminiClient    → Gemini API + MCP tools
          └─> formatGeminiMessages() → UI-friendly format
  ```

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
4. **useGeminiChat** - Core chat logic and message streaming

### useGeminiChat Hook

Central state machine for chat interactions:

**State:**

- `messages` - UI-formatted message history
- `isAssistantResponding` - Loading state
- `activeModel/Thinking/Temperature` - Locked settings during chat

**Operations:**

- `handleSend(message)` - Send user message, stream response
- `handleRetry(index)` - Retry from a specific message
- `clearConversation()` - Reset chat history

## Integration Details

**Health Checking:**

`useMcpConnection` hook checks server availability on mount and provides retry
functionality. Auto-retries on first message if connection failed initially.

### Gemini API Integration

**Streaming:**

The UI uses Gemini's streaming API to show real-time responses:

```javascript
const stream = await chat.sendMessageStream({ message });
for await (const chunk of stream) {
  // Update UI with each chunk
  const { role, parts } = chunk.candidates[0].content;
  // Merge consecutive text, track tool calls, etc.
}
```

**Formatting:**

`gemini-formatter.js` transforms this into UI-friendly format:

- Merges consecutive model messages
- Integrates functionResponse into corresponding functionCall
- Converts to typed parts: `text`, `thought`, `tool`, `error`
- Tracks original indices for retry functionality

## Build and Development

**Build:**

- Config: `config/vite.config.mjs`
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
- Everything else: kebab-case (`use-gemini-chat.ts`)
- Always include `.js` extensions in imports (TypeScript compiled to JS)
