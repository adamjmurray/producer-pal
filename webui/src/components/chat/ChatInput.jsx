import { useState } from "preact/hooks";

export function ChatInput({ handleSend, isAssistantResponding }) {
  const [input, setInput] = useState("");

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
      setInput("");
    }
  };

  const handleSendClick = () => {
    handleSend(input);
    setInput("");
  };

  return (
    <div className="border-t border-gray-300 dark:border-gray-700 p-4">
      <div className="flex gap-2">
        <textarea
          value={input}
          onInput={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isAssistantResponding}
          placeholder="Type a message... (Shift+Enter for new line)"
          className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded resize-none placeholder:dark:text-gray-400 placeholder:text-gray-500"
          rows="2"
        />
        <button
          onClick={handleSendClick}
          disabled={isAssistantResponding || !input.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50 hover:bg-blue-700"
        >
          {isAssistantResponding ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
