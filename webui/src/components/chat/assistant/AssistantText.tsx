import { marked } from "marked";

interface AssistantTextProps {
  content: string;
}

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
