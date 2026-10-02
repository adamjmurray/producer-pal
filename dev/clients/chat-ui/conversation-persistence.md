# Conversation Persistence

Part of the [Chat UI docs](README.md).

Conversations are persisted to IndexedDB so they survive page reloads. Covers
save, load, switch, rename, delete, and auto-titling. Forked conversations
(edit/retry branches) add `forkParentId`/`forkedAtIndex` linkage and a
sibling-navigation UI — see
[conversation-branching.md](conversation-branching.md) for that model. The
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

| File                                                           | Purpose                                                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `lib/conversation-db.ts`                                       | Pure async DB functions + types (`ConversationRecord`, `ConversationSummary`) |
| `lib/conversation-db-open.ts`                                  | DB open/upgrade, version mismatch handling, JSON export                       |
| `lib/conversations/`                                           | Live-conversation store + the delete/rename/sweep steps chat and voice share  |
| `hooks/chat/use-conversations.ts`                              | Orchestration hook (save/load/switch/new/delete/rename)                       |
| `hooks/chat/helpers/conversations/conversation-save-record.ts` | Title derivation, save/fork record builders, locked settings                  |
| `hooks/chat/helpers/conversations/use-hash-navigation.ts`      | URL hash read/write and back/forward routing                                  |
| `components/chat/ConversationPanel.tsx`                        | Slide-out sidebar panel with inline rename                                    |

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

**Dangling tool calls on restore**: autosave fires on the first assistant
content, and a tool-call part counts — so a conversation left mid-tool-call is
saved with that call missing its result. Restoring runs
`reconcileDanglingToolCalls` over the record so the call gets the same synthetic
result the wire form would substitute anyway. Without it the card renders as
forever "working…" and the next request 400s on the unmatched tool_use. The
cards read that placeholder back as "stopped" or "interrupted".

Pressing Stop mid-call needs its own fix: the stream reconciles its own history
on the way out, but that repaint lands after the abort and `onMessageUpdate`
drops it (it has to — a conversation switch aborts the same way, and a late
paint would clobber the conversation the user switched to). `stopResponse` marks
the rendered cards itself, via `haltRunningToolCalls`.

**Active conversation routing**: The active conversation ID is stored in the URL
hash (`#<conversation-id>`), enabling browser back/forward navigation between
conversations. On page load, the hash is read to restore the last conversation.

**View state persistence**: UI view state (history panel open/close, settings
open/close, active settings tab) is persisted to localStorage under a single
`producer_pal_view_state` key via the `useViewState` hook.
