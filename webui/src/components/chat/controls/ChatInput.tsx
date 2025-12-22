import { useState } from "preact/hooks";
import type { Provider } from "../../../types/settings";
import { MessageSettingsToolbar } from "./MessageSettingsToolbar";

interface ChatInputProps {
  handleSend: (
    message: string,
    options?: { thinking?: string; temperature?: number },
  ) => Promise<void>;
  isAssistantResponding: boolean;
  onStop: () => void;
  provider: Provider;
  model: string;
  defaultThinking: string;
  defaultTemperature: number;
}

/**
 * Input component for chat messages
 * @param {ChatInputProps} root0 - Component props
 * @param {(message: string) => Promise<void>} root0.handleSend - Callback to send message
 * @param {boolean} root0.isAssistantResponding - Whether assistant is currently responding
 * @param {() => void} root0.onStop - Callback to stop assistant response
 * @returns {JSX.Element} - React component
 */
export function ChatInput({
  handleSend,
  isAssistantResponding,
  onStop,
  provider,
  model,
  defaultThinking,
  defaultTemperature,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(defaultThinking);
  const [temperature, setTemperature] = useState(defaultTemperature);

  const handleResetToDefaults = () => {
    setThinking(defaultThinking);
    setTemperature(defaultTemperature);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();

      if (!isAssistantResponding && input.trim()) {
        void handleSend(input, { thinking, temperature });
        setInput("");
      }
    }
  };

  const handleSendClick = () => {
    void handleSend(input, { thinking, temperature });
    setInput("");
  };

  return (
    <div className="border-t border-gray-300 dark:border-gray-700">
      <MessageSettingsToolbar
        provider={provider}
        model={model}
        defaultThinking={defaultThinking}
        defaultTemperature={defaultTemperature}
        thinking={thinking}
        temperature={temperature}
        onThinkingChange={setThinking}
        onTemperatureChange={setTemperature}
        onResetToDefaults={handleResetToDefaults}
      />
      <div className="p-4">
        <div className="flex gap-3">
          <textarea
            value={input}
            onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Shift+Enter for new line)"
            className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded resize-none placeholder:dark:text-gray-400 placeholder:text-gray-500"
            rows={2}
          />
          <div className="flex flex-col gap-2">
            <button
              onClick={onStop}
              disabled={!isAssistantResponding}
              className={`px-4 py-1 rounded text-sm ${isAssistantResponding ? "bg-orange-600 text-white hover:bg-orange-700" : "invisible"}`}
            >
              Stop
            </button>
            <button
              onClick={handleSendClick}
              disabled={isAssistantResponding || !input.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50 hover:bg-blue-700"
            >
              {isAssistantResponding ? "..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
