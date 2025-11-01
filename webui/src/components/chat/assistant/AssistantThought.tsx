import { marked } from "marked";

export function AssistantThought({ content, isOpen }) {
  return (
    <details
      className={`p-2 text-xs bg-gray-200 dark:bg-gray-700 rounded border-l-3 border-green-500 ${
        isOpen ? "animate-pulse" : ""
      }`}
      open={isOpen}
    >
      <summary
        className="font-semibold truncate"
        dangerouslySetInnerHTML={{
          __html: isOpen
            ? "💭 Thinking..."
            : (marked.parseInline(
                `💭 Thought about: ${content.trim().split("\n")[0]}`,
              ) as string),
        }}
      />
      <div
        className="pt-2 text-xs prose dark:prose-invert prose-sm max-w-none"
        dangerouslySetInnerHTML={{
          __html: (isOpen
            ? marked(content.trim())
            : marked(content.trim().split("\n").slice(1).join("\n"))) as string,
        }}
      />
    </details>
  );
}
