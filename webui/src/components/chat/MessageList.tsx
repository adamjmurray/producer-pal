import { useEffect, useRef } from "preact/hooks";
import type { UIMessage } from "../../types/messages.js";
import { ActivityIndicator } from "./ActivityIndicator.jsx";
import { AssistantMessage } from "./assistant/AssistantMessage.jsx";
import { RetryButton } from "./RetryButton.jsx";

interface MessageListProps {
  messages: UIMessage[];
  isAssistantResponding: boolean;
  handleRetry: (messageIndex: number) => Promise<void>;
}

/**
 *
 * @param root0
 * @param root0.messages
 * @param root0.isAssistantResponding
 * @param root0.handleRetry
 */
export function MessageList({
  messages,
  isAssistantResponding,
  handleRetry,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Find the previous user message index for retry
  const findPreviousUserMessageIndex = (currentIdx: number): number => {
    for (let i = currentIdx - 1; i >= 0; i--) {
      if (messages[i]?.role === "user") {
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
          <div
            key={idx}
            className={message.role === "model" ? "flex items-end gap-2" : ""}
          >
            <div
              className={`${
                message.role === "user"
                  ? "ml-auto text-black bg-blue-100 dark:text-white dark:bg-blue-900"
                  : "bg-gray-100 dark:bg-gray-800"
              } ${message.role === "model" ? "flex-1" : ""} rounded-lg py-0.5 px-3 max-w-[90%]`}
            >
              {message.role === "model" && (
                <AssistantMessage
                  parts={message.parts}
                  isResponding={isAssistantResponding}
                />
              )}
              {message.role === "user" && (
                <div className="prose dark:prose-invert prose-sm">
                  {formatUserContent(message)}
                </div>
              )}
            </div>
            {canRetry && previousUserMessageIdx >= 0 && (
              <RetryButton
                onClick={() => void handleRetry(previousUserMessageIdx)}
              />
            )}
          </div>
        );
      })}

      {isAssistantResponding && <ActivityIndicator />}

      <div ref={messagesEndRef} />
    </div>
  );
}

function hasContent(message: UIMessage): boolean {
  return message.parts.length > 0;
}

function formatUserContent(message: UIMessage): string {
  return message.parts
    .map((part) => {
      if ("content" in part) {
        return part.content;
      }
      return "";
    })
    .join("");
}
