import { marked } from "marked";

interface AssistantTextProps {
  content: string;
}

/**
 *
 * @param root0
 * @param root0.content
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
