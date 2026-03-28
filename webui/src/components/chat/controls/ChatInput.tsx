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
  onStop: () => void;
}

/**
 * Input component for chat messages.
 * When the AI is responding, messages are queued instead of sent directly.
 * @param props - Component props
 * @param props.handleSend - Callback to send message directly
 * @param props.onEnqueue - Callback to queue message while AI is responding
 * @param props.isAssistantResponding - Whether assistant is currently responding
 * @param props.onStop - Callback to stop assistant response
 * @param props.thinking - Current thinking mode
 * @param props.onThinkingChange - Callback for thinking change
 * @returns Chat input element
 */
export function ChatInput({
  handleSend,
  onEnqueue,
  isAssistantResponding,
  onStop,
  thinking,
  onThinkingChange,
}: ChatInputProps) {
  const [input, setInput] = useState("");

  const submitMessage = () => {
    if (!input.trim()) return;

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
    <div className="border-t border-zinc-300 dark:border-zinc-700 shadow-[0_-2px_8px_-2px_rgba(0,0,0,0.08)] dark:shadow-[0_-2px_8px_-2px_rgba(0,0,0,0.3)] relative z-10">
      <div className="p-4">
        <div className="flex gap-3">
          <textarea
            value={input}
            onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Shift+Enter for new line)"
            className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg shadow-inner resize-none placeholder:dark:text-zinc-400 placeholder:text-zinc-500"
            rows={2}
          />
          <div className="flex flex-col gap-2">
            {isAssistantResponding ? (
              <button
                onClick={onStop}
                className="px-4 py-1 rounded-lg text-sm bg-orange-600 text-white hover:bg-orange-700"
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
              disabled={!input.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-700"
            >
              {isAssistantResponding ? "Queue" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
