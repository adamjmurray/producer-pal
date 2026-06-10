// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, useState } from "preact/hooks";
import { type QueuedMessage } from "#webui/hooks/chat/use-message-queue";
import { type UIMessage } from "#webui/types/messages";
import { CompactionDivider } from "./assistant/CompactionDivider";
import { MessageRow } from "./assistant/MessageRow";
import { ActivityIndicator } from "./controls/ActivityIndicator";
import { QueuedMessages } from "./controls/QueuedMessages";

const STILL_THINKING_DELAY_MS = 4000;

interface MessageListProps {
  messages: UIMessage[];
  queuedMessages: QueuedMessage[];
  onRemoveQueued: (id: number) => void;
  isAssistantResponding: boolean;
  handleRetry: (messageIndex: number) => Promise<void>;
  handleEdit: (messageIndex: number, newMessage: string) => Promise<void>;
  /** Compact-up-to-here; omitted in surfaces that don't support compaction (voice/demo) */
  handleCompact?: (messageIndex: number) => Promise<void>;
  onUndoCompaction?: () => void;
  canUndoCompaction?: boolean;
  showTimestamps: boolean;
  showTokenUsage: boolean;
  requestedModel?: string | null;
}

/**
 * List of chat messages with auto-scroll
 * @param {MessageListProps} root0 - Component props
 * @param {UIMessage[]} root0.messages - Chat messages
 * @param {QueuedMessage[]} root0.queuedMessages - Messages queued during a response
 * @param {Function} root0.onRemoveQueued - Remove a queued message by id
 * @param {boolean} root0.isAssistantResponding - Whether assistant is responding
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
  handleRetry,
  handleEdit,
  handleCompact,
  onUndoCompaction,
  canUndoCompaction = false,
  showTimestamps,
  showTokenUsage,
  requestedModel,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const prevMessageCountRef = useRef(0);
  const [showStillThinking, setShowStillThinking] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  // Show "Still thinking..." after delay; clear editing when responding starts
  useEffect(() => {
    setShowStillThinking(false);
    if (!isAssistantResponding) return;
    setEditingIndex(null);
    const timer = setTimeout(
      () => setShowStillThinking(true),
      STILL_THINKING_DELAY_MS,
    );

    return () => clearTimeout(timer);
  }, [isAssistantResponding, messages]);

  // Auto-scroll to bottom only when a new user message is added (not during
  // AI streaming), so the user can read without being interrupted.
  useScrollOnUserMessage(messages, messagesEndRef, prevMessageCountRef);

  return (
    <div
      className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-4 items-start p-4"
      data-testid="message-list"
    >
      {messages.map((message, originalIdx) => {
        if (!hasContent(message)) return null;

        const compactionPart = message.parts.find(
          (p) => p.type === "compaction",
        );

        if (compactionPart?.type === "compaction") {
          return (
            <CompactionDivider
              key={originalIdx}
              summary={compactionPart.content}
              canUndo={canUndoCompaction}
              onUndo={onUndoCompaction}
            />
          );
        }

        return (
          <MessageRow
            key={originalIdx}
            message={message}
            originalIdx={originalIdx}
            messages={messages}
            isAssistantResponding={isAssistantResponding}
            showTimestamps={showTimestamps}
            showTokenUsage={showTokenUsage}
            requestedModel={requestedModel}
            handleRetry={handleRetry}
            handleEdit={handleEdit}
            handleCompact={handleCompact}
            editingIndex={editingIndex}
            setEditingIndex={setEditingIndex}
            editText={editText}
            setEditText={setEditText}
          />
        );
      })}

      <QueuedMessages
        queuedMessages={queuedMessages}
        onRemove={onRemoveQueued}
        scrollRef={messagesEndRef}
      />

      <StreamingFooter
        isResponding={isAssistantResponding}
        showStillThinking={showStillThinking}
      />

      <div ref={messagesEndRef} className="col-span-3" />
    </div>
  );
}

/**
 * Scrolls to bottom only when new user messages are added, not during AI
 * streaming. This prevents auto-scroll from interfering with reading.
 * @param messages - Current messages array
 * @param endRef - Ref to the scroll target element
 * @param endRef.current - The scroll target DOM element
 * @param prevCountRef - Ref tracking previous message count
 * @param prevCountRef.current - Previous message count value
 */
function useScrollOnUserMessage(
  messages: UIMessage[],
  endRef: { current: HTMLDivElement | null },
  prevCountRef: { current: number },
): void {
  useEffect(() => {
    const prevCount = prevCountRef.current;

    prevCountRef.current = messages.length;

    if (messages.length <= prevCount) return;

    const hasNewUserMessage = messages
      .slice(prevCount)
      .some((m) => m.role === "user");

    if (hasNewUserMessage) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, endRef, prevCountRef]);
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
 * Footer shown while assistant is streaming a response.
 * @param props - Component props
 * @param props.isResponding - Whether assistant is responding
 * @param props.showStillThinking - Whether to show "Still thinking..." text
 * @returns Footer element or null
 */
function StreamingFooter({
  isResponding,
  showStillThinking,
}: {
  isResponding: boolean;
  showStillThinking: boolean;
}) {
  if (!isResponding) return null;

  return (
    <>
      {showStillThinking && (
        <div className="col-span-3 text-center text-sm text-zinc-400 animate-pulse">
          Still thinking...
        </div>
      )}
      <div className="col-span-3">
        <ActivityIndicator />
      </div>
    </>
  );
}
