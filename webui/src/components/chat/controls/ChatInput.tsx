import { useState } from "preact/hooks";

interface ChatInputProps {
  handleSend: (message: string) => Promise<void>;
  isAssistantResponding: boolean;
  onStop: () => void;
  thinking: string;
  temperature: number;
}

/**
 * Input component for chat messages
 * @param {ChatInputProps} props - Component props
 * @param {(message: string) => Promise<void>} props.handleSend - Callback to send message
 * @param {boolean} props.isAssistantResponding - Whether assistant is currently responding
 * @param {() => void} props.onStop - Callback to stop assistant response
 * @param {string} props.thinking - Thinking mode for display
 * @param {number} props.temperature - Temperature for display
 * @returns {JSX.Element} - React component
 */
export function ChatInput({
  handleSend,
  isAssistantResponding,
  onStop,
  thinking,
  temperature,
}: ChatInputProps) {
  const [input, setInput] = useState("");

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();

      if (!isAssistantResponding && input.trim()) {
        void handleSend(input);
        setInput("");
      }
    }
  };

  const handleSendClick = () => {
    void handleSend(input);
    setInput("");
  };

  return (
    <div className="border-t border-gray-300 dark:border-gray-700 p-4">
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        Thinking: {thinking} • {Math.round((temperature / 2) * 100)}% random
      </div>
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
  );
}
