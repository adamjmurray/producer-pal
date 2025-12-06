import type { UIPart } from "#webui/types/messages";
import { AssistantError } from "./AssistantError";
import { AssistantText } from "./AssistantText";
import { AssistantThought } from "./AssistantThought";
import { AssistantToolCall } from "./AssistantToolCall";

interface AssistantMessageProps {
  parts: UIPart[];
  isResponding?: boolean;
}

/**
 * Renders assistant message with multiple part types
 * @param {AssistantMessageProps} root0 - Component props
 * @param {UIPart[]} root0.parts - Message parts to render
 * @param {boolean} [root0.isResponding] - Whether assistant is currently responding
 * @returns {JSX.Element} - React component
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
