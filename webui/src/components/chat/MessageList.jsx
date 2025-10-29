import { useEffect, useRef } from "preact/hooks";
import { ActivityIndicator } from "./ActivityIndicator.jsx";
import { AssistantMessage } from "./AssistantMessage.jsx";

export function MessageList({ messages, isAssistantResponding }) {
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="p-4 space-y-4">
      {messages.filter(hasContent).map((message, idx) => (
        <div
          key={idx}
          className={`${
            message.role === "user"
              ? "ml-auto text-black bg-blue-100 dark:text-white dark:bg-blue-900"
              : message.role === "error"
                ? "bg-red-600 text-white"
                : "bg-gray-100 dark:bg-gray-800"
          } rounded-lg py-0.5 px-3 max-w-[90%]`}
        >
          {message.role === "model" && (
            <AssistantMessage parts={message.parts} />
          )}
          {(message.role === "user" || message.role === "error") && (
            <div className="prose dark:prose-invert prose-sm">
              {formatUserAndErrorContent(message)}
            </div>
          )}
        </div>
      ))}

      {isAssistantResponding && <ActivityIndicator />}

      <div ref={messagesEndRef} />
    </div>
  );
}

function hasContent(message) {
  return (message.parts ?? []).length > 0 || (message.content ?? "").length > 0;
}

function formatUserAndErrorContent(message) {
  return (message.parts ?? []).map(({ content }) => content ?? "").join("");
}
