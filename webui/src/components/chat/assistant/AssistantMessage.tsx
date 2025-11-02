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
      {parts.map((part, i) => {
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
        } else {
          // TypeScript has narrowed this to UIErrorPart
          return <AssistantError key={i} content={part.content} />;
        }
      })}
    </div>
  );
}
