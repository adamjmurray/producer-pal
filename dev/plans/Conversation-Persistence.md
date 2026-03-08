# Conversation Persistence

Persist chat conversations to the browser's IndexedDB. Support multiple
conversations, switching between them, manual renaming, and JSON export/import
with backward compatibility.

## Why

Conversations are currently 100% ephemeral — lost on page reload. The AI SDK
gives us a consistent `AiSdkMessage` format across all providers, which is flat,
JSON-serializable, and already the canonical source for both API calls
(`buildModelMessages`) and UI rendering (`formatAiSdkMessages`). This makes it a
natural persistence target.

## Storage

**Library**: [`idb`](https://github.com/jakearchibald/idb) — tiny (~1KB)
promise-based IndexedDB wrapper

**Database**: `producer_pal_conversations`, version 1

**Object store**: `conversations` (keyPath: `id`)

**Indexes**: `updatedAt` (for list sorting), `createdAt`

### Schema

```typescript
// webui/src/types/conversations.ts

interface ConversationRecord {
  id: string; // crypto.randomUUID()
  schemaVersion: 1; // per-record, for export/import forward-compat
  title: string | null; // null = untitled, user renames manually
  createdAt: number; // Date.now()
  updatedAt: number; // Date.now() at last save
  provider: Provider;
  model: string;
  chatHistory: AiSdkMessage[];
}

// For list display (no chatHistory — keeps list queries fast)
interface ConversationListItem {
  id: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
  provider: Provider;
  model: string;
}
```

### Why AiSdkMessage

- Already flat and JSON-serializable (no functions, promises, circular refs)
- Provider-agnostic — same shape regardless of Anthropic, OpenAI, Gemini, etc.
- Can reconstruct `ModelMessage[]` for API continuation via `buildModelMessages`
- Can reconstruct `UIMessage[]` for rendering via `formatAiSdkMessages`
- No derived data stored — `UIMessage` is always re-derived on load

## Export/Import Format

```typescript
interface ConversationExport {
  exportVersion: 1;
  exportedAt: string; // ISO 8601
  application: "producer-pal";
  conversations: ConversationRecord[];
}
```

**Forward compatibility**:

- `schemaVersion` is per-record so exported files are self-describing
- Import ignores unknown fields (tolerant reader)
- Import rejects records with `schemaVersion` higher than what the current code
  handles, with a clear error message
- Upserts by `id` to avoid duplicates on re-import

**Mechanics**: Export downloads as JSON via Blob URL + anchor click. Import uses
a file input, validates structure, shows count of imported conversations.

## Auto-Save Strategy

- **After each completed assistant turn**: watch `isAssistantResponding`
  transition true→false, save if messages exist
- **Before switching conversations**: save current before loading the new one
- **On page unload**: `beforeunload` listener attempts a final save
- **NOT during streaming**: history is inconsistent mid-turn
- **No empty conversations**: don't create a record until first exchange
  completes
- **Lazy record creation**: `currentConversationId` is null until first save,
  which creates the `ConversationRecord` with a new UUID

## New Files

```
webui/src/
├── types/
│   └── conversations.ts                      ConversationRecord, ListItem, Export types
├── hooks/
│   └── conversations/
│       ├── conversation-db.ts                pure async DB functions (openDb, CRUD)
│       ├── conversation-db.test.ts
│       ├── conversation-export.ts            export/import helpers
│       ├── conversation-export.test.ts
│       ├── use-conversation-manager.ts       orchestration hook
│       └── use-conversation-manager.test.ts
└── components/
    └── chat/
        ├── ConversationPanel.tsx              slide-out panel
        └── ConversationPanel.test.tsx
```

## DB Layer — `conversation-db.ts`

Pure async functions (not a hook). Uses lazy DB open (cached module-level
promise):

```typescript
openConversationDb(): Promise<IDBPDatabase>
saveConversation(record: ConversationRecord): Promise<void>
loadConversation(id: string): Promise<ConversationRecord | undefined>
deleteConversation(id: string): Promise<void>
listConversations(): Promise<ConversationListItem[]>  // updatedAt desc, no chatHistory
```

`listConversations` uses a cursor on the `updatedAt` index (descending) and
projects only metadata fields, excluding `chatHistory` for performance.

## Conversation Manager Hook — `use-conversation-manager.ts`

Orchestrates between the DB layer and the chat state:

```typescript
interface UseConversationManagerReturn {
  currentConversationId: string | null;
  conversations: ConversationListItem[];
  isPanelOpen: boolean;

  togglePanel(): void;
  newConversation(): void;
  switchConversation(id: string): Promise<void>;
  deleteConversation(id: string): Promise<void>;
  renameConversation(id: string, title: string): Promise<void>;
  saveCurrentConversation(
    history: AiSdkMessage[],
    provider: Provider,
    model: string,
  ): Promise<void>;
  exportConversations(): Promise<void>;
  importConversations(file: File): Promise<number>;

  loadedChatHistory: AiSdkMessage[] | null; // for chat hook initialization
}
```

**Persisted to localStorage**:

- `producer_pal_current_conversation_id` — restored on reload
- `producer_pal_panel_open` — panel visibility preference

## Changes to Existing Files

### `use-chat.ts` — Add `getChatHistory` + `loadConversation`

Add two methods to `UseChatReturn`:

- **`getChatHistory(): TMessage[]`** — returns
  `clientRef.current?.chatHistory ?? pendingHistoryRef.current ?? []`
- **`loadConversation(chatHistory: TMessage[]): void`** — stores history in a
  new `pendingHistoryRef`, sets `messages` via
  `adapter.formatMessages(history)`, does NOT create a client (lazy — avoids MCP
  connection until next send)

Modify `handleSend`: when `!clientRef.current`, pass `pendingHistoryRef.current`
to `initializeChat` instead of `undefined`.

Modify `clearConversation`: also clear `pendingHistoryRef`.

This is ~20 lines of changes. The lazy approach means loading a saved
conversation doesn't trigger MCP tool setup until the user actually sends a
message.

### `App.tsx` — Wire conversation manager + auto-save

- Call `useConversationManager()`
- Auto-save effect watching `isAssistantResponding` true→false
- Wire `switchConversation` → save current + `clearConversation` +
  `loadConversation`
- Wire `newConversation` → `wrappedClearConversation`
- Pass conversation panel props to `ChatScreen`

### `ChatScreen.tsx` — Render ConversationPanel

- Accept new props for conversation panel (list, handlers, isPanelOpen)
- Render `ConversationPanel` as an overlay alongside existing layout

### `ChatHeader.tsx` — Add panel toggle button

- Add `onTogglePanel` prop
- Add conversations button before the logo area

### `use-conversation-lock.ts` — No changes needed

The existing flow works: switching conversations does save → clear → load. The
clear step resets the conversation lock. The next `handleSend` re-locks to the
loaded conversation's provider naturally.

## UI: Slide-Out Conversation Panel

Overlays on top of chat content (doesn't consume permanent screen space — good
for the Max for Live device's limited real estate). Toggled via header button.

```
┌───────────────────────────────┐
│ Conversations            [X]  │
│───────────────────────────────│
│ [+ New]                       │
│───────────────────────────────│
│ ● Untitled          ✏️  🗑️   │  ← active (highlighted)
│   Mar 3, 2:30 PM · Gemini    │
│───────────────────────────────│
│   My mixing session  ✏️  🗑️  │
│   Mar 2, 11:00 AM · OpenAI   │
│───────────────────────────────│
│ [Export All]  [Import]        │
└───────────────────────────────┘
```

- Click conversation → switch (auto-saves current first)
- Rename is inline (click pencil → input field)
- Delete shows confirmation
- Always shows creation timestamp + provider/model
- Export: download all as JSON file
- Import: file picker, validates, upserts, shows import count

## Implementation Order

1. Add `idb` (dependency) + `fake-indexeddb` (devDependency)
2. Create types in `webui/src/types/conversations.ts`
3. Build DB layer (`conversation-db.ts`) + tests
4. Build export/import helpers (`conversation-export.ts`) + tests
5. Extend `use-chat.ts` with `getChatHistory`, `loadConversation`,
   `pendingHistoryRef` + extend tests
6. Build conversation manager hook + tests
7. Build `ConversationPanel` component + tests
8. Wire through `App.tsx`, `ChatScreen.tsx`, `ChatHeader.tsx` + extend tests
9. Verify: `npm run fix` → `npm run check` → `npm run check:build`

## Risks

| Risk                                    | Mitigation                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| IndexedDB unavailable in Max for Live   | All modern Chromium supports it. Graceful fallback: hide panel, work as today            |
| `idb` in Vite single-file build         | Pure JS, bundles normally. Verify with `npm run ui:build`                                |
| Coverage thresholds (~98.5% statements) | Write tests per file before integration. Check coverage after each phase                 |
| `use-chat.ts` size (430 lines)          | Additions are ~20 lines. ESLint counts non-blank/non-comment — should remain under limit |
| Large conversations in IndexedDB        | IndexedDB handles multi-MB values well. List queries exclude `chatHistory` for speed     |

## Future Considerations (Not In Scope)

- AI-generated conversation titles (extra API call)
- Search across conversations
- Conversation branching / forking
- Cloud sync
- Selective export (individual conversations)
- Auto-cleanup of old conversations
