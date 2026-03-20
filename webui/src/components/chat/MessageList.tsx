// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { Fragment, type VNode } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { isModelMismatch } from "#webui/chat/helpers/model-identity";
import { type TokenUsage } from "#webui/chat/sdk/types";
import {
  calcNewContentTokens,
  compactNumber,
} from "#webui/lib/utils/compact-number";
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
  showTokenUsage: boolean;
  requestedModel?: string | null;
}

/**
 * List of chat messages with auto-scroll
 * @param {MessageListProps} root0 - Component props
 * @param {UIMessage[]} root0.messages - Chat messages
 * @param {boolean} root0.isAssistantResponding - Whether assistant is responding
 * @param {Function} root0.handleRetry - Retry callback
 * @param {Function} root0.handleEdit - Edit and fork callback
 * @param {boolean} root0.showTimestamps - Whether to show timestamps
 * @param {string} [root0.requestedModel] - Requested model ID for mismatch detection
 * @returns {JSX.Element} Message list
 */
export function MessageList({
  messages,
  isAssistantResponding,
  handleRetry,
  handleEdit,
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

        const isUser = message.role === "user";
        const canRetry = message.role === "model" && !isAssistantResponding;
        const previousUserMessageIdx = canRetry
          ? findPreviousUserMessageIndex(messages, originalIdx)
          : -1;
        const showRetry = canRetry && previousUserMessageIdx >= 0;
        const canEdit = isUser && !isAssistantResponding;
        const isEditing = editingIndex === originalIdx;
        const timestamp = renderTimestamp(message.timestamp, showTimestamps);
        const prevModelUsage = !isUser
          ? getPrevModelUsage(messages, originalIdx)
          : undefined;

        return (
          <Fragment key={originalIdx}>
            {isUser && timestamp}
            <div
              className={`${
                isUser
                  ? "text-black bg-blue-100 dark:text-white dark:bg-blue-900/80 shadow-sm dark:shadow-white/10 dark:border dark:border-blue-700/40"
                  : "col-span-2 bg-zinc-50 dark:bg-zinc-800 shadow-sm dark:shadow-white/10 dark:border dark:border-zinc-700"
              } min-w-0 rounded-lg py-0.5 px-3`}
              data-testid={isUser ? undefined : "assistant-message-bubble"}
            >
              {!isUser && (
                <AssistantBubble
                  message={message}
                  isAssistantResponding={isAssistantResponding}
                  showTokenUsage={showTokenUsage}
                  requestedModel={requestedModel}
                  prevModelUsage={prevModelUsage}
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
 * Checks if message has any parts to display. This checks for the presence of
 * parts, not whether parts have non-empty content — messages with parts: []
 * are system messages that shouldn't be rendered.
 * @param {UIMessage} message - Message to check
 * @returns {boolean} Whether the message has displayable parts
 */
/**
 * Renders assistant message content with model mismatch label and usage.
 * @param props - Component props
 * @param props.message - The model message
 * @param props.isAssistantResponding - Whether assistant is responding
 * @param props.showTokenUsage - Whether to show token usage
 * @param props.requestedModel - Requested model for mismatch detection
 * @param props.prevModelUsage - Previous model message's last usage
 * @returns Assistant bubble content
 */
function AssistantBubble({
  message,
  isAssistantResponding,
  showTokenUsage,
  requestedModel,
  prevModelUsage,
}: {
  message: UIMessage;
  isAssistantResponding: boolean;
  showTokenUsage: boolean;
  requestedModel?: string | null;
  prevModelUsage?: TokenUsage;
}) {
  return (
    <>
      <ModelMismatchLabel
        requestedModel={requestedModel}
        responseModel={message.responseModel}
      />
      <AssistantMessage
        parts={message.parts}
        isResponding={isAssistantResponding}
        showTokenUsage={showTokenUsage}
        prevStepUsage={prevModelUsage}
      />
      {showTokenUsage && (
        <TokenUsageLabel
          usage={message.usage}
          prevUsage={getLastStepUsage(message) ?? prevModelUsage}
        />
      )}
    </>
  );
}

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
      className={`text-[9px] leading-tight text-zinc-400 dark:text-zinc-600 whitespace-nowrap ${visible ? "" : "invisible"}`}
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

/**
 * Shows a label when the API responded with a different model than requested.
 * @param props - Component props
 * @param props.requestedModel - Model ID that was requested
 * @param props.responseModel - Model ID from the API response
 * @returns Label element or null
 */
function ModelMismatchLabel({
  requestedModel,
  responseModel,
}: {
  requestedModel?: string | null;
  responseModel?: string;
}) {
  if (!responseModel || !requestedModel) return null;
  if (!isModelMismatch(requestedModel, responseModel)) return null;

  return (
    <div className="text-xs text-zinc-400 dark:text-zinc-500 pt-1 text-right">
      responded as {responseModel}
    </div>
  );
}

/**
 * Compact token usage display for assistant messages.
 * @param props - Component props
 * @param props.usage - Token usage data
 * @param props.prevUsage - Previous step's usage for new content calculation
 * @returns Label element or null
 */
function TokenUsageLabel({
  usage,
  prevUsage,
}: {
  usage?: TokenUsage;
  prevUsage?: TokenUsage;
}) {
  if (!usage) return null;

  const newContent = calcNewContentTokens(
    usage.inputTokens ?? 0,
    prevUsage?.inputTokens,
    prevUsage?.outputTokens,
  );

  return (
    <div className="text-xs text-zinc-400 dark:text-zinc-500 pb-1 text-right">
      tokens: {compactNumber(usage.inputTokens ?? 0)}
      {newContent != null && ` (${compactNumber(newContent)} new)`} →{" "}
      {compactNumber(usage.outputTokens ?? 0)}
      {(usage.reasoningTokens ?? 0) > 0 &&
        ` (${compactNumber(usage.reasoningTokens ?? 0)} reasoning)`}
    </div>
  );
}

/**
 * Get the last usage from the previous model message.
 * @param messages - All messages
 * @param currentIdx - Current message index
 * @returns Previous model message's last usage
 */
function getPrevModelUsage(
  messages: UIMessage[],
  currentIdx: number,
): TokenUsage | undefined {
  for (let i = currentIdx - 1; i >= 0; i--) {
    const msg = messages[i];

    if (msg?.role !== "model") continue;

    return getLastStepUsage(msg) ?? msg.usage;
  }

  return undefined;
}

/**
 * Get the last step-usage part's usage within a message.
 * @param message - Message to search
 * @returns Last step-usage part's usage, or undefined
 */
function getLastStepUsage(message: UIMessage): TokenUsage | undefined {
  const part = message.parts.findLast((p) => p.type === "step-usage");

  if (part?.type === "step-usage") return part.usage;

  return undefined;
}
