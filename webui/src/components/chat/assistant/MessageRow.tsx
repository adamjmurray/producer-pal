// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { type VNode } from "preact";
import { isModelMismatch } from "#webui/chat/helpers/model-identity";
import { type TokenUsage } from "#webui/chat/sdk/types";
import { CompactButton } from "#webui/components/chat/controls/CompactButton";
import { RetryButton } from "#webui/components/chat/controls/RetryButton";
import { EditButton } from "#webui/components/chat/EditButton";
import { UserMessageEditor } from "#webui/components/chat/UserMessageEditor";
import { ErrorBoundary } from "#webui/components/ErrorBoundary";
import {
  calcNewContentTokens,
  compactNumber,
} from "#webui/lib/utils/compact-number";
import {
  formatTimestampDate,
  formatTimestampTime,
} from "#webui/lib/utils/format-timestamp";
import { type UIMessage } from "#webui/types/messages";
import { AssistantMessage } from "./AssistantMessage";
import { RenderErrorFallback, SafeMarkdown } from "./message-list-helpers";

interface MessageRowProps {
  message: UIMessage;
  originalIdx: number;
  messages: UIMessage[];
  isAssistantResponding: boolean;
  showTimestamps: boolean;
  showTokenUsage: boolean;
  requestedModel?: string | null;
  handleRetry: (messageIndex: number) => Promise<void>;
  handleEdit: (messageIndex: number, newMessage: string) => Promise<void>;
  handleCompact?: (messageIndex: number) => Promise<void>;
  editingIndex: number | null;
  setEditingIndex: (index: number | null) => void;
  editText: string;
  setEditText: (text: string) => void;
}

/**
 * Renders a single chat row, delegating to the user or assistant variant.
 * @param {MessageRowProps} props - Row props
 * @returns {JSX.Element} The rendered row
 */
export function MessageRow(props: MessageRowProps) {
  return props.message.role === "user" ? (
    <UserRow {...props} />
  ) : (
    <AssistantRow {...props} />
  );
}

/**
 * Renders a user message bubble with timestamp and edit affordance.
 * @param {MessageRowProps} props - Row props
 * @returns {JSX.Element} The user row
 */
function UserRow({
  message,
  originalIdx,
  showTimestamps,
  isAssistantResponding,
  handleEdit,
  editingIndex,
  setEditingIndex,
  editText,
  setEditText,
}: MessageRowProps) {
  const isEditing = editingIndex === originalIdx;
  const canEdit = !isAssistantResponding;
  const timestamp = renderTimestamp(message.timestamp, showTimestamps);

  return (
    <>
      {timestamp}
      <div className="text-black bg-blue-100 dark:text-white dark:bg-blue-900/80 shadow-sm dark:shadow-white/10 dark:border dark:border-blue-700/40 min-w-0 rounded-lg py-0.5 px-3">
        {isEditing ? (
          <UserMessageEditor
            text={editText}
            onTextChange={setEditText}
            onSave={() => {
              void handleEdit(originalIdx, editText);
              setEditingIndex(null);
            }}
            onCancel={() => setEditingIndex(null)}
          />
        ) : (
          <ErrorBoundary fallback={<RenderErrorFallback />}>
            <SafeMarkdown content={formatUserContent(message)} />
          </ErrorBoundary>
        )}
      </div>
      {canEdit && !isEditing ? (
        <EditButton
          onClick={() => {
            setEditingIndex(originalIdx);
            setEditText(formatUserContent(message));
          }}
        />
      ) : (
        <div />
      )}
    </>
  );
}

/**
 * Renders an assistant message bubble with the retry/compact gutter.
 * @param {MessageRowProps} props - Row props
 * @returns {JSX.Element} The assistant row
 */
function AssistantRow({
  message,
  originalIdx,
  messages,
  isAssistantResponding,
  showTimestamps,
  showTokenUsage,
  requestedModel,
  handleRetry,
  handleCompact,
}: MessageRowProps) {
  const canRetry = !isAssistantResponding;
  const previousUserMessageIdx = canRetry
    ? findPreviousUserMessageIndex(messages, originalIdx)
    : -1;
  const timestamp = renderTimestamp(message.timestamp, showTimestamps);
  const prevModelUsage = getPrevModelUsage(messages, originalIdx);

  return (
    <>
      <div
        className="col-span-2 bg-zinc-50 dark:bg-zinc-800 shadow-sm dark:shadow-white/10 dark:border dark:border-zinc-700 min-w-0 rounded-lg py-0.5 px-3"
        data-testid="assistant-message-bubble"
      >
        <ErrorBoundary fallback={<RenderErrorFallback />}>
          <AssistantBubble
            message={message}
            isAssistantResponding={isAssistantResponding}
            showTokenUsage={showTokenUsage}
            requestedModel={requestedModel}
            prevModelUsage={prevModelUsage}
          />
        </ErrorBoundary>
      </div>
      <RightGutter
        timestamp={timestamp}
        showRetry={canRetry && previousUserMessageIdx >= 0}
        onRetry={() => void handleRetry(previousUserMessageIdx)}
        showCompact={canRetry && handleCompact != null}
        onCompact={() => {
          if (handleCompact) void handleCompact(originalIdx);
        }}
      />
    </>
  );
}

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

/**
 * Right gutter for AI messages: timestamp at top, compact + retry at bottom.
 * @param props - Component props
 * @param props.timestamp - Timestamp element
 * @param props.showRetry - Whether to show retry button
 * @param props.onRetry - Retry callback
 * @param props.showCompact - Whether to show the compact button
 * @param props.onCompact - Compact-up-to-here callback
 * @returns Gutter element
 */
function RightGutter({
  timestamp,
  showRetry,
  onRetry,
  showCompact,
  onCompact,
}: {
  timestamp: VNode;
  showRetry: boolean;
  onRetry: () => void;
  showCompact: boolean;
  onCompact: () => void;
}) {
  return (
    <div className="flex flex-col items-start self-stretch">
      {timestamp}
      {(showCompact || showRetry) && (
        <div className="mt-auto flex flex-col">
          {showCompact && <CompactButton onClick={onCompact} />}
          {showRetry && <RetryButton onClick={onRetry} />}
        </div>
      )}
    </div>
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
 * Renders a timestamp element for a message.
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
 * Finds previous user message index for retry.
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
 * Formats user message content as string.
 * @param {UIMessage} message - User message to format
 * @returns {string} Concatenated text content
 */
function formatUserContent(message: UIMessage): string {
  return message.parts
    .map((part) => ("content" in part ? part.content : ""))
    .join("");
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
