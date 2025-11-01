import { marked } from "marked";

export function AssistantText({ content }) {
  return (
    <div
      className="prose dark:prose-invert prose-sm max-w-none"
      dangerouslySetInnerHTML={{
        __html: marked(content) as string,
      }}
    />
  );
}
