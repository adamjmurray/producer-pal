// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { marked } from "marked";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  formatTimestampDate,
  formatTimestampTime,
} from "#webui/lib/utils/format-timestamp";
import { type UIMessage } from "#webui/types/messages";
import { AssistantMessage } from "./assistant/AssistantMessage";
import { ActivityIndicator } from "./controls/ActivityIndicator";
import { RetryButton } from "./controls/RetryButton";

const STILL_THINKING_DELAY_MS = 4000;

interface MessageListProps {
  messages: UIMessage[];
  isAssistantResponding: boolean;
  handleRetry: (messageIndex: number) => Promise<void>;
}

/**
 * List of chat messages with auto-scroll
 * @param {MessageListProps} props - Component props
 * @param {UIMessage[]} props.messages - Chat messages to display
 * @param {boolean} props.isAssistantResponding - Whether assistant is responding
 * @param {(messageIndex: number) => Promise<void>} props.handleRetry - Retry message callback
 * @returns {JSX.Element} - React component
 */
export function MessageList({
  messages,
  isAssistantResponding,
  handleRetry,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [showStillThinking, setShowStillThinking] = useState(false);

  // Show "Still thinking..." after a delay of no streaming updates.
  // Resets on every messages change, so it re-triggers between tool calls.
  useEffect(() => {
    if (!isAssistantResponding) {
      setShowStillThinking(false);

      return;
    }

    setShowStillThinking(false);

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

  // Find the previous user message index for retry
  const findPreviousUserMessageIndex = (currentIdx: number): number => {
    for (let i = currentIdx - 1; i >= 0; i--) {
      if (messages[i]?.role === "user") {
        return i;
      }
    }

    return -1;
  };

  return (
    <div className="p-4 space-y-4" data-testid="message-list">
      {messages.map((message, originalIdx) => {
        // Skip messages without content
        if (!hasContent(message)) {
          return null;
        }

        const canRetry = message.role === "model" && !isAssistantResponding;

        const previousUserMessageIdx = canRetry
          ? findPreviousUserMessageIndex(originalIdx)
          : -1;

        const isUser = message.role === "user";
        const showRetry = canRetry && previousUserMessageIdx >= 0;
        const timestamp = (
          <div
            className="text-[9px] leading-tight text-gray-300 dark:text-gray-600 whitespace-nowrap"
            data-testid="message-timestamp"
          >
            <div>{formatTimestampDate(message.timestamp)}</div>
            <div>{formatTimestampTime(message.timestamp)}</div>
          </div>
        );

        return (
          <div
            key={originalIdx}
            className={`flex items-start gap-2 ${isUser ? "justify-end" : ""}`}
          >
            {isUser ? (
              timestamp
            ) : (
              <div className="order-last ml-auto flex flex-col items-start self-stretch">
                {timestamp}
                {showRetry && (
                  <div className="mt-auto">
                    <RetryButton
                      onClick={() => void handleRetry(previousUserMessageIdx)}
                    />
                  </div>
                )}
              </div>
            )}
            <div
              className={`${
                isUser
                  ? "text-black bg-blue-100 dark:text-white dark:bg-blue-900"
                  : "bg-gray-100 dark:bg-gray-800"
              } flex-1 min-w-0 rounded-lg py-0.5 px-3`}
              data-testid={isUser ? undefined : "assistant-message-bubble"}
            >
              {!isUser && (
                <AssistantMessage
                  parts={message.parts}
                  isResponding={isAssistantResponding}
                />
              )}
              {isUser && (
                <div
                  className="prose dark:prose-invert prose-sm max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: marked(formatUserContent(message)) as string,
                  }}
                />
              )}
            </div>
          </div>
        );
      })}

      {isAssistantResponding && (
        <>
          {showStillThinking && (
            <div className="text-center text-sm text-gray-400 animate-pulse">
              Still thinking...
            </div>
          )}
          <ActivityIndicator />
        </>
      )}

      <div ref={messagesEndRef} />
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
 * Formats user message content as string
 * @param {UIMessage} message - User message to format
 * @returns {JSX.Element} - React component
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
