import { marked } from "marked";

interface AssistantTextProps {
  content: string;
}

/**
 * Renders assistant text content with markdown
 * @param {AssistantTextProps} root0 - Component props
 * @param {string} root0.content - Markdown content to render
 */
export function AssistantText({ content }: AssistantTextProps) {
  return (
    <div
      className="prose dark:prose-invert prose-sm max-w-none"
      dangerouslySetInnerHTML={{
        __html: marked(content) as string,
      }}
    />
  );
}
