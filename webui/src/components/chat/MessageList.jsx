import { useEffect, useRef } from "preact/hooks";
import { ActivityIndicator } from "./ActivityIndicator.jsx";
import { AssistantMessage } from "./assistant/AssistantMessage.jsx";
import { RetryButton } from "./RetryButton.jsx";

export function MessageList({ messages, isAssistantResponding, handleRetry }) {
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Find the previous user message index for retry
  const findPreviousUserMessageIndex = (currentIdx) => {
    for (let i = currentIdx - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        return i;
      }
    }
    return -1;
  };

  return (
    <div className="p-4 space-y-4">
      {messages.filter(hasContent).map((message, idx) => {
        const canRetry = message.role === "model" && !isAssistantResponding;

        const previousUserMessageIdx = canRetry
          ? findPreviousUserMessageIndex(idx)
          : -1;

        return (
          <div key={idx}>
            <div
              className={`${
                message.role === "user"
                  ? "ml-auto text-black bg-blue-100 dark:text-white dark:bg-blue-900"
                  : "bg-gray-100 dark:bg-gray-800"
              } rounded-lg py-0.5 px-3 max-w-[90%]`}
            >
              {message.role === "model" && (
                <AssistantMessage parts={message.parts} />
              )}
              {message.role === "user" && (
                <div className="prose dark:prose-invert prose-sm">
                  {formatUserContent(message)}
                </div>
              )}
            </div>
            {canRetry && previousUserMessageIdx >= 0 && (
              <div className="flex justify-start my-2">
                <RetryButton
                  onClick={() => handleRetry(previousUserMessageIdx)}
                />
              </div>
            )}
          </div>
        );
      })}

      {isAssistantResponding && <ActivityIndicator />}

      <div ref={messagesEndRef} />
    </div>
  );
}

function hasContent(message) {
  return (message.parts ?? []).length > 0 || (message.content ?? "").length > 0;
}

function formatUserContent(message) {
  return (message.parts ?? []).map(({ content }) => content ?? "").join("");
}
