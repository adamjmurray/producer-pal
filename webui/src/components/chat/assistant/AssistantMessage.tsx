import type { UIPart } from "../../../types/messages.js";
import { AssistantError } from "./AssistantError.jsx";
import { AssistantText } from "./AssistantText.jsx";
import { AssistantThought } from "./AssistantThought.jsx";
import { AssistantToolCall } from "./AssistantToolCall.jsx";

interface AssistantMessageProps {
  parts: UIPart[];
  isResponding?: boolean;
}

/**
 *
 * @param root0
 * @param root0.parts
 * @param root0.isResponding
 */
export function AssistantMessage({
  parts,
  isResponding,
}: AssistantMessageProps) {
  return (
    <div className="flex flex-col gap-3 py-2">
      {parts.map((part, i) => {
        if (part.type === "thought") {
          return (
            <AssistantThought
              key={i}
              content={part.content}
              isOpen={part.isOpen}
              isResponding={isResponding}
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
        }
        // TypeScript has narrowed this to UIErrorPart
        return <AssistantError key={i} content={part.content} />;
      })}
    </div>
  );
}
