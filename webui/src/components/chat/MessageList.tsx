// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { type QueuedMessage } from "#webui/hooks/chat/use-message-queue";
import {
  type BranchNavState,
  type BranchPoint,
} from "#webui/lib/conversation-branch-helpers";
import { type UIMessage } from "#webui/types/messages";
import { CompactionDivider } from "./assistant/CompactionDivider";
import { MessageRow, type MessageRowProps } from "./assistant/MessageRow";
import { ActivityIndicator } from "./controls/ActivityIndicator";
import { BranchNav } from "./controls/BranchNav";
import { QueuedMessages } from "./controls/QueuedMessages";

const STILL_THINKING_DELAY_MS = 4000;

interface MessageListProps {
  messages: UIMessage[];
  queuedMessages: QueuedMessage[];
  onRemoveQueued: (id: number) => void;
  isAssistantResponding: boolean;
  /** Whether a manual compaction is in progress (footer shows "Compacting…") */
  isCompacting?: boolean;
  handleRetry: (messageIndex: number) => Promise<void>;
  handleEdit: (messageIndex: number, newMessage: string) => Promise<void>;
  /** Compact-up-to-here; omitted in surfaces that don't support compaction (voice/demo) */
  handleCompact?: (messageIndex: number) => Promise<void>;
  onUndoCompaction?: () => void;
  canUndoCompaction?: boolean;
  showTimestamps: boolean;
  showTokenUsage: boolean;
  requestedModel?: string | null;
  /** Sibling-branch navigation for the active conversation (edit/retry forks). */
  branchNav?: BranchNavState;
}

/**
 * List of chat messages with auto-scroll
 * @param {MessageListProps} root0 - Component props
 * @param {UIMessage[]} root0.messages - Chat messages
 * @param {QueuedMessage[]} root0.queuedMessages - Messages queued during a response
 * @param {Function} root0.onRemoveQueued - Remove a queued message by id
 * @param {boolean} root0.isAssistantResponding - Whether assistant is responding
 * @param {boolean} root0.isCompacting - Whether a manual compaction is in progress
 * @param {Function} root0.handleRetry - Retry callback
 * @param {Function} root0.handleEdit - Edit and fork callback
 * @param {Function} root0.handleCompact - Compact-up-to-here callback
 * @param {Function} root0.onUndoCompaction - Undo the last compaction
 * @param {boolean} root0.canUndoCompaction - Whether the last compaction can be undone
 * @param {boolean} root0.showTimestamps - Whether to show timestamps
 * @param {boolean} root0.showTokenUsage - Whether to show token usage
 * @param {string} [root0.requestedModel] - Requested model ID for mismatch detection
 * @returns {JSX.Element} Message list
 */
export function MessageList({
  messages,
  queuedMessages,
  onRemoveQueued,
  isAssistantResponding,
  isCompacting = false,
  handleRetry,
  handleEdit,
  handleCompact,
  onUndoCompaction,
  canUndoCompaction = false,
  showTimestamps,
  showTokenUsage,
  requestedModel,
  branchNav,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const prevMessageCountRef = useRef(0);
  // Index to scroll to after a branch switch replaces the transcript; consumed
  // by the effect below once the new messages render.
  const pendingBranchScrollRef = useRef<number | null>(null);
  const [showStillThinking, setShowStillThinking] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const branchByIndex = buildBranchIndex(branchNav);

  const switchToSibling = useBranchSwitch(
    messages,
    pendingBranchScrollRef,
    branchNav?.onSwitch,
  );

  // Show "Still thinking..." after delay. Clear any open editor on every
  // transcript change (branch switch, conversation select, new chat) so a stale
  // editor from the prior transcript can't linger with the wrong message's text.
  useEffect(() => {
    setShowStillThinking(false);
    setEditingIndex(null);
    if (!isAssistantResponding) return;
    const timer = setTimeout(
      () => setShowStillThinking(true),
      STILL_THINKING_DELAY_MS,
    );

    return () => clearTimeout(timer);
  }, [isAssistantResponding, messages]);

  // Auto-scroll to bottom only when a new user message is added (not during
  // AI streaming), so the user can read without being interrupted. Suppressed
  // when a branch switch is pending so scroll-to-fork wins.
  useScrollOnUserMessage(
    messages,
    messagesEndRef,
    prevMessageCountRef,
    pendingBranchScrollRef,
  );

  // After a branch switch swaps in the sibling transcript, scroll the shared
  // fork-point message into view (its index lines up across siblings).
  useScrollToForkPoint(messages, containerRef, pendingBranchScrollRef);

  return (
    <div
      ref={containerRef}
      className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-4 items-start p-4"
      data-testid="message-list"
    >
      {messages.map((message, originalIdx) => (
        <MessageListRow
          key={originalIdx}
          message={message}
          originalIdx={originalIdx}
          branch={branchByIndex.get(originalIdx)}
          onSwitch={switchToSibling}
          messages={messages}
          isAssistantResponding={isAssistantResponding}
          showTimestamps={showTimestamps}
          showTokenUsage={showTokenUsage}
          requestedModel={requestedModel}
          handleRetry={handleRetry}
          handleEdit={handleEdit}
          handleCompact={handleCompact}
          canUndoCompaction={canUndoCompaction}
          onUndoCompaction={onUndoCompaction}
          editingIndex={editingIndex}
          setEditingIndex={setEditingIndex}
          editText={editText}
          setEditText={setEditText}
        />
      ))}

      <QueuedMessages
        queuedMessages={queuedMessages}
        onRemove={onRemoveQueued}
        scrollRef={messagesEndRef}
      />

      <StreamingFooter
        isResponding={isAssistantResponding}
        isCompacting={isCompacting}
        showStillThinking={showStillThinking}
      />

      <div ref={messagesEndRef} className="col-span-3" />
    </div>
  );
}

/** A {@link MessageRow}'s inputs plus the per-row branch/compaction context. */
interface MessageListRowProps extends MessageRowProps {
  /** Branch point anchored at this row's index, if any. */
  branch: BranchPoint | undefined;
  /** Switches to a sibling branch (remembers the scroll target, then loads it). */
  onSwitch: (siblingId: string, anchorIndex: number) => void;
  canUndoCompaction: boolean;
  onUndoCompaction?: () => void;
}

/**
 * Renders one transcript row: a message bubble, a compaction divider, or — when
 * the row is an empty anchor — just its branch arrows. Every variant that anchors
 * a branch point still emits the ‹ n/m › arrows, because navigability must not
 * depend on what the divergent message renders as (an empty redacted-thinking
 * sibling, or a compaction divider, must stay pageable).
 * @param props - Row inputs plus branch/compaction context
 * @param props.branch - Branch point anchored at this row, if any
 * @param props.onSwitch - Switches to a sibling branch
 * @param props.canUndoCompaction - Whether a compaction divider can still be undone
 * @param props.onUndoCompaction - Undo callback for a compaction divider
 * @returns The rendered row, or null for an empty non-anchor message
 */
function MessageListRow({
  branch,
  onSwitch,
  canUndoCompaction,
  onUndoCompaction,
  ...row
}: MessageListRowProps) {
  const { message, originalIdx } = row;
  const branchNav = branch && (
    <BranchNavRow point={branch} onSwitch={onSwitch} />
  );

  if (!hasContent(message)) return branchNav ?? null;

  const compactionPart = message.parts.find((p) => p.type === "compaction");

  if (compactionPart?.type === "compaction") {
    return (
      <Fragment>
        <CompactionDivider
          messageIndex={originalIdx}
          summary={compactionPart.content}
          canUndo={canUndoCompaction}
          onUndo={onUndoCompaction}
        />
        {branchNav}
      </Fragment>
    );
  }

  return (
    <Fragment>
      <MessageRow {...row} />
      {branchNav}
    </Fragment>
  );
}

/**
 * Indexes branch points by the message index their arrows anchor on, so each
 * rendered row can look up its branch point in O(1).
 * @param branchNav - Sibling-branch navigation state, if any
 * @returns Map from anchor message index to its branch point
 */
function buildBranchIndex(
  branchNav: BranchNavState | undefined,
): Map<number, BranchPoint> {
  return new Map(
    (branchNav?.points ?? []).map((point) => [point.anchorIndex, point]),
  );
}

/**
 * Builds the sibling-switch handler: remembers the fork-point scroll target,
 * loads the sibling, then clears the target if the switch turned out to be a
 * no-op. A switch that doesn't replace the transcript (the sibling was
 * concurrently deleted, or it's a voice record that leaves the text transcript
 * untouched) never changes `messages`, so useScrollToForkPoint never fires to
 * consume the pending ref — clearing it here stops the stranded value from
 * suppressing the next new-user-message auto-scroll.
 * @param messages - Current messages array (tracked to detect a transcript swap)
 * @param pendingBranchScrollRef - Ref holding the pending fork-point index
 * @param pendingBranchScrollRef.current - The pending index, or null
 * @param onSwitch - Loads a sibling conversation by id
 * @returns A handler that switches to the given sibling
 */
function useBranchSwitch(
  messages: UIMessage[],
  pendingBranchScrollRef: { current: number | null },
  onSwitch: BranchNavState["onSwitch"] | undefined,
): (siblingId: string, anchorIndex: number) => void {
  // Tracks the latest committed transcript so the handler can tell whether an
  // awaited branch switch actually swapped it.
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  return (siblingId, anchorIndex) => {
    const before = messagesRef.current;

    pendingBranchScrollRef.current = anchorIndex;

    void (async () => {
      await onSwitch?.(siblingId);

      if (messagesRef.current === before) {
        pendingBranchScrollRef.current = null;
      }
    })();
  };
}

/**
 * Full-width row holding the ‹ n/m › sibling-branch arrows, shown under the
 * message a fork diverged at. An arrow is omitted (disabled) at the ends of the
 * set so there is never an out-of-range switch.
 * @param props - Component props
 * @param props.point - The branch point to render arrows for
 * @param props.onSwitch - Switches to a sibling (remembers scroll target + loads it)
 * @returns The branch-nav row
 */
function BranchNavRow({
  point,
  onSwitch,
}: {
  point: BranchPoint;
  onSwitch: (siblingId: string, anchorIndex: number) => void;
}) {
  const prevSibling = point.siblingIds[point.currentIndex - 1];
  const nextSibling = point.siblingIds[point.currentIndex + 1];

  return (
    <div
      className="col-span-3 flex justify-end pr-1 -mt-2"
      data-message-index={point.anchorIndex}
    >
      <BranchNav
        current={point.currentIndex + 1}
        total={point.siblingIds.length}
        onPrev={
          prevSibling != null
            ? () => onSwitch(prevSibling, point.anchorIndex)
            : undefined
        }
        onNext={
          nextSibling != null
            ? () => onSwitch(nextSibling, point.anchorIndex)
            : undefined
        }
      />
    </div>
  );
}

/**
 * Scrolls to bottom only when new user messages are added, not during AI
 * streaming. This prevents auto-scroll from interfering with reading. Skips
 * entirely when a branch switch is pending, so the whole-transcript swap doesn't
 * yank the view to the bottom before scroll-to-fork can run.
 * @param messages - Current messages array
 * @param endRef - Ref to the scroll target element
 * @param endRef.current - The scroll target DOM element
 * @param prevCountRef - Ref tracking previous message count
 * @param prevCountRef.current - Previous message count value
 * @param pendingBranchScrollRef - Ref holding a pending branch-scroll target
 * @param pendingBranchScrollRef.current - The pending fork-point index, or null
 */
function useScrollOnUserMessage(
  messages: UIMessage[],
  endRef: { current: HTMLDivElement | null },
  prevCountRef: { current: number },
  pendingBranchScrollRef: { current: number | null },
): void {
  useEffect(() => {
    const prevCount = prevCountRef.current;

    prevCountRef.current = messages.length;

    // A branch switch replaces the transcript; let scroll-to-fork handle it.
    if (pendingBranchScrollRef.current != null) return;

    if (messages.length <= prevCount) return;

    const hasNewUserMessage = messages
      .slice(prevCount)
      .some((m) => m.role === "user");

    if (hasNewUserMessage) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, endRef, prevCountRef, pendingBranchScrollRef]);
}

/**
 * After a branch switch swaps in a sibling transcript, scroll the fork-point
 * message into view. The shared prefix is identical across siblings, so the
 * stored anchor index lines up with the message element in the new transcript.
 * Every render path that can host an anchor carries `data-message-index`
 * (message bubbles, the empty-content `BranchNavRow`, the `CompactionDivider`),
 * so the lookup resolves regardless of what the anchor message renders as.
 * @param messages - Current messages array (changes when the sibling loads)
 * @param containerRef - Ref to the message-list container
 * @param containerRef.current - The container DOM element
 * @param pendingRef - Ref holding the fork-point index to scroll to, or null
 * @param pendingRef.current - The pending index, consumed on scroll
 */
function useScrollToForkPoint(
  messages: UIMessage[],
  containerRef: { current: HTMLDivElement | null },
  pendingRef: { current: number | null },
): void {
  useEffect(() => {
    const target = pendingRef.current;

    if (target == null) return;

    pendingRef.current = null;

    const element = containerRef.current?.querySelector(
      `[data-message-index="${target}"]`,
    );

    element?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [messages, containerRef, pendingRef]);
}

/**
 * Checks if message has any parts to display. Messages with parts: [] are
 * system messages that shouldn't be rendered.
 * @param {UIMessage} message - Message to check
 * @returns {boolean} Whether the message has displayable parts
 */
function hasContent(message: UIMessage): boolean {
  return message.parts.length > 0;
}

/**
 * Footer shown while the assistant is streaming a response or a compaction is
 * running. Compaction shows "Compacting…" immediately; the "Still thinking…"
 * label for normal responses stays gated behind the slow-response delay.
 * @param props - Component props
 * @param props.isResponding - Whether assistant is responding
 * @param props.isCompacting - Whether a manual compaction is in progress
 * @param props.showStillThinking - Whether to show "Still thinking..." text
 * @returns Footer element or null
 */
function StreamingFooter({
  isResponding,
  isCompacting,
  showStillThinking,
}: {
  isResponding: boolean;
  isCompacting: boolean;
  showStillThinking: boolean;
}) {
  if (!isResponding) return null;

  const status = isCompacting
    ? "Compacting..."
    : showStillThinking
      ? "Still thinking..."
      : null;

  return (
    <>
      {status && (
        <div className="col-span-3 text-center text-sm text-zinc-400 animate-pulse">
          {status}
        </div>
      )}
      <div className="col-span-3">
        <ActivityIndicator />
      </div>
    </>
  );
}
