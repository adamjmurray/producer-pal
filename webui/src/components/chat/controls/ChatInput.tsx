// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";
import { type MessageOverrides } from "#webui/hooks/chat/use-chat-types";
import { ThinkingToggle, type ThinkingToggleProps } from "./ThinkingToggle";

interface ChatInputProps extends ThinkingToggleProps {
  handleSend: (message: string, options?: MessageOverrides) => Promise<void>;
  onEnqueue: (text: string, overrides?: MessageOverrides) => void;
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
  const [input, setInput] = useState("");
  const disabled = hasError || isCompacting === true;
  // Compaction is genuinely non-cancelable (no abort path), so don't offer Stop
  // while it runs — it would be a no-op against the in-flight summarize().
  const canStop = isAssistantResponding && isCompacting !== true;

  const submitMessage = () => {
    if (!input.trim() || disabled) return;

    const overrides: MessageOverrides = { thinking };

    if (isAssistantResponding) {
      onEnqueue(input, overrides);
    } else {
      void handleSend(input, overrides);
    }

    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  };

  return (
    <div className="relative z-10 border-t border-zinc-300 shadow-[0_-2px_8px_-2px_rgba(0,0,0,0.08)] dark:border-zinc-700 dark:shadow-[0_-2px_8px_-2px_rgba(0,0,0,0.3)]">
      <div className="p-4">
        <div className="flex gap-3">
          <textarea
            value={input}
            onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            onKeyDown={handleKeyDown}
            placeholder={
              hasError
                ? "Retry or edit a message to continue..."
                : isCompacting
                  ? "Compacting…"
                  : "Type a message... (Shift+Enter for new line)"
            }
            disabled={disabled}
            className="flex-1 resize-none rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 shadow-inner placeholder:text-zinc-500 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 placeholder:dark:text-zinc-400"
            rows={2}
          />
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
            <button
              onClick={submitMessage}
              disabled={disabled || !input.trim()}
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
