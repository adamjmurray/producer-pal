import { AssistantError } from "./AssistantError.jsx";
import { AssistantText } from "./AssistantText.jsx";
import { AssistantThought } from "./AssistantThought.jsx";
import { AssistantToolCall } from "./AssistantToolCall.jsx";
import type { UIPart } from "../../../types/messages.js";

interface AssistantMessageProps {
  parts: UIPart[];
}

export function AssistantMessage({ parts }: AssistantMessageProps) {
  return (
    <div className="flex flex-col gap-3 pt-2 pb-1">
      {parts?.map((part, i) => {
        if (part.type === "thought") {
          return (
            <AssistantThought
              key={i}
              content={part.content}
              isOpen={part.isOpen}
            />
          );
        } else if (part.type === "tool") {
          return (
            <AssistantToolCall
              key={i}
              name={part.name}
              args={part.args}
              result={part.result}
              isError={part.isError}
            />
          );
        } else if (part.type === "text") {
          return <AssistantText key={i} content={part.content} />;
        } else if (part.type === "error") {
          return <AssistantError key={i} content={part.content} />;
        }
        // TypeScript exhaustiveness check: this should never be reached
        const _exhaustiveCheck: never = part;
        return (
          <details className="p-2 text-xs bg-gray-200 dark:bg-gray-900 rounded">
            <summary className="font-semibold text-red-700 dark:text-red-400">
              Unexpected message part type "{(part as UIPart).type}"
            </summary>
            <pre className="whitespace-pre-wrap text-xs text-gray-500 dark:text-gray-500">
              {JSON.stringify(_exhaustiveCheck, null, 2)}
            </pre>
          </details>
        );
      })}
    </div>
  );
}
