// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useRef, useState } from "preact/hooks";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "#webui/components/markdown-editor/MarkdownEditor";
import {
  ThinkingToggle,
  type ThinkingToggleProps,
} from "#webui/components/chat/controls/ThinkingToggle";
import { useImageAttachments } from "#webui/hooks/chat/helpers/use-image-attachments";
import {
  type EnqueueMessageHandler,
  type MessageOverrides,
  type SendMessageHandler,
} from "#webui/hooks/chat/use-chat-types";
import { AttachImagesButton } from "./AttachImagesButton";
import { ImageAttachments } from "./ImageAttachments";

interface ChatInputProps extends ThinkingToggleProps {
  handleSend: SendMessageHandler;
  onEnqueue: EnqueueMessageHandler;
  isAssistantResponding: boolean;
  /** Conversation ended with an error — user must retry or edit to continue */
  hasError: boolean;
  /**
   * A manual compaction is in progress. compact() reassigns chatHistory
   * mid-flight, and unlike a streaming response it is NOT a queueable state
   * (nothing drains the queue when it ends), so the input is disabled outright
   * until it completes — otherwise a send is silently dropped by handleSend's
   * compaction guard, losing the typed message.
   */
  isCompacting?: boolean;
  onStop: () => void;
}

/**
 * Input component for chat messages.
 * When the AI is responding, messages are queued instead of sent directly.
 * Images can be pasted, dropped on the editor, or picked with the attach
 * button; they ride along with the text (and can be sent on their own).
 * @param props - Component props
 * @param props.handleSend - Callback to send message directly
 * @param props.onEnqueue - Callback to queue message while AI is responding
 * @param props.isAssistantResponding - Whether assistant is currently responding
 * @param props.hasError - Whether conversation ended with an error
 * @param props.isCompacting - Whether a manual compaction is in progress
 * @param props.onStop - Callback to stop assistant response
 * @param props.thinking - Current thinking mode
 * @param props.onThinkingChange - Callback for thinking change
 * @returns Chat input element
 */
export function ChatInput({
  handleSend,
  onEnqueue,
  isAssistantResponding,
  hasError,
  isCompacting,
  onStop,
  thinking,
  onThinkingChange,
}: ChatInputProps) {
  // The editor owns the text; `input` mirrors it for the Send button's state.
  const [input, setInput] = useState("");
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const attachments = useImageAttachments();
  const disabled = hasError || isCompacting === true;
  // Compaction is genuinely non-cancelable (no abort path), so don't offer Stop
  // while it runs — it would be a no-op against the in-flight summarize().
  const canStop = isAssistantResponding && isCompacting !== true;
  // Attached images are a message on their own — a picture with no words still
  // asks the model something.
  const hasContent = input.trim() !== "" || attachments.images.length > 0;

  const submitMessage = () => {
    if (!hasContent || disabled) {
      return;
    }

    const overrides: MessageOverrides = { thinking };
    const message =
      attachments.images.length > 0
        ? { text: input, images: attachments.images }
        : input;

    if (isAssistantResponding) {
      onEnqueue(message, overrides);
    } else {
      void handleSend(message, overrides);
    }

    editorRef.current?.clear();
    attachments.clear();
  };

  return (
    <div className="relative z-10 border-t border-zinc-300 shadow-[0_-2px_8px_-2px_rgba(0,0,0,0.08)] dark:border-zinc-700 dark:shadow-[0_-2px_8px_-2px_rgba(0,0,0,0.3)]">
      <div className="p-4">
        <ImageAttachments
          images={attachments.images}
          notice={attachments.notice}
          onRemove={attachments.removeImage}
        />
        <div className="flex gap-3">
          <div
            className="relative flex min-w-0 flex-1"
            {...attachments.zoneProps}
          >
            <MarkdownEditor
              variant="chat"
              ariaLabel="Message"
              initialValue=""
              onChange={setInput}
              onSubmit={submitMessage}
              editorRef={editorRef}
              placeholder={
                hasError
                  ? "Retry or edit a message to continue..."
                  : isCompacting
                    ? "Compacting…"
                    : "Type a message... (Shift+Enter for new line)"
              }
              disabled={disabled}
              className="flex-1"
            />
            {attachments.dragging && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-blue-500/70 bg-blue-500/10 text-sm font-medium text-blue-700 dark:bg-blue-400/10 dark:text-blue-200">
                Drop images to attach
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {canStop ? (
              <button
                onClick={onStop}
                className="rounded-lg bg-orange-600 px-4 py-1 text-sm text-white hover:bg-orange-700"
              >
                Stop
              </button>
            ) : (
              <ThinkingToggle
                thinking={thinking}
                onThinkingChange={onThinkingChange}
              />
            )}
            <AttachImagesButton
              disabled={disabled}
              onFiles={attachments.addFiles}
            />
            <button
              onClick={submitMessage}
              disabled={disabled || !hasContent}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isAssistantResponding ? "Queue" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
