// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";
import { type MessageOverrides } from "#webui/hooks/chat/use-chat-types";
import {
  MessageSettingsToolbar,
  type MessageSettingsToolbarProps,
} from "./MessageSettingsToolbar";

interface ChatInputProps extends MessageSettingsToolbarProps {
  handleSend: (message: string, options?: MessageOverrides) => Promise<void>;
  isAssistantResponding: boolean;
  onStop: () => void;
}

/**
 * Input component for chat messages
 * @param {ChatInputProps} props - Component props
 * @param {(message: string) => Promise<void>} props.handleSend - Callback to send message
 * @param {boolean} props.isAssistantResponding - Whether assistant is currently responding
 * @param {() => void} props.onStop - Callback to stop assistant response
 * @param {Provider} props.provider - Current provider
 * @param {string} props.model - Current model
 * @param {string} props.defaultThinking - Default thinking mode from settings
 * @param {string} props.thinking - Current thinking mode
 * @param {Function} props.onThinkingChange - Callback for thinking change
 * @param {Function} props.onResetToDefaults - Callback to reset to defaults
 * @returns {JSX.Element} - React component
 */
export function ChatInput({
  handleSend,
  isAssistantResponding,
  onStop,
  provider,
  model,
  defaultThinking,
  thinking,
  onThinkingChange,
  onResetToDefaults,
}: ChatInputProps) {
  const [input, setInput] = useState("");

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();

      if (!isAssistantResponding && input.trim()) {
        void handleSend(input, { thinking });
        setInput("");
      }
    }
  };

  const handleSendClick = () => {
    void handleSend(input, { thinking });
    setInput("");
  };

  return (
    <div className="border-t border-zinc-300 dark:border-zinc-700 shadow-[0_-2px_8px_-2px_rgba(0,0,0,0.08)] dark:shadow-[0_-2px_8px_-2px_rgba(0,0,0,0.3)] relative z-10">
      <MessageSettingsToolbar
        provider={provider}
        model={model}
        defaultThinking={defaultThinking}
        thinking={thinking}
        onThinkingChange={onThinkingChange}
        onResetToDefaults={onResetToDefaults}
      />
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
            <button
              onClick={onStop}
              disabled={!isAssistantResponding}
              className={`px-4 py-1 rounded-lg text-sm ${isAssistantResponding ? "bg-orange-600 text-white hover:bg-orange-700" : "invisible"}`}
            >
              Stop
            </button>
            <button
              onClick={handleSendClick}
              disabled={isAssistantResponding || !input.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-700"
            >
              {isAssistantResponding ? "..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
