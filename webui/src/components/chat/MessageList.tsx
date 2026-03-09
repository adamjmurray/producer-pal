// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { Fragment, type VNode } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  formatTimestampDate,
  formatTimestampTime,
} from "#webui/lib/utils/format-timestamp";
import { sanitizeMarkdown } from "#webui/lib/utils/sanitize-markdown";
import { type UIMessage } from "#webui/types/messages";
import { AssistantMessage } from "./assistant/AssistantMessage";
import { ActivityIndicator } from "./controls/ActivityIndicator";
import { RetryButton } from "./controls/RetryButton";
import { EditButton } from "./EditButton";
import { UserMessageEditor } from "./UserMessageEditor";

const STILL_THINKING_DELAY_MS = 4000;

interface MessageListProps {
  messages: UIMessage[];
  isAssistantResponding: boolean;
  handleRetry: (messageIndex: number) => Promise<void>;
  handleEdit: (messageIndex: number, newMessage: string) => Promise<void>;
  showTimestamps: boolean;
}

/**
 * List of chat messages with auto-scroll
 * @param {MessageListProps} props - Component props
 * @param {UIMessage[]} props.messages - Chat messages to display
 * @param {boolean} props.isAssistantResponding - Whether assistant is responding
 * @param {(messageIndex: number) => Promise<void>} props.handleRetry - Retry message callback
 * @param {(messageIndex: number, newMessage: string) => Promise<void>} props.handleEdit - Edit and fork callback
 * @param {boolean} props.showTimestamps - Whether to show timestamps
 * @returns {JSX.Element} - React component
 */
export function MessageList({
  messages,
  isAssistantResponding,
  handleRetry,
  handleEdit,
  showTimestamps,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
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

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div
      className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-4 items-start p-4"
      data-testid="message-list"
    >
      {messages.map((message, originalIdx) => {
        if (!hasContent(message)) return null;

        const isUser = message.role === "user";
        const canRetry = message.role === "model" && !isAssistantResponding;
        const previousUserMessageIdx = canRetry
          ? findPreviousUserMessageIndex(messages, originalIdx)
          : -1;
        const showRetry = canRetry && previousUserMessageIdx >= 0;
        const canEdit = isUser && !isAssistantResponding;
        const isEditing = editingIndex === originalIdx;
        const timestamp = renderTimestamp(message.timestamp, showTimestamps);

        return (
          <Fragment key={originalIdx}>
            {isUser && timestamp}
            <div
              className={`${
                isUser
                  ? "text-black bg-blue-100 dark:text-white dark:bg-blue-900"
                  : "col-span-2 bg-gray-100 dark:bg-gray-800"
              } min-w-0 rounded-lg py-0.5 px-3`}
              data-testid={isUser ? undefined : "assistant-message-bubble"}
            >
              {!isUser && (
                <AssistantMessage
                  parts={message.parts}
                  isResponding={isAssistantResponding}
                />
              )}
              {isUser && isEditing && (
                <UserMessageEditor
                  text={editText}
                  onTextChange={setEditText}
                  onSave={() => {
                    void handleEdit(originalIdx, editText);
                    setEditingIndex(null);
                  }}
                  onCancel={() => setEditingIndex(null)}
                />
              )}
              {isUser && !isEditing && (
                <div
                  className="prose dark:prose-invert prose-sm max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeMarkdown(formatUserContent(message)),
                  }}
                />
              )}
            </div>
            {isUser ? (
              canEdit && !isEditing ? (
                <EditButton
                  onClick={() => {
                    setEditingIndex(originalIdx);
                    setEditText(formatUserContent(message));
                  }}
                />
              ) : (
                <div />
              )
            ) : (
              <RightGutter
                timestamp={timestamp}
                showRetry={showRetry}
                onRetry={() => void handleRetry(previousUserMessageIdx)}
              />
            )}
          </Fragment>
        );
      })}

      {isAssistantResponding && (
        <>
          {showStillThinking && (
            <div className="col-span-3 text-center text-sm text-gray-400 animate-pulse">
              Still thinking...
            </div>
          )}
          <div className="col-span-3">
            <ActivityIndicator />
          </div>
        </>
      )}

      <div ref={messagesEndRef} className="col-span-3" />
    </div>
  );
}

/**
 * Checks if message has any parts to display. This checks for the presence of
 * parts, not whether parts have non-empty content — messages with parts: []
 * are system messages that shouldn't be rendered.
 * @param {UIMessage} message - Message to check
 * @returns {boolean} Whether the message has displayable parts
 */
function hasContent(message: UIMessage): boolean {
  return message.parts.length > 0;
}

/**
 * Right gutter for AI messages: timestamp at top, retry button at bottom.
 * @param props - Component props
 * @param props.timestamp - Timestamp element
 * @param props.showRetry - Whether to show retry button
 * @param props.onRetry - Retry callback
 * @returns Gutter element
 */
function RightGutter({
  timestamp,
  showRetry,
  onRetry,
}: {
  timestamp: VNode;
  showRetry: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-start self-stretch">
      {timestamp}
      {showRetry && (
        <div className="mt-auto">
          <RetryButton onClick={onRetry} />
        </div>
      )}
    </div>
  );
}

/**
 * Renders a timestamp element for a message
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @param {boolean} visible - Whether timestamp should be visible
 * @returns {JSX.Element} Timestamp element
 */
function renderTimestamp(timestamp: number, visible: boolean) {
  return (
    <div
      className={`text-[9px] leading-tight text-gray-300 dark:text-gray-600 whitespace-nowrap ${visible ? "" : "invisible"}`}
      data-testid="message-timestamp"
    >
      <div>{formatTimestampDate(timestamp)}</div>
      <div>{formatTimestampTime(timestamp)}</div>
    </div>
  );
}

/**
 * Finds previous user message index for retry
 * @param {UIMessage[]} messages - Messages array
 * @param {number} currentIdx - Current message index
 * @returns {number} Previous user message index or -1
 */
function findPreviousUserMessageIndex(
  messages: UIMessage[],
  currentIdx: number,
): number {
  for (let i = currentIdx - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return i;
  }

  return -1;
}

/**
 * Formats user message content as string
 * @param {UIMessage} message - User message to format
 * @returns {string} Concatenated text content
 */
function formatUserContent(message: UIMessage): string {
  return message.parts
    .map((part) => {
      if ("content" in part) {
        return part.content;
      }

      return "";
    })
    .join("");
}
