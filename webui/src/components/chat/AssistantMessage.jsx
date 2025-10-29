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
              className={`p-2 text-xs bg-gray-200 dark:bg-gray-700 rounded border-l-3 border-green-500 ${
                part.isOpen ? "animate-pulse" : ""
              }`}
              open={part.isOpen}
            >
              <summary
                className="font-semibold truncate"
                dangerouslySetInnerHTML={{
                  __html: part.isOpen
                    ? "💭 Thinking..."
                    : marked.parseInline(
                        `💭 Thought about: ${part.content.trim().split("\n")[0]}`,
                      ),
                }}
              />
              <div
                className="pt-2 text-xs prose dark:prose-invert prose-sm max-w-none"
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
            <details
              key={i}
              className={`text-xs p-2 font-mono bg-gray-200 dark:bg-gray-900 rounded ${
                part.result ? "" : "animate-pulse"
              } ${part.isError ? "border-l-3 border-red-500" : ""}`}
            >
              <summary>
                &nbsp;🔧{" "}
                {!part.result
                  ? "using tool: "
                  : part.isError
                    ? "tool failed: "
                    : "used tool: "}
                {toolNames[part.name] ?? part.name}
              </summary>
              <div className="mt-1 p-1 break-all text-gray-500 dark:text-gray-500">
                {part.name}({JSON.stringify(part.args, null, 0)})
              </div>
              {part.result && (
                <details>
                  <summary
                    className={`px-2 my-1 truncate ${part.isError ? "text-red-700 dark:text-red-400" : "text-gray-600 dark:text-gray-400"}`}
                  >
                    &nbsp;↳ {part.result}
                  </summary>
                  <div className="mt-1 p-1 break-all text-gray-500 dark:text-gray-500">
                    <FullResultDetails result={part.result} />
                  </div>
                </details>
              )}
            </details>
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

function FullResultDetails({ result }) {
  let s = `${result}`;
  if (s.startsWith("{")) {
    try {
      const obj = JSON.parse(s);
      return (
        <pre className="whitespace-pre-wrap">
          {JSON.stringify(obj, null, 2).replaceAll("\\n", "\n")}
        </pre>
      );
    } catch {}
  }
  return <>{s}</>;
}
