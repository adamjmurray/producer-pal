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

**Storage**: IndexedDB via `idb` library. Two databases:

- `producer-pal-conversations` (version 1): a `conversations` object store with
  an `updatedAt` index. Max 200 conversations (`MAX_CONVERSATIONS`); oldest
  non-bookmarked conversations are auto-deleted on save when the limit is
  reached.
- `producer-pal-conversation-images` (version 1): image bytes, see below.

**Images** (`lib/conversations/conversation-images.ts`): image bytes live in the
`images` store of their own database, keyed by a hash of their content, so an
edit/retry fork shares them instead of storing another copy. A stored message
holds `{ mediaType, ref }`; `loadConversation` puts the bytes back, so callers
only ever see inline images (`{ images: false }` skips that for metadata-only
reads, such as the autosave's look at the saved record). A save writes only the
bytes missing from the store. Export writes images inline, so an export file
stays self-contained.

The two databases can't share a transaction, so:

- A save writes the images first and the record second, then sweeps. A crash
  between the writes leaves an unused image, never a record whose image is
  missing.
- There are no reference counts. Every save and delete sweeps the images no
  remaining record uses. A `touched` store records when a save last wrote or
  re-used each image, and a sweep spares those from the last minute: the save
  that wrote one may not have written its record yet (it may be another tab).
- "Delete all" clears both image stores outright, grace period or not.
- A failed sweep or clear is only logged. The records are already written.

**Why images are a separate database**: every chat UI is served from the same
origin, and a Live Set can hold an older device. A released UI opens the
conversations database at version 1 and, on any other version, offers to delete
all history. So that database stays at version 1.

Pre-release builds kept images in a `images` store in the conversations database
and bumped it to version 2. That can't be undone, so such a database is opened
as is (`LEGACY_DB_VERSION`), and its images are moved to the image database on
open (`conversations/legacy-image-migration.ts`; safe to re-run). The emptied
store stays. A real future bump must skip version 2. No path raises the
conversations database: an empty one (no stores) is deleted and recreated at
version 1.

An older UI reading a conversation with stored images shows broken thumbnails
and fails on the next send in that conversation (it expects inline `data`).

**Cross-tab**: every connection opens through
`conversations/open-tracked-db.ts`. When a newer build needs an upgrade, this
tab closes both databases, alerts, and refuses further use (reload to recover)
rather than reopening, which would offer the data wipe.

**Versioning**: IndexedDB is schemaless for record data, so adding a field to a
stored record needs no version bump — just default it when it's missing on read.
Only bump `DB_VERSION` for structural changes (creating or deleting an object
store or index), and weigh the older-UI problem above first. Prefer a
backwards-compatible read over an upgrade-time data transform.

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
| `lib/conversation-db-open.ts`                                  | DB open, version mismatch handling (backup includes images), JSON export      |
| `lib/conversations/conversation-images.ts`                     | Shared image store: move bytes out on save, back in on load, sweep orphans    |
| `lib/conversations/image-db.ts`                                | The image database: open, stores                                              |
| `lib/conversations/legacy-image-migration.ts`                  | Moves images left in the version 2 conversations database                     |
| `lib/conversations/open-tracked-db.ts`                         | Shared open with `blocked`/`blocking` handling and tab retirement             |
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
