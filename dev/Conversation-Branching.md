# Conversation Branching & Management

How the chat UI forks conversations (edit / retry), navigates sibling branches,
and collapses branch families in the history panel. This is the authoritative
reference for the branch model; for the broader chat-UI architecture and the
conversation-persistence basics (IndexedDB store, auto-save, auto-title, locked
settings) see [Chat-UI.md](./Chat-UI.md).

## Mental model: a parent-pointer branch tree

Every branch is a **separate `ConversationRecord`**, not an array of variants
inside one record. Branches are linked by two fields on the record:

- `forkParentId` — the id of the record this one diverged from (its **trunk**).
- `forkedAtIndex` — the **UI message index** the branch diverged at, i.e. where
  the `‹ n/m ›` arrows are rendered.

A **divergence set** is identified by the pair `(trunkId, forkedAtIndex)`. Its
members are the trunk plus every fork that names that trunk and shares that
index. Paging the arrows switches the active conversation between the members of
one set.

```
trunk A ──(fork at index i)──> B
        └─(fork at index i)──> C      A, B, C are one divergence set (A, i)
        └─(fork at index j)──> D      A, D are a different set (A, j)
```

Re-forking at a point that already has a set **joins** that set (the new fork
reuses the existing trunk id) rather than nesting, so repeated edits/retries of
one turn accumulate as flat siblings — see
[`deriveForkParentId`](#deriveforkparentid-joining-vs-starting-a-set).

## Edit vs. retry: where the arrows anchor

Both edit and retry produce a fork. They differ only in **what varies across
siblings**, and therefore in where the arrows sit:

| Action    | What the user changes | Siblings differ in | `forkedAtIndex`        |
| --------- | --------------------- | ------------------ | ---------------------- |
| **Edit**  | their own message     | the prompt + reply | the **user** message N |
| **Retry** | nothing (same prompt) | only the reply     | the **response** N + 1 |

The retry anchor is `N + 1` because **one assistant turn is a single
`UIMessage`** — tool calls, thoughts, text, and errors are all _parts_ of that
one message (`webui/src/types/messages.ts`). So the response always sits at the
user-message index + 1, and anchoring there puts the arrows under the response
rather than under the (unchanged) prompt.

Because edit and retry of the same turn use different `forkedAtIndex` values,
they form **separate divergence sets** and page independently. Editing the
prompt at index N never mixes with retrying the response at index N + 1.

## The fork lifecycle

Forking spans two hooks that are otherwise decoupled — the action lives in
`useConversationActions` (inside `useChat`), the save lives in
`useConversations`. They are bridged by a shared mutable ref,
**`pendingForkRef`** (`PendingFork = { anchorIndex }`).

### 1. `forkConversation` — re-stream from the divergence point

`useConversationActions.forkConversation(mergedMessageIndex, newMessage, anchorIndex = mergedMessageIndex)`:

1. `mergedMessageIndex` always points at the **user** message — it is used to
   slice the raw history (`history.slice(0, rawHistoryIndex)`) and to know which
   prompt to re-send. This is true for both edit and retry.
2. Re-initializes the client with the sliced history, then streams `newMessage`
   as the new turn.
3. Once init succeeds and streaming is about to start, sets
   `pendingForkRef.current = { anchorIndex }`. `anchorIndex` is what decouples
   _where the arrows render_ from _where the slice happens_:
   - **edit** → `handleEdit` calls with the default, so `anchorIndex` = the user
     message index.
   - **retry** → `handleRetry` calls with `mergedMessageIndex + 1`, so
     `anchorIndex` = the response index.

The signal is set _after_ a successful init (not before) so a failed init never
leaves a stale signal that a later normal save would wrongly consume.

### 2. `saveCurrentConversation` — mint the branch record

`useConversations.saveCurrentConversation` consumes the signal up front
(`const fork = pendingForkRef.current; pendingForkRef.current = null`) so only
this one save branches:

- A pending fork (with a saved source to diverge from) **mints a new UUID** and
  switches the active id to it, leaving the source record untouched. A normal
  save reuses the active id.
- `buildConversationSaveRecord` loads the source, computes the trunk via
  `deriveForkParentId`, and writes a record carrying `forkParentId = trunk` and
  `forkedAtIndex = fork.anchorIndex` (`buildForkedRecord`).
- `forkProtectedIds` shields the trunk and the source-sibling from the
  conversation-cap LRU, so trimming to make room for the new branch can't evict
  the records it points back to.

### `deriveForkParentId`: joining vs. starting a set

```
source.forkParentId != null && source.forkedAtIndex === anchorIndex
  ? source.forkParentId   // join the existing set (reuse the trunk)
  : source.id             // start a new set rooted at the source
```

So retrying a response you reached _by retrying_ keeps all the alternatives as
siblings of the original trunk (a flat set), instead of building a chain. Edit
at a different index → a fresh set rooted at the current record.

## Branch navigation (the `‹ n/m ›` arrows)

`computeBranchPoints(activeId, items)` (pure, in
`webui/src/lib/conversation-branch-helpers.ts`) returns the `BranchPoint[]`
visible while viewing one conversation:

- the set the active conversation belongs to **as a fork**, plus
- any sets it anchors **as a trunk** (others forked from it).

Each `BranchPoint` is `{ anchorIndex, siblingIds, currentIndex }`. `siblingIds`
is ordered **trunk first, then forks oldest-first** (`siblingsOfSet`). Points
with fewer than two members are dropped (no real choice to page).

Wiring:

- `useBranchNav` (`use-chat-mode-state.ts`) reads the full **uncollapsed**
  summary list (so every sibling is visible) and recomputes whenever the active
  conversation or the list changes. It is bundled with `switchConversation` into
  a single `BranchNavState` prop.
- `MessageList.tsx` builds `branchByIndex = Map(anchorIndex → point)` and
  renders a `BranchNavRow` immediately after the `MessageRow` whose index equals
  `anchorIndex`. The arrows themselves are `BranchNav.tsx`.
- Switching: `switchToSibling` stashes the anchor in `pendingBranchScrollRef`,
  then calls `branchNav.onSwitch` (= `switchConversation`). After the sibling
  transcript swaps in, `useScrollToForkPoint` scrolls the shared fork-point
  message (`[data-message-index]`) into view. The shared prefix is identical
  across siblings, so the stored index lines up.

## History-panel family collapse

So forks don't each get a sidebar row, `collapseBranchFamilies(items, activeId)`
reduces each family (everything sharing a root via the `forkParentId` chain,
resolved by `branchRootId`) to one representative. Representative precedence:

1. the **active** conversation (so the sidebar highlights the sibling you're
   viewing, even if it isn't newest);
2. a **bookmarked** member (so a bookmarked trunk isn't hidden behind a newer
   fork);
3. the **most-recently-updated** member (ties broken by newest `createdAt`, so a
   freshly minted fork wins over the original it diverged from).

Families are ordered by their most recent member, so promoting an older active
or bookmarked representative never moves the row. `listConversations` applies
the collapse; the branch arrows read `listAllConversationSummaries`
(uncollapsed) instead, since they need every sibling.

## Invariants & gotchas

- **`anchorIndex` must line up across siblings.** It indexes into the shared
  prefix, which is identical for all members of a set — that's what lets the
  arrows render at the same spot and the scroll-to-fork land correctly.
- **Orphaned siblings still collapse.** If a trunk is deleted, `branchRootId`
  returns the missing id, so orphaned forks keep grouping together;
  `siblingsOfSet` simply omits the absent trunk from the order.
- **Arrows vanish below two members.** Deleting siblings down to one removes the
  point entirely (no `1 / 1`).
- **Branching is independent of compaction undo.** Compaction undo is an
  in-memory one-shot restore of pre-compaction history; it is not a branch and
  does not touch these fields.
- Branching applies to both **text and voice** sessions (same records, same
  helpers).

## File map

| File                                                        | Role                                                                                                                                      |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `webui/src/lib/conversation-branch-helpers.ts`              | Pure helpers — exported: `computeBranchPoints`, `collapseBranchFamilies`, `deriveForkParentId`; internal: `siblingsOfSet`, `branchRootId` |
| `webui/src/hooks/chat/use-conversation-actions.ts`          | `forkConversation` / `handleEdit` / `handleRetry`; sets `pendingForkRef`                                                                  |
| `webui/src/hooks/chat/use-conversations.ts`                 | `saveCurrentConversation` (consumes the signal), `switchConversation`, `forkProtectedIds`                                                 |
| `webui/src/hooks/chat/helpers/use-conversations-helpers.ts` | `buildConversationSaveRecord`, `buildForkedRecord`                                                                                        |
| `webui/src/hooks/chat/use-chat-mode-state.ts`               | `useBranchNav`, assembles `BranchNavState`                                                                                                |
| `webui/src/hooks/chat/use-chat-types.ts`                    | `PendingFork`, `PendingForkRef`                                                                                                           |
| `webui/src/components/chat/MessageList.tsx`                 | Renders `BranchNavRow` at each anchor; scroll-to-fork                                                                                     |
| `webui/src/components/chat/controls/BranchNav.tsx`          | The `‹ n/m ›` control                                                                                                                     |

## Testing

- **Unit (pure helpers):** `webui/src/lib/tests/` and
  `webui/src/hooks/chat/tests/conversations/` cover `computeBranchPoints`,
  family collapse, fork-signal consumption, and the edit/retry anchor values
  (`use-chat-edit.test.ts` asserts `anchorIndex = N`, `use-chat-retry.test.ts`
  asserts `anchorIndex = N + 1`).
- **Stubbed UI (no LLM, CI-runnable):** `e2e/ui/conversation-branching.spec.ts`
  seeds sibling records directly into IndexedDB and drives the real arrows —
  family roll-up, edit-fork paging (anchor at index 0), and retry-fork paging
  (anchor at index 1, prompt unchanged across siblings). Run with
  `npm run ui:test`.
