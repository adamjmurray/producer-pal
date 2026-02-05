// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { marked } from "marked";

interface AssistantTextProps {
  content: string;
}

/**
 * Renders assistant text content with markdown
 * @param {AssistantTextProps} root0 - Component props
 * @param {string} root0.content - Markdown content to render
 * @returns {JSX.Element} - React component
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
