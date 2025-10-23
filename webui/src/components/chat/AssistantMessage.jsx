import { marked } from "marked";
import { toolNames } from "../../config";

export function AssistantMessage({ parts }) {
  return (
    <div className="flex flex-col gap-3 pt-2 pb-1">
      {parts?.map((part, i) => {
        if (part.type === "thought") {
          return (
            <details
              key={i}
              className="p-2 bg-gray-200 dark:bg-gray-700 rounded text-xs border-l-3 border-green-500"
              open={part.isOpen}
            >
              <summary
                className={`font-semibold truncate ${part.isOpen ? "animate-pulse" : ""}`}
                dangerouslySetInnerHTML={{
                  __html: part.isOpen
                    ? "💭 Thinking..."
                    : marked.parseInline(
                        `💭 Thought about: ${part.content.trim().split("\n")[0]}`,
                      ),
                }}
              />
              <div
                className="pt-2 prose dark:prose-invert prose-sm text-xs max-w-none"
                dangerouslySetInnerHTML={{
                  __html: part.isOpen
                    ? marked(part.content.trim())
                    : marked(
                        part.content.trim().split("\n").slice(1).join("\n"),
                      ),
                }}
              />
            </details>
          );
        } else if (part.type === "tool") {
          return (
            <div key={i}>
              <div className="text-xs p-2 font-mono bg-gray-200 dark:bg-gray-900 rounded">
                <details>
                  <summary className={`${part.result ? "" : "animate-pulse"}`}>
                    &nbsp;🔧 {part.result ? "used tool: " : "using tool: "}
                    {toolNames[part.name] ?? part.name}
                  </summary>
                  <div className="mt-1 p-1 break-all text-gray-500 dark:text-gray-500">
                    {part.name}({JSON.stringify(part.args, null, 0)})
                  </div>
                  {part.result && (
                    <details>
                      <summary className="px-2 my-1 truncate text-gray-600 dark:text-gray-400">
                        &nbsp;↳ {part.result}
                      </summary>
                      <div className="mt-1 p-1 break-all text-gray-500 dark:text-gray-500">
                        {part.result}
                      </div>
                    </details>
                  )}
                </details>
              </div>
            </div>
          );
        } else if (part.type === "text") {
          return (
            <div
              key={i}
              className="prose dark:prose-invert prose-sm max-w-none"
              dangerouslySetInnerHTML={{
                __html: marked(part.content),
              }}
            />
          );
        }
        return null;
      })}
    </div>
  );
}
